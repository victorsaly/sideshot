// What is private on a page, hidden in a real browser before the picture is kept: covered on the picture, and put
// as [hidden] in the words the table says changed. Each thing sits at a place of its own on the card, so the
// picture can be looked at there.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import { addressOf, run, serve } from './helpers.mjs';

// Put together here, not written out, so a secret scanner does not take it for a real one.
const card = Array(4).fill('4242').join(' ');

/** A card with something at each place: left and top in CSS pixels, inside the card. */
const pageOf = (contact) => `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font: 16px monospace; background: #fff; color: #111; }
  .card { position: relative; width: 460px; height: 260px; margin: 40px; background: #fff; }
  .card > * { position: absolute; left: 20px; margin: 0; }
</style>
<div class="card">
  <p style="top: 20px">${contact}</p>
  <p style="top: 60px">Plain words, shown as they are</p>
  <input style="top: 100px; width: 260px; height: 24px" autocomplete="tel" value="+44 20 7946 0000">
  <p style="top: 150px" data-sideshot-mask>Account 12</p>
  <p style="top: 190px" class="vip">Jane Doe</p>
  <p style="top: 225px">Card ${card}</p>
</div>`;

describe('hiding what is private', () => {
  let was, now, out, browser, result;
  before(async () => {
    // The words around the address change too, so the table has a line to say.
    was = await serve(pageOf('Contact: old@example.com'));
    now = await serve(pageOf('Write to: jane@example.com'));
    out = mkdtempSync(join(tmpdir(), 'sideshot-hide-'));
    browser = await chromium.launch();
    result = await run([
      '--pr', '1', '--before', addressOf(was), '--after', addressOf(now), '--out', out, '--part', 'card=.card',
      '--devices', 'desk', '--wait', '0', '--no-watermark', '--mask', '.vip',
    ]);
  });
  after(async () => {
    was.close();
    now.close();
    await browser.close();
    rmSync(out, { recursive: true, force: true });
  });

  /** The colour at a place on a picture, in CSS pixels (the pictures are taken at 2x), as #rrggbb. */
  const colourAt = async (file, x, y) => {
    const page = await browser.newPage();
    try {
      return await page.evaluate(
        async ({ src, x, y }) => {
          const img = new Image();
          await new Promise((ok) => { img.onload = ok; img.src = src; });
          const c = new OffscreenCanvas(img.width, img.height), ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const [r, g, b] = ctx.getImageData(x * 2, y * 2, 1, 1).data;
          return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        },
        { src: `data:image/png;base64,${readFileSync(file).toString('base64')}`, x, y },
      );
    } finally {
      await page.close();
    }
  };
  const covered = '#4b5563';

  it('covers an email address, a filled phone field, what the page marks, what --mask names, and a card number', async () => {
    assert.equal(result.status, 0, result.stderr);
    for (const when of ['before', 'after']) {
      const file = join(out, '1', `card-desk-${when}.png`);
      // The address starts 9 or 10 characters in, at about 110 pixels, and runs past 250.
      assert.equal(await colourAt(file, 150, 30), covered, `${when}: the email address`);
      assert.equal(await colourAt(file, 120, 112), covered, `${when}: the phone field`);
      assert.equal(await colourAt(file, 40, 160), covered, `${when}: data-sideshot-mask`);
      assert.equal(await colourAt(file, 40, 200), covered, `${when}: --mask .vip`);
      assert.equal(await colourAt(file, 150, 235), covered, `${when}: the card number`);
      // The words before it, and the plain words, are left as they are.
      assert.notEqual(await colourAt(file, 30, 30), covered, `${when}: the words before the address`);
      for (let x = 20; x < 300; x += 4) assert.notEqual(await colourAt(file, x, 70), covered, `${when}: plain words at ${String(x)}`);
    }
  });

  it('says what it hid', () => {
    assert.match(
      result.stdout,
      /Hid on the pictures: 2 parts marked to hide, 1 card number, 1 email address, 1 phone number\./,
    );
  });

  it('keeps nothing private in the words the table says changed, or anywhere it writes', () => {
    const folder = join(out, '1');
    const run = readFileSync(join(folder, 'run.json'), 'utf8');
    // As the table says it: what changed in bold, and the brackets escaped for Markdown.
    assert.match(run, /\*\*Write to:\*\* \\+\[hidden\]/);
    for (const file of readdirSync(folder).filter((f) => !f.endsWith('.png'))) {
      const text = readFileSync(join(folder, file), 'utf8');
      for (const secret of ['jane@example.com', 'old@example.com', 'Jane Doe', 'Account 12', card, '7946'])
        assert.ok(!text.includes(secret), `${secret} in ${file}`);
    }
  });
});
