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
import { join } from 'node:path';
import { configOf, isPrPush, quietIn, reminderOf } from './lib.mjs';

const waits = {
  // gh asks GitHub for the pull request; a reminder that takes longer than this is not worth waiting for.
  ask: 10000,
};

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: waits.ask }).trim();

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = String(input.tool_input?.command ?? '');
  // Most commands are not a push, and some people want no reminder: both are let go before git or gh is asked
  // anything.
  if (isPrPush(command) && !quietIn(process.env)) {
    const root = run('git', ['rev-parse', '--show-toplevel'], input.cwd || process.cwd());
    let config = {};
    try {
      config = configOf(readFileSync(join(root, '.sideshot.json'), 'utf8'));
    } catch {
      // No .sideshot.json, or one SideShot itself will say is wrong when it runs: remind as for none.
    }
    const pr = JSON.parse(run('gh', ['pr', 'view', '--json', 'body,baseRefName'], root));
    const files = run('git', ['diff', '--name-only', `origin/${pr.baseRefName}...HEAD`], root).split('\n').filter(Boolean);
    const reminder = reminderOf({ command, config, body: pr.body, files, env: process.env });
    if (reminder)
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } }),
      );
  }
} catch {
  // Said above: a reminder is never worth failing the command for.
}
