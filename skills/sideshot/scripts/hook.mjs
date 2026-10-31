#!/usr/bin/env node
// SideShot's reminder, for Claude Code (the plugin's hooks/hooks.json runs it after each Bash command).
// Why: an agent asked to "commit and open a PR" is busy with git, and seldom stops to ask whether the change
// wants pictures. After a push, or a pull request opened, this looks at the pull request: when it changes files
// people see and its description has no SideShot table yet, the agent is reminded, and still decides whether the
// change shows on a page. What it decides on is reminderOf, in lib.mjs.
//
// It never fails the command it follows: with no git, no gh, no pull request or input it cannot read, it says
// nothing.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { configOf, pushOf, quietIn, reminderOf } from './lib.mjs';

const waits = {
  // gh asks GitHub for the pull request; a reminder that takes longer than this is not worth waiting for.
  ask: 10000,
};

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: waits.ask }).trim();

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
    const named = [...(push.pr === null ? [] : [push.pr]), ...(push.repo === null ? [] : ['--repo', push.repo])];
    const pr = JSON.parse(run('gh', ['pr', 'view', ...named, '--json', 'body,files'], root));
    const files = (pr.files ?? []).map((f) => String(f.path));
    const reminder = reminderOf({ command, config, body: pr.body, files, env: process.env });
    if (reminder)
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } }),
      );
  }
} catch {
  // Said above: a reminder is never worth failing the command for.
}
