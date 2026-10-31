import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The hook as Claude Code runs it: what the command was, as JSON on its input. What it says when a pull request
// wants pictures is reminderOf's, tested in lib.test.mjs; here, that it stays quiet, and never fails the command.
const hook = join(dirname(fileURLToPath(import.meta.url)), '../../skills/sideshot/scripts/hook.mjs');
const nowhere = mkdtempSync(join(tmpdir(), 'sideshot-hook-'));
after(() => rmSync(nowhere, { recursive: true, force: true }));

const ran = (input) => spawnSync(process.execPath, [hook], { input, encoding: 'utf8' });

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
});
