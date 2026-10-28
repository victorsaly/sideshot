// SideShot run for real: a "before" and an "after" page served here, pictured in a browser, without publishing.
// Needs Playwright and its Chromium (npm i, then npx playwright install chromium).
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { addressOf, badge, isPng, pageOf, run, serve } from './helpers.mjs';

// Each test has a pull request, so a folder, of its own: they run at once.
describe('sideshot.mjs', { concurrency: true }, () => {
  let was, now, out;
  before(async () => {
    was = await serve(pageOf(''));
    now = await serve(pageOf(badge));
    out = mkdtempSync(join(tmpdir(), 'sideshot-e2e-'));
  });
  after(() => {
    was.close();
    now.close();
    rmSync(out, { recursive: true, force: true });
  });
  /** SideShot run for one pull request, from the page served before to the one served now. */
  const shoot = (pr, ...more) =>
    run(['--pr', pr, '--before', addressOf(was), '--after', addressOf(now), '--out', out, ...more]);

  it('pictures before and after, rings the note, and marks what changed', async () => {
    const result = await shoot(
      '7', '--part', 'card=.card', '--devices', 'desk,phone', '--schemes', 'light,dark',
      '--note', '.new=Priority support is new', '--mark-changes', '--wait', '100',
    );
    assert.equal(result.status, 0, result.stderr);
    const folder = join(out, '7');
    const files = readdirSync(folder).sort();
    for (const device of ['desk', 'desk-dark', 'phone', 'phone-dark']) {
      for (const when of ['before', 'after']) {
        const file = join(folder, `card-${device}-${when}.png`);
        assert.ok(existsSync(file), `card-${device}-${when}.png in ${files.join(', ')}`);
        assert.ok(isPng(file));
      }
      // Drawn on, so the plain picture is kept beside it.
      assert.ok(files.includes(`card-${device}-after-plain.png`), files.join(', '));
    }
    assert.match(result.stdout, /Marked \d+ changed area\(s\) on card-desk-after\.png/);
    assert.match(result.stdout, /Took the pictures into/);
  });

  it('says which parts are not on the page', async () => {
    const result = await shoot('8', '--part', 'badge=.new', '--devices', 'desk', '--wait', '0', '--no-watermark');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Not on the page \(new or removed\): badge before on desk/);
    assert.deepEqual(readdirSync(join(out, '8')), ['badge-desk-after.png']);
  });

  it('refuses what it cannot use before opening anything, and writes nothing', async () => {
    /** @type {Array<[string[], RegExp]>} */
    const asks = [
      [['--part', 'a=.a', '--branch', '--upload-pack=x'], /Cannot use --branch/],
      [['--part', '../../escaped=.card'], /Cannot name a picture/],
    ];
    for (const [more, said] of asks) {
      const result = await shoot('9', ...more);
      assert.equal(result.status, 1);
      assert.match(result.stderr, said);
      assert.doesNotMatch(result.stderr, /at .*\.mjs:\d+/);
    }
    assert.ok(!existsSync(join(out, '9')));
    assert.ok(!readdirSync(out).some((f) => f.startsWith('escaped')));
  });
});
