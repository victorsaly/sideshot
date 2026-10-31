import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The hook as Claude Code runs it: what the command was, as JSON on its input. What it says when a pull request
// wants pictures is reminderOf's, tested in lib.test.mjs; here, that it stays quiet, and never fails the command.
const hook = join(dirname(fileURLToPath(import.meta.url)), '../../skills/sideshot/scripts/hook.mjs');
const nowhere = mkdtempSync(join(tmpdir(), 'sideshot-hook-'));
after(() => rmSync(nowhere, { recursive: true, force: true }));

const ran = (input, env = process.env) => spawnSync(process.execPath, [hook], { input, encoding: 'utf8', env });

describe('the hook', () => {
  it('says nothing after a command that pushes nothing', () => {
    const { status, stdout } = ran(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: nowhere }));
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });

  it('says nothing, and does not fail, outside a repository or on input it cannot read', () => {
    for (const input of [JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: nowhere }), '{nope', '']) {
      const { status, stdout } = ran(input);
      assert.equal(status, 0, input);
      assert.equal(stdout, '', input);
    }
  });

  it('asks about the pull request the command named, in the repository it moved to', () => {
    // A repository in a folder below where the command runs, and a gh that says what it was asked and answers as
    // GitHub would for a pull request that changes a style and has no pictures.
    const top = mkdtempSync(join(tmpdir(), 'sideshot-hook-'));
    try {
      mkdirSync(join(top, 'site'));
      execFileSync('git', ['init', '-q'], { cwd: join(top, 'site') });
      mkdirSync(join(top, 'bin'));
      const asked = join(top, 'asked');
      const answer = JSON.stringify({ body: 'Restyles the cards.', files: [{ path: 'src/pricing.css' }, { path: 'server/db.ts' }] });
      writeFileSync(join(top, 'bin', 'gh'), `#!/bin/sh\necho "$PWD $@" > '${asked}'\necho '${answer}'\n`);
      chmodSync(join(top, 'bin', 'gh'), 0o755);
      const env = { ...process.env, PATH: `${join(top, 'bin')}:${process.env.PATH ?? ''}` };
      delete env.SIDESHOT_REMIND;

      const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cd site; gh pr ready 12' }, cwd: top });
      const { status, stdout } = ran(input, env);
      assert.equal(status, 0);
      const said = JSON.parse(stdout).hookSpecificOutput;
      assert.equal(said.hookEventName, 'PostToolUse');
      assert.match(said.additionalContext, /src\/pricing\.css/);
      assert.doesNotMatch(said.additionalContext, /server\/db\.ts/);
      // Asked in the repository the command moved to, about the pull request it named, with its files from GitHub.
      const [where, ...args] = readFileSync(asked, 'utf8').trim().split(' ');
      assert.ok(where.endsWith('/site'), where);
      assert.deepEqual(args, ['pr', 'view', '12', '--json', 'body,files']);
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
});
