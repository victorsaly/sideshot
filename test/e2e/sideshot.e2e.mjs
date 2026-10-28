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
    assert.match(result.stdout, /Marked \d+ changed area\(s\) on 4 of 4 after pictures\./);
    assert.match(result.stdout, /Took 8 pictures into .* in \d+\.\ds\./);
    // One sheet to look them over, never taken for a picture of its own.
    assert.match(result.stdout, /Look them over in: card-overview\.png/);
    assert.ok(isPng(join(folder, 'card-overview.png')));
    assert.ok(!files.some((f) => f.startsWith('card-overview') && f !== 'card-overview.png'), files.join(', '));
  });

  it('rings a note only on the part it is in', async () => {
    const result = await shoot(
      '10', '--part', 'card=.card', '--part', 'badge=.new', '--devices', 'desk', '--wait', '0',
      '--note', 'h2=The plan', '--no-watermark',
    );
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(join(out, '10'));
    // Drawn on, the card keeps a plain copy; the badge, which the noted title is not in, is left as it was taken.
    assert.ok(files.includes('card-desk-after-plain.png'), files.join(', '));
    assert.ok(files.includes('badge-desk-after.png'), files.join(', '));
    assert.ok(!files.includes('badge-desk-after-plain.png'), files.join(', '));
  });

  it('keeps no pair that is the same before and after, and says which', async () => {
    const result = await shoot('13', '--part', 'card=.card', '--part', 'title=h2', '--devices', 'desk,phone', '--wait', '0');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /The same before and after, so not kept: title on desk, title on phone\./);
    const files = readdirSync(join(out, '13'));
    assert.ok(!files.some((f) => f.startsWith('title-')), files.join(', '));
    assert.ok(files.includes('card-phone-after.png'), files.join(', '));
  });

  it('stops when there is nothing to compare, and says why', async () => {
    const result = await run(['--pr', '14', '--before', addressOf(was), '--after', addressOf(was), '--out', out,
      '--part', 'card=.card', '--part', 'badge=.new', '--devices', 'desk', '--wait', '0', '--mark-changes']);
    assert.equal(result.status, 3, result.stderr);
    assert.match(
      result.stdout,
      /nothing to compare on \/: before and after are the same, pixel for pixel, on card on desk; the part is on neither side on badge on desk\. Check that --after runs this branch/,
    );
    // Nothing kept, nothing drawn, no overview.
    assert.deepEqual(readdirSync(join(out, '14')), ['run.json']);
  });

  it('pictures the side where what is pressed is not there, and says so', async () => {
    const result = await shoot(
      '11', '--part', 'card=.card', '--devices', 'desk', '--wait', '0', '--click', '.new', '--no-watermark',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Could not press \.new for: card before on desk/);
    assert.deepEqual(readdirSync(join(out, '11')).filter((f) => f.endsWith('-before.png')), ['card-desk-before.png']);
  });

  it('says a server that does not answer, before opening a browser', async () => {
    const result = await run(['--pr', '12', '--before', addressOf(was), '--after', 'http://127.0.0.1:9',
      '--part', 'card=.card', '--out', out]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Nothing answers at http:\/\/127\.0\.0\.1:9\/ \(--after\)/);
    assert.ok(!existsSync(join(out, '12')));
  });

  it('asks a server with a login in its address, and never prints the login', async () => {
    const login = (address) => address.replace('://', '://me:hunter2@');
    const reached = await run(['--pr', '15', '--before', login(addressOf(was)), '--after', addressOf(now), '--out', out,
      '--part', 'badge=.new', '--devices', 'desk', '--wait', '0', '--no-watermark']);
    assert.equal(reached.status, 0, reached.stderr);
    const silent = await run(['--pr', '15', '--before', login('http://127.0.0.1:9'), '--after', addressOf(now),
      '--out', out, '--part', 'card=.card']);
    assert.equal(silent.status, 1);
    assert.match(silent.stderr, /Nothing answers at http:\/\/127\.0\.0\.1:9\/ \(--before\)/);
    assert.doesNotMatch(silent.stderr, /hunter2/);
  });

  it('waits for a part drawn late, rather than calling it missing', async () => {
    const late = await serve(pageOf('<script>setTimeout(() => document.querySelector(".card").insertAdjacentHTML(' +
      '"beforeend", \'<span class="new">New: priority support</span>\'), 600);</script>'));
    try {
      const result = await run(['--pr', '16', '--before', addressOf(now), '--after', addressOf(late), '--out', out,
        '--part', 'badge=.new', '--devices', 'desk', '--wait', '0']);
      assert.equal(result.status, 3, result.stdout);
      // Found on both sides, and the same: not "on neither side".
      assert.match(result.stdout, /the same, pixel for pixel, on badge on desk\./);
      assert.doesNotMatch(result.stdout, /Not on the page/);
    } finally {
      late.close();
    }
  });

  it('says every option with --help, anywhere, without a repository', async () => {
    const result = await run(['--help'], { cwd: tmpdir() });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--part name=selector/);
  });

  it('says which parts are not on the page', async () => {
    const result = await shoot('8', '--part', 'badge=.new', '--devices', 'desk', '--wait', '0', '--no-watermark');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Not on the page \(new or removed\): badge before on desk/);
    assert.deepEqual(readdirSync(join(out, '8')).sort(), ['badge-desk-after.png', 'badge-overview.png', 'run.json']);
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
