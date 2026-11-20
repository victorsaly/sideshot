#!/usr/bin/env node
// SideShot's reminder, for Claude Code (the plugin's hooks/hooks.json runs it after each Bash command).
// Why: an agent asked to "commit and open a PR" is busy with git, and seldom stops to ask whether the change
// wants pictures. After a push, or a pull request opened, this looks at the pull request: when it changes files
// people see and its description has no SideShot table yet, the agent is reminded, and still decides whether the
// change shows on a page. What it decides on is reminderOf, in lib.mjs.
//
// It never fails the command it follows: with no git, no gh (on Azure DevOps, no sign-in), no pull request or input
// it cannot read, it says nothing.
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  azureApiOf,
  azureAuthOf,
  azureBaseOf,
  azureFilesOf,
  azureOf,
  azurePrOf,
  configOf,
  markers,
  ownThreadOf,
  pushOf,
  quietIn,
  reminderOf,
} from './lib.mjs';

const waits = {
  // gh asks GitHub for the pull request; a reminder that takes longer than this is not worth waiting for.
  ask: 10000,
};

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: waits.ask }).trim();

/** On Azure DevOps, this branch's pull request as gh would say it: its files, and SideShot's markers for a body when
 * its comment is already there. Signed in as sideshot.mjs is. */
async function onAzure(azure, root) {
  let auth = azureAuthOf(process.env);
  if (auth === null) {
    // One line of fixed words through a shell: az is az.cmd on Windows, which only a shell runs.
    const token = execSync(
      'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: waits.ask },
    ).trim();
    auth = `Bearer ${token}`;
  }
  const api = azureApiOf(azure, azureBaseOf(process.env));
  const ask = async (path) => {
    const answer = await fetch(`${api}${path}${path.includes('?') ? '&' : '?'}api-version=7.1`, {
      headers: { authorization: auth, accept: 'application/json' },
      signal: AbortSignal.timeout(waits.ask),
    });
    if (!answer.ok) throw new Error(String(answer.status));
    return answer.json();
  };
  const from = encodeURIComponent(`refs/heads/${run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root)}`);
  const id = azurePrOf(await ask(`/pullrequests?searchCriteria.sourceRefName=${from}&searchCriteria.status=active`));
  if (id === null) throw new Error('no pull request');
  const at = `/pullRequests/${id}`;
  const [threads, iterations] = await Promise.all([ask(`${at}/threads`), ask(`${at}/iterations`)]);
  const newest = String(iterations.value.at(-1).id);
  const files = azureFilesOf(await ask(`${at}/iterations/${newest}/changes?$top=2000&$compareTo=0`));
  return { body: ownThreadOf(threads) === null ? '' : markers.start, files };
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = String(input.tool_input?.command ?? '');
  const push = pushOf(command);
  // Most commands are not a push, and some people want no reminder: both are let go before git or gh is asked
  // anything.
  if (push !== null && !quietIn(process.env)) {
    // Where the push was made: the folders the command moved to (cd, git -C), from where it was run.
    const here = resolve(input.cwd || process.cwd(), ...push.dirs.map((d) => d.replace(/^~(?=\/|$)/, homedir())));
    const root = run('git', ['rev-parse', '--show-toplevel'], here);
    let config = {};
    try {
      config = configOf(readFileSync(join(root, '.sideshot.json'), 'utf8'));
    } catch {
      // No .sideshot.json, or one SideShot itself will say is wrong when it runs: remind as for none.
    }
    // The pull request the command named, else the branch's; its files from GitHub, so a base branch never fetched
    // here does not matter.
    let remote = '';
    try {
      remote = run('git', ['remote', 'get-url', 'origin'], root);
    } catch {
      // No origin: gh is asked, as before, and finds the repository its own way.
    }
    const azure = azureOf(remote);
    let body, files;
    if (azure) {
      ({ body, files } = await onAzure(azure, root));
    } else {
      const named = [...(push.pr === null ? [] : [push.pr]), ...(push.repo === null ? [] : ['--repo', push.repo])];
      const pr = JSON.parse(run('gh', ['pr', 'view', ...named, '--json', 'body,files'], root));
      body = pr.body;
      files = (pr.files ?? []).map((f) => String(f.path));
    }
    const reminder = reminderOf({ command, config, body, files, env: process.env });
    if (reminder)
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } }),
      );
  }
} catch {
  // Said above: a reminder is never worth failing the command for.
}
