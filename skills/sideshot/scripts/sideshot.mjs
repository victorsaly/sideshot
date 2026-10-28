#!/usr/bin/env node
// Sideshot: see the change, side by side.
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
//     [--publish] [--update-pr]
//
// Defaults can live in .sideshot.json at the project's root:
//   { "before": "https://example.com", "after": "http://localhost:3000", "devices": ["desk", "phone"] }
//
// --setup names a module whose default export runs on each page before it opens (async (page, { when,
// device, scheme }) => {}): stand-in data for endpoints that only work in production (page.route), a cookie,
// a login. Needs Playwright in the project (npm i -D playwright, then npx playwright install chromium).
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

const devices = {
  desk: { viewport: { width: 1280, height: 900 }, isMobile: false },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

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
const chosen = list('--devices', 'devices', ['desk', 'phone']).filter((d) => d in devices);
const schemes = list('--schemes', 'schemes', ['light']).filter((s) => s === 'light' || s === 'dark');
const parts = all('--part').map((p) => {
  const [name, ...selector] = p.split('=');
  return { name: name || 'page', selector: selector.join('=') || 'body' };
});
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

/** Opens what the part sits in, lets it settle, and pictures it; false when the page has no such part. */
async function picture(p, selector, file) {
  const part = p.locator(selector).first();
  if ((await part.count()) === 0) return false;
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
  await part.screenshot({ path: file });
  return true;
}

const label = (device, scheme) => (scheme === 'light' ? device : `${device}-${scheme}`);
const browser = await chromium.launch();
const missing = [];
for (const device of chosen) {
  for (const scheme of schemes) {
    for (const [when, base] of [
      ['before', before],
      ['after', after],
    ]) {
      // A fresh page for each part, with only that part opened: something drawn late elsewhere would move it.
      for (const part of parts) {
        const context = await browser.newContext({
          ...devices[device],
          deviceScaleFactor: 2,
          colorScheme: scheme,
        });
        const p = await context.newPage();
        if (setup) await setup(p, { when, device, scheme });
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
        const file = join(out, `${part.name}-${label(device, scheme)}-${when}.png`);
        // An older picture of a part that is no longer there must not pass for the current one.
        rmSync(file, { force: true });
        if (!(await picture(p, part.selector, file)))
          missing.push(`${part.name} ${when} on ${label(device, scheme)}`);
        await context.close();
      }
    }
  }
}
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
    '# Sideshot\n\nBefore and after pictures for pull requests, one folder each. This branch never merges.\n',
  );
}
try {
  // The pull request's folder is replaced, not added to, so a picture taken out locally goes from there too.
  rmSync(join(place, pr), { recursive: true, force: true });
  mkdirSync(join(place, pr), { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith('.png')) cpSync(join(out, f), join(place, pr, f));
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
      const name = label(device, scheme);
      const b = `${part.name}-${name}-before.png`;
      const a = `${part.name}-${name}-after.png`;
      if (!files.has(b) && !files.has(a)) continue;
      lines.push(`**${part.name}, ${name}**`, '', '| Before | After |', '| --- | --- |');
      const cell = (f) => (files.has(f) ? `<img src="${url(f)}" width="420">` : '(not there)');
      lines.push(`| ${cell(b)} | ${cell(a)} |`, '');
    }
  }
}
const named = (base) =>
  /\/\/(localhost|127\.0\.0\.1)/.test(base) ? 'run locally' : `${base}${page}`;
lines.push(
  `<sub>Before: ${named(before)} · After: ${named(after)} · made with [Sideshot](https://github.com/victorsaly/sideshot)</sub>`,
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
