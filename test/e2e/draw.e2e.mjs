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

// Lines of "text" over an area: dark bars three pixels tall, three apart, the way words fill a paragraph.
const words = (left, top, width, height) => {
  const rects = [];
  for (let y = top; y + 3 <= top + height; y += 6) rects.push([left, y, width, 3, '#333333']);
  return rects;
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

  it('moves the tag to an empty corner when the bottom right holds something', async () => {
    // Lines of "text" fill the bottom right; the bottom left is empty, so the tag goes there.
    const spec = { width: 400, height: 180, rects: words(200, 110, 200, 70) };
    const { png } = await marked(null, spec, { tag: true, scale: 1 });
    const dark = await page.evaluate(whereOf, { png, colour: tagOnWhite });
    assert.ok(dark.length > 0 && dark.every((r) => r.right < 200 && r.top > 90), JSON.stringify(dark));
  });

  it('moves the tag off a small icon, though the icon is a small share of the place', async () => {
    // One 8 by 8 icon where the tag would sit: under 3% of the place, yet something the picture shows.
    const spec = { width: 400, height: 180, rects: [[360, 150, 8, 8, '#555555']] };
    const { png } = await marked(null, spec, { tag: true, scale: 1 });
    const dark = await page.evaluate(whereOf, { png, colour: tagOnWhite });
    assert.ok(dark.length > 0 && dark.every((r) => r.right < 200 && r.top > 90), JSON.stringify(dark));
  });

  it('grows the picture and puts the tag below it when every corner holds something', async () => {
    const spec = { width: 400, height: 180, rects: words(0, 0, 400, 180) };
    const { png } = await marked(null, spec, { tag: true, scale: 1 });
    const size = await page.evaluate(async (data) => {
      const i = new Image();
      await new Promise((ok) => { i.onload = ok; i.src = `data:image/png;base64,${data}`; });
      return { width: i.width, height: i.height };
    }, png);
    assert.equal(size.width, 400);
    assert.ok(size.height > 180, JSON.stringify(size));
    // The strip is the picture's own background; the tag's ink sits in it, below the picture that was.
    const dark = await page.evaluate(whereOf, { png, colour: tagOnWhite });
    assert.ok(dark.length > 0 && dark.every((r) => r.top >= 180), JSON.stringify(dark));
  });

  it('marks in marigold, unless the page is close to it', async () => {
    const choices = ['#ffc400', '#ff2e88', '#00b4ff'];
    const grey = await picture({ width: 100, height: 100, rects: [[0, 0, 100, 100, '#808080']] });
    const golden = await picture({ width: 100, height: 100, rects: [[0, 0, 100, 100, '#ffb000']] });
    assert.equal(await page.evaluate(pickAccent, { images: [grey], choices }), '#ffc400');
    assert.notEqual(await page.evaluate(pickAccent, { images: [golden], choices }), '#ffc400');
  });
});
