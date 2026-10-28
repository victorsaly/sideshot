#!/usr/bin/env node
// SideShot: see the change, side by side.
// Why: a pull request that changes what people see is reviewed faster, and more honestly, with the same part
// of the page before and after the change side by side, on a desk and on a phone. This takes those pictures
// with Playwright: "before" from the site as it is (production, a preview, or main running locally), "after"
// from the branch running locally. It runs the same under any coding agent, or by hand. With --publish it
// keeps them on a `sideshot` branch that never merges, so the code stays light, and writes the Markdown table;
// with --update-pr it also puts that table in the pull request's description, between markers, so running it
// again replaces the table instead of adding another.
//
// Usage (from the project's folder): node sideshot.mjs --help says every option. The words are kept in lib.mjs
// with the code that reads them, so an agent never has to read this file to run it.
//
// Needs Playwright: the project's own, or one installed globally for a project without Node of its own.
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
import { finish, pickAccent, sheet } from './draw.mjs';
import {
  UsageError,
  bodyWith,
  configOf,
  bareOf,
  isPicture,
  label,
  nothingOf,
  nothingTableOf,
  optionsOf,
  pictureName,
  plainOf,
  pool,
  ringsWithin,
  runKeyOf,
  sheetsOf,
  shownOf,
  slugOf,
  swatches,
  tableOf,
  usage,
} from './lib.mjs';

const started = Date.now();
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.info(usage);
  process.exit(0);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
// The project is the git repository the command runs in, not the folder this script ships in.
let root;
try {
  root = git(['rev-parse', '--show-toplevel'], process.cwd());
} catch {
  console.error('Run SideShot from inside the project\'s git repository.');
  process.exit(1);
}

// What was asked, checked before anything opens: a mistake is said plainly, and nothing is half done.
let options;
// The GitHub repository is origin's, and every gh call names it: gh alone may pick another (GH_REPO, its default),
// and a pull request there of the same number would be the one read and written.
let slug = null;
try {
  slug = slugOf(git(['remote', 'get-url', 'origin'], root));
} catch {
  // No origin: nothing is published, and the pull request is given.
}
try {
  const configFile = join(root, '.sideshot.json');
  const config = existsSync(configFile) ? configOf(readFileSync(configFile, 'utf8')) : {};
  // The pull request, when it is not given, is the one gh finds for this branch: one step fewer every run.
  if (!args.includes('--pr') && config.pr === undefined && slug !== null) {
    try {
      const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
      const found = execFileSync(
        'gh',
        ['pr', 'list', '--repo', slug, '--head', head, '--state', 'open', '--json', 'number', '--jq', '.[0].number'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (/^\d+$/.test(found)) {
        args.push('--pr', found);
        console.info(`For #${found}, this branch's pull request.`);
      }
    } catch {
      // No gh, or no pull request yet: optionsOf asks for one.
    }
  }
  options = optionsOf(args, config);
  if (options.publish) {
    if (slug === null)
      throw new UsageError('--publish and --update-pr need an origin on GitHub, where the pictures are kept.');
    try {
      git(['check-ref-format', '--branch', options.branch], root);
    } catch {
      throw new UsageError(`git does not take ${options.branch} as a branch name; give --branch another.`);
    }
  }
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(1);
}
const {
  pr, page, before, after, wait, jobs, click, branch, setupPath, chosen, schemes, parts, notes, accent,
  markChanges, watermark, publish, updatePr, reuse,
} = options;
const out = resolve(root, options.out, pr);
// What each run found (pairs left out as the same, or nothing to compare at all), kept beside the pictures by what
// the run was asked, so a run for one page never stands for another's.
const runFile = join(out, 'run.json');
const runKey = runKeyOf(options);
const runs = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : {};

// The pictures that were looked over are the ones published: nothing is taken again, so nothing can differ.
if (reuse) {
  const found = runs[runKey] ?? { same: [], nothing: null };
  const taken = existsSync(out) ? readdirSync(out).filter(isPicture) : [];
  if (taken.length === 0 && found.nothing === null) {
    console.error(`There are no pictures in ${out} to publish: take them first, without --reuse.`);
    process.exit(1);
  }
  if (found.nothing === null)
    console.info(`Publishing the ${String(taken.length)} pictures already in ${out}, as they are.`);
  publishing(taken, found);
  process.exit(0);
}

// Both sides are asked for the page before a browser opens: a server that was not started is said in a line,
// not in a browser's stack after a wait. Any answer will do, even a 404 or a login page, so the address is asked
// without its login; and it is said without one, or a token, since what is printed is read in logs.
const silent = (
  await Promise.all(
    [
      ['--before', before],
      ['--after', after],
    ].map(async ([flag, base]) => {
      try {
        const answer = await fetch(bareOf(`${base}${page}`), {
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
        });
        await answer.body?.cancel();
        return null;
      } catch {
        return `${shownOf(base)} (${flag})`;
      }
    }),
  )
).filter((s) => s !== null);
if (silent.length > 0) {
  console.error(
    `Nothing answers at ${silent.join(' or ')}. Start that server first (for after, the project's dev or ` +
      'preview server, in the background), or give its address.',
  );
  process.exit(1);
}

// Playwright comes from the project, so its version and its browsers are the project's own. A project without
// Node of its own (Python, Ruby, Go, a static site) can use one installed globally instead.
let chromium;
try {
  const require = createRequire(join(root, 'package.json'));
  let found;
  try {
    found = require.resolve('playwright');
  } catch {
    const global = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }).trim();
    found = require.resolve(join(global, 'playwright'));
  }
  const playwright = await import(pathToFileURL(found).href);
  // Loaded as CommonJS, its exports may sit under default.
  chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) throw new Error('no chromium in playwright');
} catch {
  console.error(
    'Playwright is not installed, in this project or globally. Add it, then its browser:\n' +
      '  npm i -D playwright && npx playwright install chromium\n' +
      'or, for a project without a package.json: npm i -g playwright && npx playwright install chromium',
  );
  process.exit(2);
}

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
  // A part drawn late (once its data comes, or once something is pressed) is given up to --wait to appear before
  // it is said to be missing.
  await part.waitFor({ state: 'attached', timeout: Math.max(wait, 1000) }).catch(() => undefined);
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
  // The one wait every part is given (--wait), then until what animates has finished (a reveal, a transition;
  // never one that loops) and the part's height holds.
  await p.waitForTimeout(wait);
  await p.evaluate(`Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
      .map((a) => a.finished.catch(() => undefined))),
    new Promise((ok) => setTimeout(ok, 3000)),
  ]).then(() => undefined)`);
  let height = -1;
  for (let steady = 0, tries = 0; steady < 4 && tries < 60; tries++) {
    const now = Math.round((await part.boundingBox())?.height ?? 0);
    steady = now === height ? steady + 1 : 0;
    height = now;
    await p.waitForTimeout(150);
  }
  // A part taller than the window is pictured beyond it, where a chart can lay out at no height.
  const size = p.viewportSize();
  if (size && height + 80 > size.height) {
    await p.setViewportSize({ width: size.width, height: height + 80 });
    await part.scrollIntoViewIfNeeded();
    await p.waitForTimeout(600);
  }
  // Images in the part, and the part when it is one, loaded (briefly: one that never comes is pictured as it is).
  // A lazy one starts only once it is in view, which is now.
  await part.evaluate((el) =>
    Promise.race([
      Promise.all(
        /** @type {HTMLImageElement[]} */ ([el, ...el.querySelectorAll('img')].filter((i) => i.tagName === 'IMG'))
          .filter((i) => !i.complete)
          .map((i) => new Promise((ok) => {
            i.addEventListener('load', ok);
            i.addEventListener('error', ok);
          })),
      ),
      new Promise((ok) => setTimeout(ok, 5000)),
    ]).then(() => undefined),
  );
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
  const rings = await p.evaluate(
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
  return ringsWithin(rings, clip.width, clip.height);
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error(
    `Playwright could not start Chromium (${String(error.message).split('\n')[0]}).\n` +
      'Install its browser: npx playwright install chromium',
  );
  process.exit(2);
}

/** One picture, on a fresh page with only its part opened: something drawn late elsewhere would move it. */
async function shoot({ device, scheme, when, base, part }) {
  const context = await browser.newContext({
    ...device.options,
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  try {
    const p = await context.newPage();
    if (setup) await setup(p, { when, device: device.name, scheme });
    await p.goto(`${base}${page}`, { waitUntil: 'load' });
    // Development toolbars are not part of the page.
    await p.addStyleTag({
      content: 'astro-dev-toolbar, nextjs-portal, vite-error-overlay { display: none !important; }',
    });
    // Down to the end and back once, so what loads lazily has loaded: until the network goes quiet (briefly:
    // some pages poll forever).
    await p.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
    await p.evaluate('window.scrollTo(0, 0)');
    await p.waitForTimeout(300);
    let pressed = true;
    if (click) {
      // What is pressed may be new, or gone, so on one side only: that side is pictured as it is, and said. What it
      // opens is waited for in picture(), with the part's one wait.
      try {
        await p.locator(click).first().click({ timeout: 5000 });
      } catch {
        pressed = false;
      }
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
    return { name, rings, pressed, said: `${part.name} ${when} on ${label(device.name, scheme)}` };
  } finally {
    await context.close();
  }
}

const shots = [];
for (const device of chosen)
  for (const scheme of schemes)
    for (const [when, base] of [
      ['before', before],
      ['after', after],
    ])
      for (const part of parts) shots.push({ device, scheme, when, base, part });

let taken;
try {
  // Taken a few at a time (--jobs), each in a context of its own, so one never waits on another's page.
  taken = await pool(shots, jobs, shoot);
} catch (error) {
  await browser.close();
  throw error;
}

// A pair the same before and after, pixel for pixel, shows a reviewer nothing: it is not kept, and it is said.
// Compared as taken, before anything is drawn on either side.
const resultOf = new Map(taken.map((t) => [t.name, t]));
const same = [];
const gone = [];
for (const part of parts)
  for (const device of chosen)
    for (const scheme of schemes) {
      const [b, a] = ['before', 'after'].map((when) => pictureName(part.name, device.name, scheme, when));
      const pair = `${part.name} on ${label(device.name, scheme)}`;
      const was = resultOf.get(b).rings !== null;
      const is = resultOf.get(a).rings !== null;
      if (!was && !is) gone.push(pair);
      else if (was && is && readFileSync(join(out, b)).equals(readFileSync(join(out, a)))) {
        same.push(pair);
        for (const f of [b, a]) rmSync(join(out, f));
      }
    }
// Only this run's pictures are finished: one kept from an earlier run (another page) was finished then.
const pngs = taken.filter((t) => t.rings !== null && existsSync(join(out, t.name))).map((t) => t.name);
const nothing = pngs.length === 0 ? nothingOf({ same, gone, page }) : null;
writeFileSync(runFile, `${JSON.stringify({ ...runs, [runKey]: { same, nothing } })}\n`);
for (const f of readdirSync(out)) if (/-overview(?:-\d+)?\.png$/.test(f)) rmSync(join(out, f));
const missing = taken.filter((t) => t.rings === null).map((t) => t.said);
const unpressed = taken.filter((t) => !t.pressed).map((t) => t.said);
const sayGaps = () => {
  if (missing.length > 0) console.info(`Not on the page (new or removed): ${missing.join('; ')}`);
  if (unpressed.length > 0) console.info(`Could not press ${click} for: ${unpressed.join('; ')}`);
};

// Nothing to compare: it stops here, with nothing drawn and no pictures pushed. Asked to publish, it says so in
// the description, and why, in place of a table.
if (nothing !== null) {
  await browser.close();
  console.info(`${nothing} Check that --after runs this branch, and that --page and --part show the change.`);
  sayGaps();
  if (publish) publishing([], { same, nothing });
  process.exit(3);
}

let sheets;
try {
  const ringsOf = new Map(taken.filter((t) => t.rings?.length > 0).map((t) => [t.name, t.rings]));
  // Each picture is finished in a browser canvas: what changed is marked, the notes are ringed, the tag goes in
  // the corner. A picture drawn on keeps a plain copy beside it.
  const dataOf = (name) => `data:image/png;base64,${readFileSync(join(out, name)).toString('base64')}`;
  /** fn run in a page of its own, so pictures are finished side by side too. */
  const inPage = async (fn, arg) => {
    const p = await browser.newPage();
    try {
      return await p.evaluate(fn, arg);
    } finally {
      await p.close();
    }
  };
  const marking = markChanges || ringsOf.size > 0;
  let colour = accent === 'auto' ? null : accent;
  if (colour === null)
    colour = marking
      ? await inPage(pickAccent, { images: pngs.map(dataOf), choices: Object.values(swatches) })
      : swatches.marigold;
  if (marking && accent === 'auto' && colour !== swatches.marigold) {
    const named = Object.entries(swatches).find(([, v]) => v === colour)?.[0] ?? colour;
    console.info(`Marking in ${named}: marigold is too close to the page.`);
  }
  const marked = await pool(pngs, jobs, async (f) => {
    const pair = f.replace(/-after\.png$/, '-before.png');
    const compare = markChanges && f.endsWith('-after.png') && existsSync(join(out, pair));
    const rings = ringsOf.get(f) ?? [];
    // One tag to a pair: it goes on the "after" picture only.
    const tag = watermark && f.endsWith('-after.png');
    if (!compare && rings.length === 0 && !tag) return null;
    const result = await inPage(finish, {
      src: dataOf(f),
      before: compare ? dataOf(pair) : null,
      rings,
      colour,
      scale: 2,
      tag,
    });
    if (rings.length > 0 || result.changed > 0) cpSync(join(out, f), join(out, plainOf(f)));
    writeFileSync(join(out, f), Buffer.from(result.png, 'base64'));
    return compare ? { f, changed: result.changed } : null;
  });

  // The overview sheets, to look over in one image or a few instead of every picture one by one.
  sheets = sheetsOf({ parts, chosen, schemes, files: new Set(pngs) });
  await pool(sheets, jobs, async ({ file, rows }) => {
    const png = await inPage(sheet, {
      rows: rows.map((r) => ({
        label: r.label,
        before: r.before && dataOf(r.before),
        after: r.after && dataOf(r.after),
      })),
    });
    writeFileSync(join(out, file), Buffer.from(png, 'base64'));
  });

  // Said in a few lines, whatever the number of pictures: an agent reads every one of them.
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.info(`Took ${String(pngs.length)} pictures into ${out} in ${seconds}s.`);
  console.info(`Look them over in: ${sheets.map((s) => s.file).join(', ')}`);
  if (same.length > 0) console.info(`The same before and after, so not kept: ${same.join(', ')}.`);
  const compared = marked.filter((m) => m !== null);
  if (compared.length > 0) {
    const areas = compared.reduce((sum, m) => sum + m.changed, 0);
    const none = compared.filter((m) => m.changed === 0).map((m) => m.f);
    console.info(
      `Marked ${String(areas)} changed area(s) on ${String(compared.length - none.length)} of ` +
        `${String(compared.length)} after pictures${none.length > 0 ? `; nothing changed on ${none.join(', ')}` : ''}.`,
    );
  }
  sayGaps();
} finally {
  await browser.close();
}
// Every picture kept for the pull request, from this run and earlier ones (another page), goes to its folder.
if (publish) publishing(readdirSync(out).filter(isPicture), { same, nothing: null });

/** The pictures pushed to their own branch, and the table made of them: printed, or put in the description. With
 * nothing to compare, nothing is pushed, and the description says so, and why. */
function publishing(pngs, { same, nothing }) {
  if (nothing === null) {
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
  }

  const files = new Set(readdirSync(out));
  const table =
    nothing === null
      ? tableOf({ parts, chosen, schemes, notes, files, before, after, page, slug, branch, pr, same })
      : nothingTableOf({ why: nothing, before, after, page });
  writeFileSync(join(out, 'table.md'), `${table}\n`);

  if (updatePr) {
    // The table goes between markers in the description, so running again replaces it instead of adding one.
    const body = execFileSync('gh', ['pr', 'view', pr, '--json', 'body', '--jq', '.body', '--repo', slug], {
      cwd: root,
      encoding: 'utf8',
    });
    const next = bodyWith(body, table);
    const file = join(out, 'body.md');
    writeFileSync(file, next);
    execFileSync('gh', ['pr', 'edit', pr, '--body-file', file, '--repo', slug], { cwd: root, stdio: 'inherit' });
    // The table is in the description, and in table.md: not printed again, where it would only be read again.
    console.info(
      nothing === null
        ? `Pushed the pictures to ${branch} and put the table in the description of #${pr}.`
        : `Said in the description of #${pr} that there was nothing to compare, and why.`,
    );
  } else if (nothing === null) {
    console.info(`Pushed the pictures to ${branch}. The table, also in ${join(out, 'table.md')}:\n\n${table}\n`);
  } else {
    console.info(`What the description would say, also in ${join(out, 'table.md')}:\n\n${table}\n`);
  }
}
