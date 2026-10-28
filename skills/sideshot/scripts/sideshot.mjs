#!/usr/bin/env node
// SideShot: see the change, side by side.
// Why: a pull request that changes what people see is reviewed faster, and more honestly, with the same part
// of the page before and after the change side by side, on a desk and on a phone. This takes those pictures
// with Playwright: "before" from the site as it is (production, a preview, or main running locally), "after"
// from the branch running locally. It runs the same under any coding agent, or by hand. With --publish it
// keeps them on a `sideshot` branch that never
// merges, so the code stays light, and writes the Markdown table; with --update-pr it also puts that table in
// the pull request's description, between markers, so running it again replaces the table instead of adding
// another.
//
// Usage (from the project's folder):
//   node sideshot.mjs --pr 123 --page /pricing --part hero=.hero [--part table=#plans]
//     [--before https://example.com] [--after http://localhost:3000]
//     [--devices desk,phone] [--schemes light,dark] [--click "button:has-text('Open')"]
//     [--wait 1500] [--setup ./sideshot-setup.mjs] [--out .sideshot] [--branch sideshot]
//     [--note "selector=what changed"] [--mark-changes] [--accent auto] [--no-watermark]
//     [--publish] [--update-pr]
//
// --devices takes names (desk, phone, tablet, laptop, wide; web and mobile are desk and phone), sizes
// (1440x900), or your own name for a size (pixel=412x915:mobile). The default is desk,phone.
//
// Defaults can live in .sideshot.json at the project's root:
//   { "before": "https://example.com", "after": "http://localhost:3000",
//     "devices": { "web": "desk", "phone": "phone", "kiosk": "1080x1920" }, "accent": "auto" }
//
// --setup names a module whose default export runs on each page before it opens (async (page, { when,
// device, scheme }) => {}): stand-in data for endpoints that only work in production (page.route), a cookie,
// a login.
//
// --note puts a numbered marigold ring around an element in the "after" picture and lists the notes under
// the table, so the picture says what changed. --mark-changes compares each before and after picture and
// outlines wherever they differ. Both mark in one colour: --accent auto (the default) picks marigold unless
// the page itself is close to it, then another from the set; or name one (magenta, cyan, violet, lime, #hex). Needs Playwright in the project (npm i -D playwright, then npx playwright install chromium).
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
// The project is the git repository the command runs in, not the folder this script ships in.
const root = git(['rev-parse', '--show-toplevel'], process.cwd());

// Playwright comes from the project, so its version and its browsers are the project's own.
let chromium;
try {
  const require = createRequire(join(root, 'package.json'));
  const playwright = await import(pathToFileURL(require.resolve('playwright')).href);
  // Loaded as CommonJS, its exports may sit under default.
  chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) throw new Error('no chromium in playwright');
} catch {
  console.error(
    'Playwright is not installed in this project. Add it, then its browser:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  );
  process.exit(2);
}

// Where to picture it: a named size, or your own (WIDTHxHEIGHT, with :mobile for a touch screen). The default is
// desk and phone, a web browser and a mobile one.
const sizes = {
  desk: '1280x900',
  web: '1280x900',
  desktop: '1280x900',
  laptop: '1440x900',
  wide: '1920x1080',
  tablet: '820x1180:mobile',
  phone: '390x844:mobile',
  mobile: '390x844:mobile',
};

/** "phone", "1440x900", or "pixel=412x915:mobile"; null when the size cannot be read. */
function deviceOf(spec) {
  const [name, size = name] = String(spec).split('=').map((s) => s.trim());
  const m = /^(\d{2,5})x(\d{2,5})(:mobile)?$/i.exec(sizes[size.toLowerCase()] ?? size);
  if (!m || !name) return null;
  const mobile = Boolean(m[3]);
  return {
    // The name goes into file names, so only letters, digits and dashes.
    name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    size: `${m[1]}×${m[2]}`,
    options: {
      viewport: { width: Number(m[1]), height: Number(m[2]) },
      isMobile: mobile,
      hasTouch: mobile,
    },
  };
}

/** Every value given for a flag, in order: --part hero=.hero --part list=.list. */
const args = process.argv.slice(2);
const all = (flag) =>
  args.flatMap((a, i) => (a === flag && args[i + 1] !== undefined ? [args[i + 1]] : []));
const config = existsSync(join(root, '.sideshot.json'))
  ? JSON.parse(readFileSync(join(root, '.sideshot.json'), 'utf8'))
  : {};
const one = (flag, key, fallback) => all(flag)[0] ?? config[key] ?? fallback;
const list = (flag, key, fallback) => {
  const given = all(flag)[0];
  if (given !== undefined) return given.split(',').map((s) => s.trim()).filter(Boolean);
  return Array.isArray(config[key]) ? config[key] : fallback;
};

const pr = one('--pr', 'pr', '');
const page = one('--page', 'page', '/');
const before = one('--before', 'before', '');
const after = one('--after', 'after', 'http://localhost:3000');
const wait = Number(one('--wait', 'wait', '1500'));
const click = one('--click', 'click', '');
const branch = one('--branch', 'branch', 'sideshot');
const setupPath = one('--setup', 'setup', '');
// In .sideshot.json, devices is a list like the flag's, or a map of your own names to sizes.
const deviceSpecs =
  all('--devices')[0] === undefined &&
  typeof config.devices === 'object' &&
  config.devices !== null &&
  !Array.isArray(config.devices)
    ? Object.entries(config.devices).map(([name, size]) => `${name}=${String(size)}`)
    : list('--devices', 'devices', ['desk', 'phone']);
const chosen = deviceSpecs.map(deviceOf);
if (chosen.some((d) => d === null) || chosen.length === 0) {
  console.error(
    `Cannot read --devices ${deviceSpecs.join(',')}. Use a name (${Object.keys(sizes).join(', ')}),\n` +
      'a size like 1440x900, or your own name and size like pixel=412x915:mobile.',
  );
  process.exit(1);
}
// The colour that marks what changed. auto picks, from the pictures, the one least like the page's own colours.
const accent = one('--accent', 'accent', 'auto');
const schemes = list('--schemes', 'schemes', ['light']).filter((s) => s === 'light' || s === 'dark');
const parts = all('--part').map((p) => {
  const [name, ...selector] = p.split('=');
  return { name: name || 'page', selector: selector.join('=') || 'body' };
});
// What changed, said on the picture: a numbered ring around each noted element in the "after" picture.
const notes = all('--note').map((n, i) => {
  const [selector, ...words] = n.split('=');
  return { n: i + 1, selector: selector ?? '', text: words.join('=') };
});
const markChanges = args.includes('--mark-changes') || config.markChanges === true;
// Each pair carries a small SideShot tag in the corner of its "after" picture, unless asked not to.
const watermark = !args.includes('--no-watermark') && config.watermark !== false;
const publish = args.includes('--publish') || args.includes('--update-pr');
const updatePr = args.includes('--update-pr');

if (!/^\d+$/.test(pr) || parts.length === 0 || before === '') {
  console.error(
    'Give the pull request, where "before" lives, and at least one part:\n' +
      '  --pr 123 --before https://example.com --part hero=.hero\n' +
      '(--before and --after can also be set in .sideshot.json)',
  );
  process.exit(1);
}

const out = resolve(root, one('--out', 'out', '.sideshot'), pr);
mkdirSync(out, { recursive: true });
const setup = setupPath
  ? (await import(pathToFileURL(isAbsolute(setupPath) ? setupPath : resolve(root, setupPath)).href))
      .default
  : null;

/** Opens what the part sits in, lets it settle, and pictures it. Returns where each noted element sits in the
 * picture, in CSS pixels, or null when the page has no such part. */
async function picture(p, selector, file, noted = [], margin = 0) {
  const part = p.locator(selector).first();
  if ((await part.count()) === 0) return null;
  // Written as text so it runs in the page whatever the project's tooling.
  await p.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return;
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    if (el.tagName === 'DETAILS') el.open = true;
    // A tall part is pictured in strips as the page scrolls; a sticky bar would be stamped across it.
    for (const node of document.querySelectorAll('*'))
      if (getComputedStyle(node).position === 'sticky') node.style.position = 'static';
  })()`);
  await part.scrollIntoViewIfNeeded();
  await p.waitForTimeout(wait);
  // Wait for the network to go quiet (briefly: some pages poll forever), then until the part's height holds.
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  let height = -1;
  for (let steady = 0, tries = 0; steady < 8 && tries < 60; tries++) {
    const now = Math.round((await part.boundingBox())?.height ?? 0);
    steady = now === height ? steady + 1 : 0;
    height = now;
    await p.waitForTimeout(250);
  }
  // A part taller than the window is pictured beyond it, where a chart can lay out at no height.
  const size = p.viewportSize();
  if (size && height + 80 > size.height) {
    await p.setViewportSize({ width: size.width, height: height + 80 });
    await part.scrollIntoViewIfNeeded();
    await p.waitForTimeout(600);
  }
  if (margin === 0) {
    await part.screenshot({ path: file });
    return [];
  }
  // A ring sits just outside what it marks: with notes, both pictures take the same margin, so no ring or
  // number is cut off and before and after stay the same size.
  const box = await part.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  });
  const clip = {
    x: Math.max(0, box.x - margin),
    y: Math.max(0, box.y - margin),
    width: box.width + 2 * margin,
    height: box.height + 2 * margin,
  };
  await p.screenshot({ path: file, fullPage: true, clip });
  // The rings are drawn on the picture afterwards, in the one colour chosen for the whole set; here they are
  // only measured.
  return p.evaluate(
    ({ notes, origin }) =>
      notes.flatMap((note) => {
        const el = document.querySelector(note.selector);
        if (!el) return [];
        const r = el.getBoundingClientRect();
        return [
          { n: note.n, x: r.left + scrollX - origin.x, y: r.top + scrollY - origin.y, w: r.width, h: r.height },
        ];
      }),
    { notes: noted, origin: clip },
  );
}

// The colours a mark can take. Marigold is SideShot's own; the others are there for pages it would vanish on.
const swatches = {
  marigold: '#ffc400',
  magenta: '#ff2e88',
  cyan: '#00b4ff',
  violet: '#8b5cf6',
  lime: '#5ee01b',
};

/** Runs in the page: the swatch least like the colours the pictures already use (marigold when it is free). */
async function pickAccent({ images, choices }) {
  const hsv = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0)
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round((h * 60 + 360) % 360), max === 0 ? 0 : d / max, max / 255];
  };
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const hues = new Float64Array(360);
  let total = 0;
  for (const src of images) {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const w = Math.min(240, img.width), h = Math.max(1, Math.round((img.height * w) / img.width));
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4) {
      total++;
      const [hue, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
      // Greys, whites and blacks clash with nothing; only real colour counts.
      if (s > 0.35 && v > 0.3) hues[hue]++;
    }
  }
  const near = (hue) => {
    let n = 0;
    for (let k = -30; k <= 30; k++) n += hues[(hue + k + 360) % 360];
    return n / Math.max(1, total);
  };
  const scored = choices.map((s) => ({ s, share: near(hsv(...hex(s))[0]) }));
  if (scored[0].share < 0.004) return scored[0].s;
  return scored.reduce((a, b) => (b.share < a.share ? b : a)).s;
}

/** Runs in the page: draws what changed, the numbered rings and the SideShot tag on one picture. */
async function finish({ src, before, rings, colour, scale, tag }) {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const b = await load(src);
  const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d');
  x.drawImage(b, 0, 0);
  let changed = 0;
  if (before) {
    const a = await load(before);
    // Rows are lined up the way a text diff lines up lines, so content that only moved (something above it
    // was added or taken out) is not marked; what was added or changed is boxed, what was taken out is a rule.
    const rowsOf = (img) => {
      const oc = new OffscreenCanvas(img.width, img.height), ox = oc.getContext('2d');
      ox.drawImage(img, 0, 0);
      const d = ox.getImageData(0, 0, img.width, img.height).data, hashes = new Uint32Array(img.height);
      for (let y = 0; y < img.height; y++) {
        let h = 2166136261;
        for (let i = y * img.width * 4, e = i + img.width * 4; i < e; i += 4)
          h = Math.imul(h ^ ((d[i] >> 3) | ((d[i + 1] >> 3) << 5) | ((d[i + 2] >> 3) << 10)), 16777619);
        hashes[y] = h >>> 0;
      }
      return { d, hashes, w: img.width, h: img.height };
    };
    const A = rowsOf(a), B = rowsOf(b);
    const n = A.h, m = B.h, L = new Uint32Array((n + 1) * (m + 1));
    const same = (i, j) => A.hashes[i] === B.hashes[j] && A.w === B.w;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * (m + 1) + j] = same(i, j)
        ? L[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
    const added = new Uint8Array(m), cuts = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (same(i, j)) { i++; j++; }
      else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) { cuts.push(j); i++; }
      else { added[j] = 1; j++; }
    }
    while (j < m) added[j++] = 1;
    if (i < n) cuts.push(m - 1);
    // The background is the colour of the first pixel; ink is anything far from it.
    const bg = [B.d[0], B.d[1], B.d[2]];
    const ink = (y, xx) => {
      const k = (y * B.w + xx) * 4;
      return Math.abs(B.d[k] - bg[0]) + Math.abs(B.d[k + 1] - bg[1]) + Math.abs(B.d[k + 2] - bg[2]) > 60;
    };
    const boxes = [];
    for (let y = 0; y < m; y++) {
      if (!added[y]) continue;
      let y1 = y;
      while (y1 + 1 < m && added[y1 + 1]) y1++;
      let x0 = B.w, x1 = -1;
      for (let yy = y; yy <= y1; yy++) for (let xx = 0; xx < B.w; xx++) if (ink(yy, xx)) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
      if (x1 >= 0 && y1 - y >= 2) boxes.push([x0, y, x1 + 1, y1 + 1]);
      y = y1;
    }
    // Where something was only taken out, a short rule marks the place it was.
    const rules = [...new Set(cuts)].filter((y) => !added[y] && !added[Math.max(0, y - 1)]);
    x.lineWidth = 6; x.strokeStyle = colour;
    for (const [l, t, r, btm] of boxes) { x.beginPath(); x.roundRect(Math.max(3, l - 8), Math.max(3, t - 8), r - l + 16, btm - t + 16, 12); x.stroke(); }
    x.setLineDash([14, 8]);
    // A little above the line that follows, so the rule sits in the gap rather than on the words.
    for (const y of rules) { const ry = Math.max(4, y - 8); x.beginPath(); x.moveTo(6, ry); x.lineTo(Math.min(b.width - 6, 600), ry); x.stroke(); }
    x.setLineDash([]);
    changed = boxes.length + rules.length;
  }
  // The number is black or white, whichever reads better on the colour.
  const lum = [1, 3, 5]
    .map((k) => parseInt(colour.slice(k, k + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
  const onColour = (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
  const s = scale;
  for (const r of rings) {
    // An ink edge on both sides of the colour, so the ring shows on a light page and a dark one.
    const left = (r.x - 8 + 2) * s, top = (r.y - 8 + 2) * s, w = (r.w + 12) * s, h = (r.h + 12) * s;
    x.lineWidth = 8 * s; x.strokeStyle = '#000000';
    x.beginPath(); x.roundRect(left, top, w, h, 14 * s); x.stroke();
    x.lineWidth = 4 * s; x.strokeStyle = colour;
    x.beginPath(); x.roundRect(left, top, w, h, 14 * s); x.stroke();
    const cx = (r.x - 8 + 1) * s, cy = (r.y - 8 + 1) * s;
    x.beginPath(); x.arc(cx, cy, 15 * s, 0, Math.PI * 2);
    x.fillStyle = colour; x.fill();
    x.lineWidth = 2 * s; x.strokeStyle = '#000000'; x.stroke();
    x.fillStyle = onColour; x.font = `700 ${16 * s}px system-ui, -apple-system, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(r.n), cx, cy + s);
  }
  if (tag) {
    // The tag is SideShot's own and looks the same on every project: the mark (before in paper, after in
    // marigold) and the name, Side in paper and Shot in marigold, on ink, in the bottom right corner.
    // Sized by the picture's pixel density, not its width, so it reads the same on a phone as on a desk.
    const t = scale, pad = 8 * t, sq = 11 * t;
    x.font = `700 ${13 * t}px system-ui, -apple-system, sans-serif`;
    x.textAlign = 'left'; x.textBaseline = 'middle';
    const side = x.measureText('Side').width, shot = x.measureText('Shot').width;
    const w = pad * 2 + sq * 1.7 + 6 * t + side + shot, h = pad * 2 + 13 * t;
    const left = b.width - w - 10 * t, top = b.height - h - 10 * t;
    x.globalAlpha = 0.92; x.fillStyle = '#111111';
    x.beginPath(); x.roundRect(left, top, w, h, 6 * t); x.fill();
    x.globalAlpha = 1;
    const my = top + (h - sq) / 2;
    x.fillStyle = '#f2f2f2'; x.fillRect(left + pad, my, sq, sq);
    x.fillStyle = '#ffc400'; x.fillRect(left + pad + sq * 0.7, my, sq, sq);
    const tx = left + pad + sq * 1.7 + 6 * t;
    x.fillStyle = '#f2f2f2'; x.fillText('Side', tx, top + h / 2 + t);
    x.fillStyle = '#ffc400'; x.fillText('Shot', tx + side, top + h / 2 + t);
  }
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return { png: btoa(bin), changed };
}

const label = (device, scheme) => (scheme === 'light' ? device : `${device}-${scheme}`);
const browser = await chromium.launch();
const missing = [];
const ringsOf = new Map();
for (const device of chosen) {
  for (const scheme of schemes) {
    for (const [when, base] of [
      ['before', before],
      ['after', after],
    ]) {
      // A fresh page for each part, with only that part opened: something drawn late elsewhere would move it.
      for (const part of parts) {
        const context = await browser.newContext({
          ...device.options,
          deviceScaleFactor: 2,
          colorScheme: scheme,
        });
        const p = await context.newPage();
        if (setup) await setup(p, { when, device: device.name, scheme });
        await p.goto(`${base}${page}`, { waitUntil: 'load' });
        // Development toolbars are not part of the page.
        await p.addStyleTag({
          content:
            'astro-dev-toolbar, nextjs-portal, vite-error-overlay { display: none !important; }',
        });
        // Down to the end and back once, so what loads lazily has loaded and the page has stopped moving.
        await p.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await p.waitForTimeout(wait);
        await p.evaluate('window.scrollTo(0, 0)');
        await p.waitForTimeout(300);
        if (click) {
          await p.locator(click).first().click();
          await p.waitForTimeout(wait);
        }
        const name = `${part.name}-${label(device.name, scheme)}-${when}.png`;
        // An older picture of a part that is no longer there must not pass for the current one.
        rmSync(join(out, name), { force: true });
        rmSync(join(out, name.replace(/\.png$/, '-plain.png')), { force: true });
        const rings = await picture(
          p,
          part.selector,
          join(out, name),
          when === 'after' ? notes : [],
          notes.length > 0 ? 28 : 0,
        );
        if (rings === null) missing.push(`${part.name} ${when} on ${label(device.name, scheme)}`);
        else if (rings.length > 0) ringsOf.set(name, rings);
        await context.close();
      }
    }
  }
}

// Each picture is finished in a browser canvas: what changed is marked, the notes are ringed, the tag goes in
// the corner. A picture drawn on keeps a plain copy beside it.
const pngs = readdirSync(out).filter((f) => f.endsWith('.png') && !f.endsWith('-plain.png'));
const dataOf = (name) => `data:image/png;base64,${readFileSync(join(out, name)).toString('base64')}`;
const finisher = await browser.newPage();
const marking = markChanges || ringsOf.size > 0;
let colour = swatches[accent.toLowerCase()] ?? (/^#[0-9a-f]{6}$/i.test(accent) ? accent : null);
if (colour === null && accent !== 'auto') {
  console.error(`Cannot read --accent ${accent}. Use auto, ${Object.keys(swatches).join(', ')}, or a colour like #ff5a1f.`);
  process.exit(1);
}
if (colour === null)
  colour = marking
    ? await finisher.evaluate(pickAccent, { images: pngs.map(dataOf), choices: Object.values(swatches) })
    : swatches.marigold;
if (marking && accent === 'auto') {
  const named = Object.entries(swatches).find(([, v]) => v === colour)?.[0] ?? colour;
  console.info(`Marking in ${named}${named === 'marigold' ? '' : ' (marigold is too close to the page)'}`);
}
for (const f of pngs) {
  const pair = f.replace(/-after\.png$/, '-before.png');
  const compare = markChanges && f.endsWith('-after.png') && existsSync(join(out, pair));
  const rings = ringsOf.get(f) ?? [];
  // One tag to a pair: it goes on the "after" picture only.
  const tag = watermark && f.endsWith('-after.png');
  if (!compare && rings.length === 0 && !tag) continue;
  const result = await finisher.evaluate(finish, {
    src: dataOf(f),
    before: compare ? dataOf(pair) : null,
    rings,
    colour,
    scale: 2,
    tag,
  });
  if (rings.length > 0 || result.changed > 0)
    cpSync(join(out, f), join(out, f.replace(/\.png$/, '-plain.png')));
  writeFileSync(join(out, f), Buffer.from(result.png, 'base64'));
  if (result.changed > 0) console.info(`Marked ${String(result.changed)} changed area(s) on ${f}`);
}
await finisher.close();
await browser.close();
console.info(`Took the pictures into ${out}`);
if (missing.length > 0) console.info(`Not on the page (new or removed): ${missing.join('; ')}`);
if (!publish) process.exit(0);

// Kept on their own branch: a temporary checkout of it, the pictures copied in, one commit, pushed.
const remote = git(['remote', 'get-url', 'origin'], root)
  .replace(/\.git$/, '')
  .replace(/^git@github\.com:/, 'https://github.com/');
const slug = remote.replace('https://github.com/', '');
const place = mkdtempSync(join(tmpdir(), 'sideshot-'));
rmSync(place, { recursive: true });
const known = git(['ls-remote', '--heads', 'origin', branch], root) !== '';
if (known) {
  git(['fetch', 'origin', branch], root);
  git(['worktree', 'add', '-B', branch, place, `origin/${branch}`], root);
} else {
  git(['worktree', 'add', '--orphan', '-b', branch, place], root);
  writeFileSync(
    join(place, 'README.md'),
    '# SideShot\n\nBefore and after pictures for pull requests, one folder each. This branch never merges.\n',
  );
}
try {
  // The pull request's folder is replaced, not added to, so a picture taken out locally goes from there too.
  rmSync(join(place, pr), { recursive: true, force: true });
  mkdirSync(join(place, pr), { recursive: true });
  for (const f of readdirSync(out))
    if (f.endsWith('.png') && !f.endsWith('-plain.png')) cpSync(join(out, f), join(place, pr, f));
  git(['add', '-A'], place);
  if (git(['status', '--porcelain'], place) !== '') {
    git(['commit', '-m', `chore: before and after for #${pr}`], place);
    git(['push', 'origin', branch], place);
  }
} finally {
  git(['worktree', 'remove', '--force', place], root);
}

const url = (file) => `https://raw.githubusercontent.com/${slug}/${branch}/${pr}/${file}`;
const files = new Set(readdirSync(out));
const lines = ['## Before and after', ''];
for (const part of parts) {
  for (const device of chosen) {
    for (const scheme of schemes) {
      const name = label(device.name, scheme);
      const b = `${part.name}-${name}-before.png`;
      const a = `${part.name}-${name}-after.png`;
      if (!files.has(b) && !files.has(a)) continue;
      lines.push(`**${part.name}, ${name}** <sub>${device.size}</sub>`, '', '| Before | After |', '| --- | --- |');
      const cell = (f) => (files.has(f) ? `<img src="${url(f)}" width="420">` : '(not there)');
      lines.push(`| ${cell(b)} | ${cell(a)} |`, '');
    }
  }
}
// The numbered rings on the "after" pictures, said in words.
if (notes.length > 0)
  lines.push('**What changed**', '', ...notes.map((note) => `${String(note.n)}. ${note.text}`), '');
const named = (base) =>
  /\/\/(localhost|127\.0\.0\.1)/.test(base) ? 'run locally' : `${base}${page}`;
lines.push(
  `<sub>Before: ${named(before)} · After: ${named(after)} · made with [SideShot](https://github.com/victorsaly/sideshot)</sub>`,
);
const table = lines.join('\n');
writeFileSync(join(out, 'table.md'), `${table}\n`);
console.info(`\n${table}\n`);

if (updatePr) {
  // The table goes between markers in the description, so running again replaces it instead of adding one.
  const start = '<!-- sideshot:start -->';
  const end = '<!-- sideshot:end -->';
  const body = execFileSync('gh', ['pr', 'view', pr, '--json', 'body', '--jq', '.body'], {
    cwd: root,
    encoding: 'utf8',
  });
  const block = `${start}\n${table}\n${end}`;
  const next = body.includes(start)
    ? body.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
    : `${body.trimEnd()}\n\n${block}\n`;
  const file = join(out, 'body.md');
  writeFileSync(file, next);
  execFileSync('gh', ['pr', 'edit', pr, '--body-file', file], { cwd: root, stdio: 'inherit' });
  console.info(`Updated the description of #${pr}.`);
}
