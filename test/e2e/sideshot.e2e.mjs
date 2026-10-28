// SideShot run for real: a "before" and an "after" page served here, pictured in a browser, without publishing.
// Needs Playwright and its Chromium (npm i, then npx playwright install chromium).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(repo, 'skills/sideshot/scripts/sideshot.mjs');

const pageOf = (card) => `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font: 16px system-ui; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
  .card { width: 320px; margin: 40px; padding: 24px; border: 1px solid #ccc; border-radius: 12px; }
  .new { display: inline-block; margin-top: 12px; padding: 4px 10px; background: #0a7; color: #fff; }
</style>
<div class="card"><h2>Pro plan</h2><p>Everything in Free, and more.</p>${card}</div>`;

const serve = (html) =>
  new Promise((ok) => {
    const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
    server.listen(0, '127.0.0.1', () => ok(server));
  });
const addressOf = (server) => `http://127.0.0.1:${String(server.address().port)}`;

// Run apart and awaited, never synchronously: the pages are served from this process, which must stay free to
// answer.
const run = (args) =>
  new Promise((ok, fail) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: repo, timeout: 120_000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', fail);
    child.on('close', (status) => ok({ status, stdout, stderr }));
  });
const isPng = (file) => readFileSync(file).subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));

// Each test has a pull request, so a folder, of its own: they run at once.
describe('sideshot.mjs', { concurrency: true }, () => {
  let was, now, out;
  before(async () => {
    was = await serve(pageOf(''));
    now = await serve(pageOf('<span class="new">New: priority support</span>'));
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
    for (const [more, said] of [
      [['--part', 'a=.a', '--branch', '--upload-pack=x'], /Cannot use --branch/],
      [['--part', '../../escaped=.card'], /Cannot name a picture/],
    ]) {
      const result = await shoot('9', ...more);
      assert.equal(result.status, 1);
      assert.match(result.stderr, said);
      assert.doesNotMatch(result.stderr, /at .*\.mjs:\d+/);
    }
    assert.ok(!existsSync(join(out, '9')));
    assert.ok(!readdirSync(out).some((f) => f.startsWith('escaped')));
  });
});
