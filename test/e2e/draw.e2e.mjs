// What SideShot draws, checked in Chromium on pictures made here: plain shapes, no text, so the checks hold on
// any machine. They say where the marking colour lands, not what every pixel is, since fonts differ by system.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import { finish, pickAccent } from '../../skills/sideshot/scripts/draw.mjs';

const marigold = '#ffc400';
// The tag's ink, #111111 at 92%, as it shows on white.
const tagOnWhite = '#242424';

/** In the page: a PNG of a white picture with these rectangles on it, as a data address. */
const pictureOf = ({ width, height, rects }) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, width, height);
  for (const [left, top, w, h, colour] of rects) {
    x.fillStyle = colour;
    x.fillRect(left, top, w, h);
  }
  return c.toDataURL('image/png');
};

/** In the page: where a colour shows in a PNG, as runs of rows, each with the columns it spans. */
const whereOf = async ({ png, colour }) => {
  const img = await new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.src = `data:image/png;base64,${png}`;
  });
  const c = new OffscreenCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  const want = [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));
  const runs = [];
  let run = null;
  for (let y = 0; y < img.height; y++) {
    let left = -1, right = -1;
    for (let xx = 0; xx < img.width; xx++) {
      const k = (y * img.width + xx) * 4;
      if (Math.abs(d[k] - want[0]) + Math.abs(d[k + 1] - want[1]) + Math.abs(d[k + 2] - want[2]) < 40) {
        if (left === -1) left = xx;
        right = xx;
      }
    }
    if (left === -1) {
      run = null;
      continue;
    }
    if (!run) runs.push((run = { top: y, bottom: y, left, right }));
    run.bottom = y;
    run.left = Math.min(run.left, left);
    run.right = Math.max(run.right, right);
  }
  return runs;
};

// A card like a page's: a grey border all round, a line of text, and below it, in "after", a new badge. The
// badge makes the card taller, so the rows of blank card between the badge and the bottom border grow too.
const card = (badge) => {
  const bottom = badge ? 150 : 120;
  const rects = [
    [20, 20, 360, 1, '#999999'],
    [20, 20, 1, bottom - 20, '#999999'],
    [379, 20, 1, bottom - 20, '#999999'],
    [20, bottom, 360, 1, '#999999'],
    [40, 50, 200, 20, '#3355aa'],
  ];
  if (badge) rects.push([40, 90, 160, 20, '#00aa77']);
  return { width: 400, height: 180, rects };
};

describe('draw.mjs', () => {
  let browser, page;
  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });
  after(() => browser.close());

  const picture = (spec) => page.evaluate(pictureOf, spec);
  const marked = async (beforeSpec, afterSpec, more = {}) => {
    const result = await page.evaluate(finish, {
      src: await picture(afterSpec),
      before: beforeSpec ? await picture(beforeSpec) : null,
      rings: [],
      colour: marigold,
      scale: 1,
      tag: false,
      ...more,
    });
    return { ...result, runs: await page.evaluate(whereOf, { png: result.png, colour: more.colour ?? marigold }) };
  };

  it('marks nothing when nothing changed', async () => {
    const { changed, runs } = await marked(card(true), card(true));
    assert.equal(changed, 0);
    assert.deepEqual(runs, []);
  });

  it('boxes what was added, close around it, not across the card it sits in', async () => {
    const { changed, runs } = await marked(card(false), card(true));
    assert.equal(changed, 1, JSON.stringify(runs));
    assert.equal(runs.length, 1, JSON.stringify(runs));
    const [box] = runs;
    // The badge is 40 to 200 across and 90 to 110 down; the box sits a few pixels outside it.
    assert.ok(box.left >= 26 && box.right <= 214, `box spans ${box.left} to ${box.right}`);
    assert.ok(box.top >= 76 && box.bottom <= 124, `box spans rows ${box.top} to ${box.bottom}`);
  });

  it('marks only the card that changed when two sit side by side', async () => {
    // Two cards in a row, the right one given a badge that makes it taller: rows across both differ from the
    // badge down, though the left card is as it was.
    const row = (badge) => {
      const left = card(false), right = card(badge);
      return { width: 840, height: 180, rects: [...left.rects, ...right.rects.map(([l, ...rest]) => [Number(l) + 440, ...rest])] };
    };
    const { changed, runs } = await marked(row(false), row(true));
    assert.equal(changed, 1, JSON.stringify(runs));
    assert.equal(runs.length, 1, JSON.stringify(runs));
    assert.ok(runs[0].left >= 440, `marked from column ${runs[0].left}, in the left card`);
  });

  it('rules where a thin thing in a column of its own was taken out, visibly', async () => {
    // A 12-pixel bar beside a block, a gutter between them: taken out, its column is 12 pixels wide.
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 60, '#222222'], [260, 30, 12, 60, '#cc3300']] };
    const now = { width: 400, height: 140, rects: [[40, 30, 200, 60, '#222222']] };
    const { changed, runs } = await marked(was, now);
    assert.equal(changed, 1, JSON.stringify(runs));
    assert.equal(runs.length, 1, JSON.stringify(runs));
    assert.ok(runs[0].right - runs[0].left >= 10, `a rule ${runs[0].right - runs[0].left} pixels long`);
    assert.ok(runs[0].left >= 255, `ruled from column ${runs[0].left}, into the block`);
  });

  it('does not mark what only moved down because something was added above it', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#222222']] };
    const now = { width: 400, height: 140, rects: [[40, 30, 120, 20, '#cc3300'], [40, 70, 200, 20, '#222222']] };
    const { changed, runs } = await marked(was, now);
    assert.equal(changed, 1, JSON.stringify(runs));
    assert.equal(runs.length, 1, JSON.stringify(runs));
    assert.ok(runs[0].bottom < 70, `marked down to row ${runs[0].bottom}, into the block that only moved`);
  });

  // Lines on a page sit at fractional heights, and each is drawn at the nearest whole pixel: when something above
  // them changes height, some round the other way, and land a pixel higher or lower than they were, one by one.
  // A gutter down the whole picture (a diff's + column, a list's rule) makes the space between them read as content.
  const lines = (shifts, scale = 1) => {
    const p = (v) => v * scale;
    const rects = [[0, 0, p(60), p(200), '#3355aa']];
    [20, 60, 100, 140].forEach((top, k) => {
      const y = top + (shifts[k] ?? 0);
      rects.push([p(80), p(y), p(240), p(10), '#222222'], [p(100), p(y + 10), p(8), p(4), '#222222']);
    });
    return { width: p(400), height: p(200), rects };
  };

  it('does not mark lines that only moved a pixel, each its own way, as rounding moves them', async () => {
    const { changed, runs } = await marked(lines([0, 0, 0, 0]), lines([1, -1, 0, 1]));
    assert.equal(changed, 0, JSON.stringify(runs));
    assert.deepEqual(runs, []);
  });

  it('does not mark them at twice the pixels either, where a rounding is a device pixel', async () => {
    // At 2x, a line that rounds the other way moves one device pixel, half of a CSS pixel: each line, with what
    // hangs below it, a device pixel up, down, or not at all.
    const was = lines([0, 0, 0, 0], 2);
    const moved = [0, 1, 1, -1, -1, 0, 0, 1, 1];
    const now = { ...was, rects: was.rects.map(([l, t, ...rest], k) => [l, Number(t) + moved[k], ...rest]) };
    const { changed, runs } = await marked(was, now, { scale: 2 });
    assert.equal(changed, 0, JSON.stringify(runs));
  });

  // A button that stays where it was, its icon and its words each rounded on their own: the words land two pixels
  // higher, the icon does not move, so the rows across them match no row before.
  const button = (wordsUp) => ({
    width: 400,
    height: 120,
    rects: [
      [40, 30, 320, 50, '#111111'],
      [150, 46, 16, 16, '#eeeeee'],
      [176, 48 - wordsUp, 70, 12, '#eeeeee'],
      [190, 52 - wordsUp, 4, 8, '#111111'],
    ],
  });

  it('does not mark words that only moved a pixel or two inside a button that did not', async () => {
    const { changed, runs } = await marked(button(0), button(2));
    assert.equal(changed, 0, JSON.stringify(runs));
  });

  it('still boxes one small thing that changed in a long row of like things', async () => {
    // Twenty marks in a row, as letters in a line; one of them changes colour.
    const row = (k) => ({
      width: 400,
      height: 80,
      rects: Array.from({ length: 20 }, (_, i) => [20 + i * 18, 30, 12, 16, i === k ? '#cc3300' : '#222222']),
    });
    const { changed, runs } = await marked(row(-1), row(7));
    assert.equal(changed, 1, JSON.stringify(runs));
  });

  it('still boxes a mark that turned into another in the same place, as a letter would', async () => {
    // An upright stroke becomes a flat one where it stood: each shares a corner with the other, no more.
    const glyph = (flat) => ({ width: 400, height: 80, rects: [[100, 30, flat ? 16 : 4, flat ? 4 : 16, '#222222']] });
    const { changed, runs } = await marked(glyph(false), glyph(true));
    assert.ok(changed >= 1, JSON.stringify(runs));
  });

  it('still marks a block that only got narrower, though what is left of it is where it was', async () => {
    const was = { width: 400, height: 80, rects: [[40, 30, 200, 20, '#222222']] };
    const now = { width: 400, height: 80, rects: [[40, 30, 80, 20, '#222222']] };
    const { changed, runs } = await marked(was, now);
    assert.ok(changed >= 1, JSON.stringify(runs));
  });

  it('still rules a block taken out at the bottom when the picture got shorter for it', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#222222'], [40, 70, 200, 20, '#222222']] };
    const now = { width: 400, height: 50, rects: [[40, 30, 200, 20, '#222222']] };
    const { changed, runs } = await marked(was, now);
    assert.ok(changed >= 1, JSON.stringify(runs));
  });

  it('still boxes a line that moved further than rounding, beside a gutter', async () => {
    // The second line 6 pixels lower: the space above it grew by more than any rounding.
    const { changed, runs } = await marked(lines([0, 0, 0, 0]), lines([0, 6, 0, 0]));
    assert.ok(changed >= 1, JSON.stringify(runs));
  });

  it('boxes a solid block that only got taller, as something changed', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#3355aa']] };
    const now = { width: 400, height: 140, rects: [[40, 30, 200, 50, '#3355aa']] };
    const { changed, runs } = await marked(was, now);
    assert.equal(changed, 1, JSON.stringify(runs));
    assert.equal(runs.length, 1, JSON.stringify(runs));
    assert.ok(runs[0].top < 30 && runs[0].bottom > 79, `box spans rows ${runs[0].top} to ${runs[0].bottom}`);
  });

  it('rules where a solid block only got shorter', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 50, '#3355aa']] };
    const now = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#3355aa']] };
    const { changed } = await marked(was, now);
    assert.equal(changed, 1);
  });

  it('rules where one of two like blocks was taken out, though the other still shows the same rows', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#3355aa'], [40, 70, 200, 20, '#3355aa']] };
    const now = { width: 400, height: 140, rects: [[40, 70, 200, 20, '#3355aa']] };
    const { changed } = await marked(was, now);
    assert.equal(changed, 1);
  });

  it('rules a line where something was taken out', async () => {
    const was = { width: 400, height: 140, rects: [[40, 30, 200, 20, '#cc3300'], [40, 70, 200, 20, '#222222']] };
    const now = { width: 400, height: 140, rects: [[40, 70, 200, 20, '#222222']] };
    const { changed, runs } = await marked(was, now);
    assert.ok(changed >= 1);
    assert.ok(runs.length >= 1 && runs.every((r) => r.bottom - r.top <= 8), JSON.stringify(runs));
  });

  it('rings a noted element where it sits, in the colour given', async () => {
    const { changed, runs } = await marked(null, card(true), {
      rings: [{ n: 1, x: 40, y: 90, w: 160, h: 20 }],
      colour: '#ff2e88',
    });
    assert.equal(changed, 0);
    assert.equal(runs.length, 1);
    assert.ok(runs[0].left < 40 && runs[0].right > 200 && runs[0].top < 90 && runs[0].bottom > 110, JSON.stringify(runs));
  });

  it('puts the tag in the bottom right corner, and nowhere else', async () => {
    const { png, runs } = await marked(null, card(true), { tag: true, scale: 2 });
    assert.equal(runs.length, 1, JSON.stringify(runs));
    // The picture is 400 by 180, the tag about 190 by 60 at twice the size: right of 150, below 90.
    assert.ok(runs[0].left > 150 && runs[0].top > 90, JSON.stringify(runs));
    const dark = await page.evaluate(whereOf, { png, colour: tagOnWhite });
    assert.ok(dark.length > 0 && dark.every((r) => r.left > 150 && r.top > 90), JSON.stringify(dark));
  });

  it('marks in marigold, unless the page is close to it', async () => {
    const choices = ['#ffc400', '#ff2e88', '#00b4ff'];
    const grey = await picture({ width: 100, height: 100, rects: [[0, 0, 100, 100, '#808080']] });
    const golden = await picture({ width: 100, height: 100, rects: [[0, 0, 100, 100, '#ffb000']] });
    assert.equal(await page.evaluate(pickAccent, { images: [grey], choices }), '#ffc400');
    assert.notEqual(await page.evaluate(pickAccent, { images: [golden], choices }), '#ffc400');
  });
});
