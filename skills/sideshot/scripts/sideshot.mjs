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
/* global document, scrollX, scrollY -- only in the functions picture() hands to the page, which run there. */
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
import { finish, pickAccent } from './draw.mjs';
import {
  UsageError,
  bodyWith,
  configOf,
  isPicture,
  label,
  optionsOf,
  pictureName,
  plainOf,
  pruneOptionsOf,
  slugOf,
  swatches,
  tableOf,
  toPrune,
} from './lib.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
// The project is the git repository the command runs in, not the folder this script ships in.
let root;
try {
  root = git(['rev-parse', '--show-toplevel'], process.cwd());
} catch {
  console.error('Run SideShot from inside the project\'s git repository.');
  process.exit(1);
}

/** The GitHub repository the pictures go to, or a UsageError saying why they cannot: origin is not on GitHub, or
 * git does not take the branch name. */
function publishingTo(branch) {
  let remote = '';
  try {
    remote = git(['remote', 'get-url', 'origin'], root);
  } catch {
    // Said below.
  }
  const slug = slugOf(remote);
  if (slug === null) throw new UsageError('SideShot publishes only to an origin on GitHub, where the pictures are kept.');
  try {
    git(['check-ref-format', '--branch', branch], root);
  } catch {
    throw new UsageError(`git does not take ${branch} as a branch name; give --branch another.`);
  }
  return slug;
}

/** Takes off the branch the pictures of pull requests closed long enough ago. The branch is written again as one
 * commit of what is left, so those pictures leave its history too and the repository gets smaller; the push is
 * refused if anyone pushed to the branch since it was read. */
function prune({ branch, olderThan }) {
  if (git(['ls-remote', 'origin', `refs/heads/${branch}`], root) === '') {
    console.info(`Nothing to prune: there is no ${branch} branch.`);
    return;
  }
  git(['fetch', '-q', 'origin', `refs/heads/${branch}`], root);
  const tip = git(['rev-parse', 'FETCH_HEAD'], root);
  const entries = git(['ls-tree', '-z', tip], root).split('\0').filter(Boolean);
  const nameOf = (entry) => entry.slice(entry.indexOf('\t') + 1);
  const prs = JSON.parse(
    execFileSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,closedAt'], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  const gone = toPrune(entries.map(nameOf), prs, Date.now(), olderThan);
  if (gone.length === 0) {
    console.info(`Nothing to prune: no pull request with pictures on ${branch} closed ${String(olderThan)} days ago or more.`);
    return;
  }
  const kept = entries.filter((entry) => !gone.includes(nameOf(entry)));
  const tree = execFileSync('git', ['mktree', '-z'], { cwd: root, input: kept.map((e) => `${e}\0`).join(''), encoding: 'utf8' }).trim();
  const said = `#${gone.join(', #')}`;
  const commit = git(['commit-tree', tree, '-m', `chore: prune the pictures of ${said}`], root);
  git(['push', '-q', `--force-with-lease=refs/heads/${branch}:${tip}`, 'origin', `${commit}:refs/heads/${branch}`], root);
  console.info(`Took the pictures of ${said} off ${branch}. Those pull requests no longer show them.`);
}

// What was asked, checked before anything opens: a mistake is said plainly, and nothing is half done.
let options;
let pruning = null;
let slug = null;
try {
  const configFile = join(root, '.sideshot.json');
  const config = existsSync(configFile) ? configOf(readFileSync(configFile, 'utf8')) : {};
  const args = process.argv.slice(2);
  if (args.includes('--prune')) {
    pruning = pruneOptionsOf(args, config);
    publishingTo(pruning.branch);
  } else {
    options = optionsOf(args, config);
    if (options.publish) slug = publishingTo(options.branch);
  }
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(1);
}
// Pruning needs no browser.
if (pruning) {
  prune(pruning);
  process.exit(0);
}
const {
  pr, page, before, after, wait, click, branch, setupPath, chosen, schemes, parts, notes, accent,
  markChanges, watermark, publish, updatePr,
} = options;

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

const out = resolve(root, options.out, pr);
mkdirSync(out, { recursive: true });
// The setup module is the project's own code, run as it is, like its Playwright: only run SideShot in a project
// you trust.
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
        const name = pictureName(part.name, device.name, scheme, when);
        // An older picture of a part that is no longer there must not pass for the current one.
        rmSync(join(out, name), { force: true });
        rmSync(join(out, plainOf(name)), { force: true });
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
const pngs = readdirSync(out).filter(isPicture);
const dataOf = (name) => `data:image/png;base64,${readFileSync(join(out, name)).toString('base64')}`;
const finisher = await browser.newPage();
const marking = markChanges || ringsOf.size > 0;
let colour = accent === 'auto' ? null : accent;
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
    cpSync(join(out, f), join(out, plainOf(f)));
  writeFileSync(join(out, f), Buffer.from(result.png, 'base64'));
  if (result.changed > 0) console.info(`Marked ${String(result.changed)} changed area(s) on ${f}`);
}
await finisher.close();
await browser.close();
console.info(`Took the pictures into ${out}`);
if (missing.length > 0) console.info(`Not on the page (new or removed): ${missing.join('; ')}`);
if (!publish) process.exit(0);

// Kept on their own branch: a temporary checkout of it, the pictures copied in, one commit, pushed.
const place = mkdtempSync(join(tmpdir(), 'sideshot-'));
rmSync(place, { recursive: true });
const known = git(['ls-remote', 'origin', `refs/heads/${branch}`], root) !== '';
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
  for (const f of pngs) cpSync(join(out, f), join(place, pr, f));
  git(['add', '-A'], place);
  if (git(['status', '--porcelain'], place) !== '') {
    git(['commit', '-m', `chore: before and after for #${pr}`], place);
    git(['push', 'origin', branch], place);
  }
} finally {
  git(['worktree', 'remove', '--force', place], root);
}

const files = new Set(readdirSync(out));
const table = tableOf({ parts, chosen, schemes, notes, files, before, after, page, slug, branch, pr });
writeFileSync(join(out, 'table.md'), `${table}\n`);
console.info(`\n${table}\n`);

if (updatePr) {
  // The table goes between markers in the description, so running again replaces it instead of adding one.
  const body = execFileSync('gh', ['pr', 'view', pr, '--json', 'body', '--jq', '.body'], {
    cwd: root,
    encoding: 'utf8',
  });
  const next = bodyWith(body, table);
  const file = join(out, 'body.md');
  writeFileSync(file, next);
  execFileSync('gh', ['pr', 'edit', pr, '--body-file', file], { cwd: root, stdio: 'inherit' });
  console.info(`Updated the description of #${pr}.`);
}
