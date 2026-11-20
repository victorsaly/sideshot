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
/* global document, getComputedStyle, scrollX, scrollY, window, Node, NodeFilter -- only in the functions picture() and
   hiddenOn() hand to the page, which run there. */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { cover, finish, pickAccent, sheet, strike } from './draw.mjs';
import { fieldKindOf, hiddenIn, hiddenSaidOf, masksOf, sensitiveIn } from './hide.mjs';
import {
  UsageError,
  attachmentLinkOf,
  attachmentNameOf,
  azureApiOf,
  azureAuthOf,
  azureBaseOf,
  azureOf,
  azurePrOf,
  bodyWith,
  checkOf,
  describedWith,
  configOf,
  bareOf,
  isPicture,
  label,
  nothingOf,
  nothingTableOf,
  optionsOf,
  ownThreadOf,
  pictureName,
  plainOf,
  pool,
  prFoldersOf,
  prOfBranch,
  pruneOptionsOf,
  ringsWithin,
  runKeyOf,
  runOf,
  runsOf,
  sheetsOf,
  shownOf,
  slugOf,
  swatches,
  textDiffOf,
  tableOf,
  toPrune,
  usage,
} from './lib.mjs';

const started = Date.now();
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.info(usage);
  process.exit(0);
}

// git's own words are kept, not printed: a question with a "no" for an answer (is there an origin?) must not show as
// an error. When git does fail, what it said is in the error it throws.
const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// The project is the git repository the command runs in, not the folder this script ships in.
let root;
try {
  root = git(['rev-parse', '--show-toplevel'], process.cwd());
} catch {
  console.error('Run SideShot from inside the project\'s git repository.');
  process.exit(1);
}

let remote = '';
try {
  remote = git(['remote', 'get-url', 'origin'], root);
} catch {
  // No origin: nothing is published, and the pull request is given.
}
// Where the pictures go: a branch of the GitHub repository, or attachments of the pull request on Azure DevOps.
const azure = azureOf(remote);
const azureApi = azure && azureApiOf(azure, azureBaseOf(process.env));
// Azure DevOps' own application, which the Azure CLI issues a sign-in for.
const azureDevOps = '499b84ac-1321-427f-aa17-267ca6975798';
// An answer from Azure DevOps slower than this is not coming: an upload of a picture takes a second or two.
const azureWait = 30_000;

/** The GitHub repository the pictures go to (null on Azure DevOps, which keeps them with the pull request), or a
 * UsageError saying why they cannot go anywhere: origin is on neither, or git does not take the branch name. */
function publishingTo(branch) {
  if (azure) return null;
  const slug = slugOf(remote);
  if (slug === null)
    throw new UsageError('SideShot publishes only to an origin on GitHub or Azure DevOps, where the pictures are kept.');
  try {
    git(['check-ref-format', '--branch', branch], root);
  } catch {
    throw new UsageError(`git does not take ${branch} as a branch name; give --branch another.`);
  }
  return slug;
}

/** Takes off the branch the pictures of pull requests closed long enough ago. The branch is written again as one
 * commit of what is left, so those pictures leave its history too and the repository gets smaller; the push is
 * refused if anyone pushed to the branch since it was read. The pull requests are looked up in repo, the one
 * origin is, never in whatever repository gh would pick by itself. */
function prune({ branch, olderThan }, repo) {
  if (git(['ls-remote', 'origin', `refs/heads/${branch}`], root) === '') {
    console.info(`Nothing to prune: there is no ${branch} branch.`);
    return;
  }
  git(['fetch', '-q', 'origin', `refs/heads/${branch}`], root);
  const tip = git(['rev-parse', 'FETCH_HEAD'], root);
  const entries = git(['ls-tree', '-z', tip], root).split('\0').filter(Boolean);
  const nameOf = (entry) => entry.slice(entry.indexOf('\t') + 1);
  const prs = JSON.parse(
    execFileSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,closedAt', '--repo', repo], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  const gone = toPrune(prFoldersOf(entries), prs, Date.now(), olderThan);
  if (gone.length === 0) {
    console.info(`Nothing to prune: no pull request with pictures on ${branch} closed ${String(olderThan)} days ago or more.`);
    return;
  }
  // Only a folder of that name goes; a file named like one stays.
  const kept = entries.filter((entry) => !(entry.split(' ')[1] === 'tree' && gone.includes(nameOf(entry))));
  const tree = execFileSync('git', ['mktree', '-z'], { cwd: root, input: kept.map((e) => `${e}\0`).join(''), encoding: 'utf8' }).trim();
  const said = `#${gone.join(', #')}`;
  const commit = git(['commit-tree', tree, '-m', `chore: prune the pictures of ${said}`], root);
  try {
    git(['push', '-q', `--force-with-lease=refs/heads/${branch}:${tip}`, 'origin', `${commit}:refs/heads/${branch}`], root);
  } catch (error) {
    console.error(
      `git could not push the pruned ${branch} to origin:\n  ${refusal(error)}\n` +
        `Nothing was taken off. If someone pushed to ${branch} since it was read, run it again.`,
    );
    process.exit(1);
  }
  console.info(`Took the pictures of ${said} off ${branch}. Those pull requests no longer show them.`);
}

// What was asked, checked before anything opens: a mistake is said plainly, and nothing is half done.
let options;
let pruning = null;
// The GitHub repository is origin's, and every gh call names it: gh alone may pick another (GH_REPO, its default),
// and a pull request there of the same number would be the one read and written.
let slug = slugOf(remote);

/** The sign-in to Azure DevOps, worked out once: a token in the environment, else the Azure CLI's (az login), else
 * null. */
let azureAuth;
function azureSignIn() {
  if (azureAuth !== undefined) return azureAuth;
  azureAuth = azureAuthOf(process.env);
  if (azureAuth === null) {
    try {
      // One line of fixed words through a shell: az is az.cmd on Windows, which only a shell runs.
      const token = execSync(`az account get-access-token --resource ${azureDevOps} --query accessToken -o tsv`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (token !== '') azureAuth = `Bearer ${token}`;
    } catch {
      // No Azure CLI, or not signed in: said where a sign-in is needed.
    }
  }
  return azureAuth;
}

/** Playwright's Chromium, and where Playwright was found: the project's, else one installed globally. Throws when
 * there is none. */
async function playwrightOf() {
  const require = createRequire(join(root, 'package.json'));
  let found;
  let where = 'project';
  try {
    found = require.resolve('playwright');
  } catch {
    // One line of fixed words through a shell: npm is npm.cmd on Windows, which only a shell runs.
    const globalModules = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    found = require.resolve(join(globalModules, 'playwright'));
    where = 'global';
  }
  const playwright = await import(pathToFileURL(found).href);
  // Loaded as CommonJS, its exports may sit under default.
  const browserType = playwright.chromium ?? playwright.default?.chromium;
  if (!browserType) throw new Error('no chromium in playwright');
  return { chromium: browserType, where };
}

/** --check: what SideShot needs on this machine, looked for and said, with nothing changed. Exit 0 when pictures can
 * be taken and published, 2 when something is missing. */
async function checking() {
  let playwright = null;
  let browser = false;
  try {
    const found = await playwrightOf();
    playwright = found.where;
    try {
      await (await found.chromium.launch()).close();
      browser = true;
    } catch {
      // No browser for this Playwright: said, with the command that adds it.
    }
  } catch {
    // No Playwright: said, with the command that adds it.
  }
  const host = azure ? 'azure' : slugOf(remote) ? 'github' : null;
  let signedIn = false;
  if (host === 'azure') signedIn = azureSignIn() !== null;
  else if (host === 'github') {
    try {
      execFileSync('gh', ['auth', 'status', '--hostname', 'github.com'], { stdio: 'ignore' });
      signedIn = true;
    } catch {
      // No gh, or not signed in.
    }
  }
  let ignored = true;
  try {
    git(['check-ignore', '-q', '.sideshot/x'], root);
  } catch {
    ignored = false;
  }
  const { lines, ready, all } = checkOf({
    node: process.versions.node,
    playwright,
    browser,
    packageJson: existsSync(join(root, 'package.json')),
    host,
    signedIn,
    ignored,
    windows: process.platform === 'win32',
  });
  console.info(lines.join('\n'));
  console.info(
    all
      ? '\nEverything SideShot needs is here.'
      : ready
        ? '\nPictures can be taken; see above for what is left.'
        : '\nNot ready yet: run what is said above (ask the person first), then --check again.',
  );
  process.exit(all ? 0 : 2);
}
if (args.includes('--check')) await checking();

/** What Azure DevOps refused, said in a sentence without a stack. */
class AzureRefusal extends Error {}

/** One request to the repository's Git API on Azure DevOps, signed in: its answer as JSON, or an AzureRefusal that
 * says what it answered. */
async function azureCall(method, path, body, type = 'application/json') {
  const answer = await fetch(`${azureApi}${path}${path.includes('?') ? '&' : '?'}api-version=7.1`, {
    method,
    headers: { authorization: azureSignIn(), accept: 'application/json', ...(body === undefined ? {} : { 'content-type': type }) },
    body: body === undefined || type !== 'application/json' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(azureWait),
  });
  if (!answer.ok) {
    await answer.body?.cancel();
    throw new AzureRefusal(`Azure DevOps answered ${String(answer.status)} to ${method} ${path.split('?')[0]}`);
  }
  return answer.json();
}

try {
  const configFile = join(root, '.sideshot.json');
  const config = existsSync(configFile) ? configOf(readFileSync(configFile, 'utf8')) : {};
  if (args.includes('--prune')) {
    pruning = pruneOptionsOf(args, config);
    if (azure) {
      console.info('Nothing to prune on Azure DevOps: the pictures are attachments of their pull request, and go with it.');
      process.exit(0);
    }
    slug = publishingTo(pruning.branch);
  } else {
    // The pull request, when it is not given, is the one gh finds for this branch: one step fewer every run. Only
    // one from this repository is taken (prOfBranch): gh matches the branch by name alone, forks too.
    if (!args.includes('--pr') && config.pr === undefined && slug !== null) {
      try {
        const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
        const found = prOfBranch(
          JSON.parse(
            execFileSync(
              'gh',
              ['pr', 'list', '--repo', slug, '--head', head, '--state', 'open', '--json', 'number,isCrossRepository'],
              { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
            ),
          ),
        );
        if (found !== null) {
          args.push('--pr', found);
          console.info(`For #${found}, this branch's pull request.`);
        }
      } catch {
        // No gh, no pull request yet, or more than one: optionsOf asks for one.
      }
    }
    // On Azure DevOps, the one Azure DevOps lists from this branch, when there is a sign-in to ask it with.
    if (!args.includes('--pr') && config.pr === undefined && azure && azureSignIn() !== null) {
      try {
        const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
        const from = encodeURIComponent(`refs/heads/${head}`);
        const found = azurePrOf(await azureCall('GET', `/pullrequests?searchCriteria.sourceRefName=${from}&searchCriteria.status=active`));
        if (found !== null) {
          args.push('--pr', found);
          console.info(`For #${found}, this branch's pull request.`);
        }
      } catch {
        // Not reached, or not allowed: optionsOf asks for the pull request, and publishing says what is wrong.
      }
    }
    options = { ...optionsOf(args, config), masks: masksOf(args, config) };
    if (options.publish) slug = publishingTo(options.branch);
  }
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(1);
}
// gh, there and signed in, before anything that needs it (the description, or the pull requests to prune): said
// now, plainly, not as gh's own error halfway through, with the pictures pushed and no table.
if (!pruning && options.publish && azure && azureSignIn() === null) {
  console.error(
    `${options.updatePr ? '--update-pr' : '--publish'} needs a sign-in to Azure DevOps: az login (the Azure CLI), ` +
      'or a personal access token with Code (read and write) in AZURE_DEVOPS_EXT_PAT.',
  );
  process.exit(2);
}
if ((pruning || options.updatePr) && !azure) {
  const forWhat = pruning ? '--prune' : '--update-pr';
  try {
    execFileSync('gh', ['auth', 'status', '--hostname', 'github.com'], { stdio: 'ignore' });
  } catch (error) {
    console.error(
      error.code === 'ENOENT'
        ? `${forWhat} needs the GitHub CLI: install it (https://cli.github.com), then sign in with gh auth login.`
        : `${forWhat} needs the GitHub CLI signed in: gh auth login, then gh auth status to check.`,
    );
    process.exit(2);
  }
}
/** What git said when a push was refused, without its own hints and addresses, for the one sentence that says so. */
const refusal = (error) =>
  String(error.stderr ?? error.message)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('To ') && !line.startsWith('hint:'))
    .join('\n  ');
// Pruning needs no browser.
if (pruning) {
  prune(pruning, slug);
  process.exit(0);
}
const {
  pr, page, before, after, wait, jobs, click, branch, setupPath, chosen, schemes, parts, notes, accent,
  markChanges, watermark, publish, updatePr, reuse, onlyNew, masks,
} = options;
// The sides pictured: something new has only after.
const sides = onlyNew ? [['after', after]] : [['before', before], ['after', after]];
const out = resolve(root, options.out, pr);
// What each run found (pairs left out as the same, or nothing to compare at all), kept beside the pictures by what
// the run was asked, so a run for one page never stands for another's.
const runFile = join(out, 'run.json');
const runKey = runKeyOf(options);
// Read as it is, not checked first: there is no moment between a check and the read for it to change in.
let runs = {};
try {
  runs = runsOf(readFileSync(runFile, 'utf8'));
} catch {
  // None kept yet, or not readable: each run says again what it found.
}

// The pictures that were looked over are the ones published: nothing is taken again, so nothing can differ.
if (reuse) {
  const found = runOf(runs, runKey);
  const kept = existsSync(out) ? readdirSync(out).filter(isPicture) : [];
  if (kept.length === 0 && found.nothing === null) {
    console.error(`There are no pictures in ${out} to publish: take them first, without --reuse.`);
    process.exit(1);
  }
  if (found.nothing === null)
    console.info(`Publishing the ${String(kept.length)} pictures already in ${out}, as they are.`);
  await publishing(kept, found);
  process.exit(0);
}

// Both sides are asked for the page before a browser opens: a server that was not started is said in a line,
// not in a browser's stack after a wait. Any answer will do, even a 404 or a login page, so the address is asked
// without its login; and it is said without one, or a token, since what is printed is read in logs.
const silent = (
  await Promise.all(
    sides.map(async ([when, base]) => {
      const flag = `--${when}`;
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
  ({ chromium } = await playwrightOf());
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

// How long a page is waited for, in milliseconds. All but `step` are the most it is given: a page ready sooner is
// pictured sooner, and one never ready is pictured as it is, so a longer wait only slows the pages that never settle.
const waits = {
  // A part drawn by the server is there at once; one drawn by script, a moment later. --wait can be longer.
  appear: 1000,
  // A reveal or a transition: a few hundred milliseconds, rarely a second. One longer is pictured where it is.
  animations: 3000,
  // The part's height is read every `step`; it holds once `holds` reads in a row agree (0.6 s), and a part that
  // never stops growing (a feed, a ticker) is given `reads` of them (9 s) before it is pictured as it is.
  step: 150,
  holds: 4,
  reads: 60,
  // A window made taller lays out again: a frame or two, and a chart's own transition.
  resized: 600,
  // An image that has not come by then is not coming.
  images: 5000,
  // Lazy content, once scrolled to: most pages go quiet in a second or two, and some poll for ever.
  quiet: 8000,
  // Scrolled back to the top, the page's own scroll handlers run (a sticky header, a reveal) before it goes on.
  scrolledBack: 300,
  // Something to press that is not there by then is said not to have been pressed.
  press: 5000,
};
// Room below a part taller than the window, so it ends inside it, with what it sits on.
const below = 80;
// A ring's number is a disc of radius 15 px, centred 7 px out from what it rings, with a 1 px edge: it reaches
// 23 px out, and 28 keeps all of it in the picture.
const ringRoom = 28;

/** fn run in a page of its own, blank, so pictures are finished side by side too, and no page's own rules (its
 * content security policy) stand in the way. */
const inPage = async (fn, arg) => {
  const p = await browser.newPage();
  try {
    return await p.evaluate(fn, arg);
  } finally {
    await p.close();
  }
};

// What is hidden is covered in one colour, a slate grey that reads as covered on a light page and a dark one.
const coverColour = '#4b5563';
// The pictures are taken at twice the page's pixels, so they stay sharp on a reviewer's screen.
const scale = 2;

/** What is private in the picture's area of the page (clip, in the page's CSS pixels), found as it shows: the words
 * sensitiveIn finds, the filled fields fieldKindOf says are private, and every element of the masks. Returns how
 * many of each kind, the boxes that cover them (in the picture's pixels), and the masks that found nothing. */
async function hiddenOn(p, clip, masks) {
  // The words as each block of the page lays them out, open shadow roots too: a card number set in a span for each
  // group of four is one run of words there, not four. Held by the page for the second look.
  const found = await p.evaluate((c) => {
    const inside = (r) =>
      r.width > 0 && r.height > 0 && r.right + scrollX > c.x && r.left + scrollX < c.x + c.width &&
      r.bottom + scrollY > c.y && r.top + scrollY < c.y + c.height;
    const isBlock = new Map();
    const blockOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        if (!isBlock.has(e)) isBlock.set(e, !/^(?:inline|contents)$/.test(getComputedStyle(e).display));
        if (isBlock.get(e)) return e;
      }
      return null;
    };
    const runs = [], fields = [];
    const roots = /** @type {Node[]} */ ([document.body]);
    while (roots.length > 0) {
      const walker = document.createTreeWalker(/** @type {Node} */ (roots.pop()), NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let run = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          const parent = n.parentElement;
          if (!parent || /^(?:SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA)$/.test(parent.tagName)) continue;
          const text = /** @type {Text} */ (n);
          const block = blockOf(parent);
          if (run === null || run.block !== block) runs.push((run = { block, nodes: [], starts: [], words: '', shows: false }));
          run.nodes.push(text);
          run.starts.push(run.words.length);
          run.words += text.data;
          if (!run.shows && text.data.trim() !== '') {
            const range = document.createRange();
            range.selectNodeContents(text);
            run.shows = inside(range.getBoundingClientRect());
          }
          continue;
        }
        const el = /** @type {HTMLInputElement} */ (n);
        if (el.shadowRoot) roots.push(el.shadowRoot);
        if (/^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && inside(el.getBoundingClientRect())) fields.push(el);
      }
    }
    const shown = runs.filter((r) => r.shows);
    /** @type {any} */ (window).sideshotFound = { runs: shown, fields };
    return {
      words: shown.map((r) => r.words),
      // A select shows the words of what is chosen, not its value.
      fields: fields.map((f) => ({
        value: f.tagName === 'SELECT' ? (/** @type {HTMLSelectElement} */ (/** @type {unknown} */ (f)).selectedOptions[0]?.text ?? '') : f.value,
        autocomplete: f.getAttribute('autocomplete') ?? '',
      })),
    };
  }, clip);
  const matches = found.words.flatMap((words, i) => sensitiveIn(words).map((m) => ({ ...m, i })));
  const kinds = found.fields.map(fieldKindOf);
  const at = await p.evaluate(({ matches, kinds }) => {
    const { runs, fields } = /** @type {any} */ (window).sideshotFound;
    const onPage = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    // Where in its run's texts a place in the run's words is: the last text that starts at or before it.
    /** @returns {[Node, number]} */
    const pointOf = (run, place) => {
      let k = run.starts.length - 1;
      while (k > 0 && run.starts[k] > place) k--;
      return [run.nodes[k], Math.min(place - run.starts[k], run.nodes[k].data.length)];
    };
    return {
      words: matches.map(({ i, start, end }) => {
        const range = document.createRange();
        range.setStart(...pointOf(runs[i], start));
        range.setEnd(...pointOf(runs[i], end));
        return [...range.getClientRects()].map(onPage);
      }),
      fields: fields.map((f, k) => (kinds[k] === null ? [] : [onPage(f.getBoundingClientRect())])),
    };
  }, { matches, kinds });
  const shows = (r) =>
    r.w > 0 && r.h > 0 && r.x < clip.x + clip.width && r.y < clip.y + clip.height && r.x + r.w > clip.x && r.y + r.h > clip.y;
  // An element named by two masks is one thing hidden, not two. One with no box of its own (display: contents)
  // shows only what is in it, so that is what is covered.
  const marked = new Map();
  const unmatched = [];
  for (const selector of masks) {
    let elements;
    try {
      elements = await p.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const onPage = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
          if (el.getClientRects().length > 0) return [onPage(el.getBoundingClientRect())];
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].map(onPage);
        }),
      );
    } catch {
      throw new UsageError(`Cannot read --mask ${selector} as a selector. Give one like .customer-name or [data-private].`);
    }
    // Found only where the picture does not reach, it hides nothing on it, and is said like one that found nothing.
    if (!elements.some((rects) => rects.some(shows))) unmatched.push(selector);
    for (const rects of elements) marked.set(JSON.stringify(rects), rects);
  }
  const things = [
    ...matches.map((m, k) => ({ kind: m.kind, rects: at.words[k] })),
    ...kinds.map((kind, k) => ({ kind, rects: at.fields[k] })).filter((t) => t.kind !== null),
    ...[...marked.values()].map((rects) => ({ kind: 'marked', rects })),
  ]
    .map((t) => ({ ...t, rects: t.rects.filter(shows) }))
    .filter((t) => t.rects.length > 0);
  const counts = {};
  for (const t of things) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  // A pixel past each edge, for a page laid out at fractions of one.
  const boxes = things.flatMap((t) =>
    t.rects.map((r) => [r.x - clip.x - 1, r.y - clip.y - 1, r.x - clip.x + r.w + 1, r.y - clip.y + r.h + 1].map((v) => v * scale)),
  );
  return { counts, boxes, unmatched };
}

/** Opens what the part sits in, lets it settle, and pictures it. Returns where each noted element sits in the
 * picture, in CSS pixels, and the part's words as the page shows them, or null when the page has no such part. */
async function picture(p, selector, file, noted = [], margin = 0) {
  const part = p.locator(selector).first();
  // A part drawn late (once its data comes, or once something is pressed) is given up to --wait to appear before
  // it is said to be missing.
  await part.waitFor({ state: 'attached', timeout: Math.max(wait, waits.appear) }).catch(() => undefined);
  if ((await part.count()) === 0) return null;
  // On the element the locator found, not one the page looks up again: a selector of Playwright's own
  // (:has-text, text=) is not one the page's querySelector can read.
  await part.evaluate((el) => {
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    if (el.tagName === 'DETAILS') /** @type {HTMLDetailsElement} */ (el).open = true;
    // A tall part is pictured in strips as the page scrolls; a sticky bar would be stamped across it.
    for (const node of document.querySelectorAll('*'))
      if (getComputedStyle(node).position === 'sticky') /** @type {HTMLElement} */ (node).style.position = 'static';
  });
  await part.scrollIntoViewIfNeeded();
  // The one wait every part is given (--wait), then until what animates has finished (a reveal, a transition;
  // never one that loops) and the part's height holds.
  await p.waitForTimeout(wait);
  await p.evaluate(`Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
      .map((a) => a.finished.catch(() => undefined))),
    new Promise((ok) => setTimeout(ok, ${waits.animations})),
  ]).then(() => undefined)`);
  let height = -1;
  for (let steady = 0, tries = 0; steady < waits.holds && tries < waits.reads; tries++) {
    const now = Math.round((await part.boundingBox())?.height ?? 0);
    steady = now === height ? steady + 1 : 0;
    height = now;
    await p.waitForTimeout(waits.step);
  }
  // A part taller than the window is pictured beyond it, where a chart can lay out at no height.
  const size = p.viewportSize();
  if (size && height + below > size.height) {
    await p.setViewportSize({ width: size.width, height: height + below });
    await part.scrollIntoViewIfNeeded();
    await p.waitForTimeout(waits.resized);
  }
  // Images in the part, and the part when it is one, loaded (briefly: one that never comes is pictured as it is).
  // A lazy one starts only once it is in view, which is now. This runs in the page, so the wait is handed to it.
  await part.evaluate((el, ms) =>
    Promise.race([
      Promise.all(
        /** @type {HTMLImageElement[]} */ ([el, ...el.querySelectorAll('img')].filter((i) => i.tagName === 'IMG'))
          .filter((i) => !i.complete)
          .map((i) => new Promise((ok) => {
            i.addEventListener('load', ok);
            i.addEventListener('error', ok);
          })),
      ),
      new Promise((ok) => setTimeout(ok, ms)),
    ]).then(() => undefined),
    waits.images,
  );
  // A ring sits just outside what it marks: with notes, both pictures take the same margin, so no ring or
  // number is cut off and before and after stay the same size.
  const box = await part.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  });
  const clip = margin === 0
    ? box
    : { x: Math.max(0, box.x - margin), y: Math.max(0, box.y - margin), width: box.width + 2 * margin, height: box.height + 2 * margin };
  // What is private is covered before the picture is written, so it never reaches the disk, let alone a pull request.
  // It is looked for just before the picture and just after, and both are covered: a page that moves or redraws
  // something private while it is pictured (a poll, a ticker) shows it in one place or the other.
  const was = await hiddenOn(p, clip, masks);
  const taken = margin === 0 ? await part.screenshot() : await p.screenshot({ fullPage: true, clip });
  const now = await hiddenOn(p, clip, masks);
  const hidden = {
    boxes: [...was.boxes, ...now.boxes],
    counts: Object.fromEntries(
      [...new Set([...Object.keys(was.counts), ...Object.keys(now.counts)])].map((k) => [k, Math.max(was.counts[k] ?? 0, now.counts[k] ?? 0)]),
    ),
    unmatched: was.unmatched.filter((m) => now.unmatched.includes(m)),
  };
  writeFileSync(
    file,
    hidden.boxes.length === 0
      ? taken
      : Buffer.from(await inPage(cover, { src: `data:image/png;base64,${taken.toString('base64')}`, boxes: hidden.boxes, colour: coverColour }), 'base64'),
  );
  // The rings are drawn on the picture afterwards, in the one colour chosen for the whole set; here they are
  // only measured, each found by its own locator, like the part.
  const rings = [];
  for (const note of noted) {
    const target = p.locator(note.selector).first();
    if ((await target.count()) === 0) continue;
    const r = await target.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    });
    rings.push({ n: note.n, x: r.x - clip.x, y: r.y - clip.y, w: r.w, h: r.h });
  }
  // The part's words, for the table to say which changed: a mark cannot name a word. Hidden there as on the
  // picture: what is marked to hide says [hidden] (the page is closed after this), and so does what the words show.
  for (const selector of masks)
    await p.locator(selector).evaluateAll((els) => {
      for (const el of els) el.textContent = '[hidden]';
    });
  const text = hiddenIn(await part.evaluate((el) => /** @type {HTMLElement} */ (el).innerText).catch(() => ''));
  return { rings: ringsWithin(rings, clip.width, clip.height), text, hidden: hidden.counts, unmatched: hidden.unmatched };
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
    deviceScaleFactor: scale,
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
    await p.waitForLoadState('networkidle', { timeout: waits.quiet }).catch(() => undefined);
    await p.evaluate('window.scrollTo(0, 0)');
    await p.waitForTimeout(waits.scrolledBack);
    let pressed = true;
    if (click) {
      // What is pressed may be new, or gone, so on one side only: that side is pictured as it is, and said. What it
      // opens is waited for in picture(), with the part's one wait.
      try {
        await p.locator(click).first().click({ timeout: waits.press });
      } catch {
        pressed = false;
      }
    }
    const name = pictureName(part.name, device.name, scheme, when);
    // An older picture of a part that is no longer there must not pass for the current one.
    rmSync(join(out, name), { force: true });
    rmSync(join(out, plainOf(name)), { force: true });
    const shot = await picture(
      p,
      part.selector,
      join(out, name),
      when === 'after' ? notes : [],
      notes.length > 0 ? ringRoom : 0,
    );
    return {
      name,
      rings: shot === null ? null : shot.rings,
      text: shot === null ? null : shot.text,
      hidden: shot === null ? {} : shot.hidden,
      unmatched: shot === null ? null : shot.unmatched,
      pressed,
      when,
      said: `${part.name} ${when} on ${label(device.name, scheme)}`,
    };
  } finally {
    await context.close();
  }
}

const shots = [];
for (const device of chosen)
  for (const scheme of schemes)
    for (const [when, base] of sides)
      for (const part of parts) {
        shots.push({ device, scheme, when, base, part });
        // A before kept from an earlier run of this part must not pass for one of something new.
        if (onlyNew) rmSync(join(out, pictureName(part.name, device.name, scheme, 'before')), { force: true });
      }

let taken;
try {
  // Taken a few at a time (--jobs), each in a context of its own, so one never waits on another's page.
  taken = await pool(shots, jobs, shoot);
} catch (error) {
  await browser.close();
  // A --mask that is not a selector is said in a line: nothing was kept, since it could not be hidden.
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(1);
}

// A pair the same before and after, pixel for pixel, shows a reviewer nothing: it is not kept, and it is said.
// Compared as taken, before anything is drawn on either side.
const resultOf = new Map(taken.map((t) => [t.name, t]));
const same = [];
const gone = [];
// What the part's words say now that they did not, by "after" picture, for the table to say under the pair.
const texts = {};
// Each "after" picture's pair, named as the run names it, for what is said of it after it is marked.
const pairOf = new Map();
for (const part of parts)
  for (const device of chosen)
    for (const scheme of schemes) {
      const [b, a] = ['before', 'after'].map((when) => pictureName(part.name, device.name, scheme, when));
      const pair = `${part.name} on ${label(device.name, scheme)}`;
      pairOf.set(a, pair);
      if (onlyNew) {
        if (resultOf.get(a).rings === null) gone.push(pair);
        continue;
      }
      const was = resultOf.get(b).rings !== null;
      const is = resultOf.get(a).rings !== null;
      if (!was && !is) gone.push(pair);
      else if (was && is && readFileSync(join(out, b)).equals(readFileSync(join(out, a)))) {
        same.push(pair);
        for (const f of [b, a]) rmSync(join(out, f));
      } else if (was && is) {
        const lines = textDiffOf(resultOf.get(b).text, resultOf.get(a).text);
        if (lines.length > 0) texts[a] = lines;
      }
    }
// Only this run's pictures are finished: one kept from an earlier run (another page) was finished then.
const pngs = taken.filter((t) => t.rings !== null && existsSync(join(out, t.name))).map((t) => t.name);
const nothing = pngs.length === 0 ? nothingOf({ same, gone, page, onlyNew }) : null;
writeFileSync(runFile, `${JSON.stringify({ ...runs, [runKey]: { same, nothing, texts } })}\n`);
for (const f of readdirSync(out)) if (/-overview(?:-\d+)?\.png$/.test(f)) rmSync(join(out, f));
const missing = taken.filter((t) => t.rings === null).map((t) => t.said);
const unpressed = taken.filter((t) => !t.pressed).map((t) => t.said);
// An "after" picture with no before is of something new: it is shown as it is, with nothing drawn on it.
const fresh = new Set(
  taken
    .filter((t) => t.when === 'after' && t.rings !== null && (onlyNew || resultOf.get(t.name.replace(/-after\.png$/, '-before.png')).rings === null))
    .map((t) => t.name),
);
// Nothing of it before, found rather than said with --new, which would not have opened before at all.
// Every part looked for before, not only those kept: one left out for being the same was there.
const foundNew = !onlyNew && pngs.length > 0 && taken.every((t) => t.when !== 'before' || t.rings === null);
// The most of each kind hidden on any one picture: before and after show the same page, so most are on both.
const hid = {};
for (const t of taken) for (const [kind, n] of Object.entries(t.hidden)) hid[kind] = Math.max(hid[kind] ?? 0, n);
// A --mask that found nothing on any picture is likely a typo, and what it was to hide may show: said, every time.
// What the page marks with data-sideshot-mask is looked for always, and is most often not there.
const nowhere = masks.slice(1).filter((m) => taken.every((t) => t.unmatched === null || t.unmatched.includes(m)));
const sayGaps = () => {
  const said = hiddenSaidOf(hid);
  if (said !== null) console.info(said);
  for (const m of nowhere) console.info(`--mask ${m} found nothing on any picture: check the selector.`);
  if (missing.length > 0) console.info(`Not on the page${onlyNew ? '' : ' (new or removed)'}: ${missing.join('; ')}`);
  if (foundNew)
    console.info('None of it is on before, so it is shown as new, with nothing drawn on it. --new does that sooner, without opening before.');
  if (unpressed.length > 0) console.info(`Could not press ${click} for: ${unpressed.join('; ')}`);
};

// Nothing to compare: it stops here, with nothing drawn and no pictures pushed. Asked to publish, it says so in
// the description (on Azure DevOps, in its comment), and why, in place of a table.
if (nothing !== null) {
  await browser.close();
  console.info(`${nothing} Check that --after runs this branch, and that --page and --part show the change.`);
  sayGaps();
  if (publish) await publishing([], { same, nothing });
  process.exit(3);
}

let sheets, whole, loupes, drawn;
try {
  const ringsOf = new Map(taken.filter((t) => t.rings?.length > 0 && !fresh.has(t.name)).map((t) => [t.name, t.rings]));
  // The notes with a ring somewhere, which are the ones the table says in words.
  drawn = [...new Set([...ringsOf.values()].flat().map((r) => r.n))].sort((x, y) => x - y);
  // Each picture is finished in a browser canvas: what changed is marked, the notes are ringed, the tag goes in
  // the corner. A picture drawn on keeps a plain copy beside it.
  const dataOf = (name) => `data:image/png;base64,${readFileSync(join(out, name)).toString('base64')}`;
  const marking = (markChanges && pngs.some((f) => !fresh.has(f))) || ringsOf.size > 0;
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
      scale,
      tag,
    });
    if (rings.length > 0 || result.changed > 0) cpSync(join(out, f), join(out, plainOf(f)));
    writeFileSync(join(out, f), Buffer.from(result.png, 'base64'));
    return compare ? { f, pair, changed: result.changed, gone: result.gone, whole: result.whole, loupes: result.loupes } : null;
  });
  // Where something was taken out, the "before" picture is struck there, once every picture is finished, so
  // no two pages write one picture; it keeps a plain copy too, unless a ring already made one.
  for (const m of marked) {
    if (m === null || m.gone.length === 0) continue;
    if (!existsSync(join(out, plainOf(m.pair)))) cpSync(join(out, m.pair), join(out, plainOf(m.pair)));
    const png = await inPage(strike, { src: dataOf(m.pair), boxes: m.gone, colour });
    writeFileSync(join(out, m.pair), Buffer.from(png, 'base64'));
  }
  // A part boxed once for differing nearly everywhere is said, here and in the table, and kept for --reuse.
  whole = marked.filter((m) => m !== null && m.whole).map((m) => pairOf.get(m.f));
  loupes = marked.some((m) => m !== null && m.loupes > 0);
  writeFileSync(runFile, `${JSON.stringify({ ...runs, [runKey]: { same, nothing, whole, texts, loupes, drawn } })}\n`);

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
    if (whole.length > 0)
      console.info(`Most of the part differs on ${whole.join(', ')}: boxed once, likely a style change.`);
  }
  sayGaps();
} finally {
  await browser.close();
}
// Every picture kept for the pull request, from this run and earlier ones (another page), goes to its folder.
if (publish) await publishing(readdirSync(out).filter(isPicture), { same, nothing: null, whole, texts, loupes, drawn });

/** The pictures published where origin keeps them, and the table made of them: on GitHub, a branch and the
 * description; on Azure DevOps, attachments and a comment. A refusal from Azure DevOps is said in a sentence, with
 * what to do. */
async function publishing(pictures, found) {
  if (!azure) return publishingOnGitHub(pictures, found);
  try {
    await publishingOnAzure(pictures, found);
  } catch (error) {
    const why = error instanceof AzureRefusal ? error.message : `SideShot could not reach Azure DevOps (${String(error.cause?.code ?? error.message)})`;
    console.error(
      `${why}.\nCheck that the sign-in can reach this repository with Code (read and write), then run again with ` +
        `--reuse. The pictures are still in ${out}.`,
    );
    process.exit(1);
  }
}

/** On Azure DevOps, the pictures uploaded as attachments of the pull request, each named for what it holds so the
 * same picture is not sent twice, and the table put in a comment of SideShot's own: a description holds 4000
 * characters, which a table of a few pictures fills. The comment is replaced on every run, and closed, so a policy
 * that wants every comment resolved does not hold the merge on it; the description says where it is, when that
 * fits. With nothing to compare, nothing is uploaded, and the comment says why. */
async function publishingOnAzure(pictures, { same, nothing, whole = [], texts = {}, loupes = false, drawn = null }) {
  const at = `/pullRequests/${pr}`;
  let table;
  if (nothing === null) {
    const listed = await azureCall('GET', `${at}/attachments`);
    const kept = new Map((Array.isArray(listed.value) ? listed.value : []).map((a) => [a.displayName, a.url]));
    const links = {};
    for (const f of pictures) {
      const bytes = readFileSync(join(out, f));
      const name = attachmentNameOf(f, createHash('sha1').update(bytes).digest('hex'));
      const given = kept.get(name) ?? (await azureCall('POST', `${at}/attachments/${encodeURIComponent(name)}`, bytes, 'application/octet-stream')).url;
      // Only an address of Azure DevOps' own goes into the comment and table.md.
      links[f] = attachmentLinkOf(given, azureApi);
      if (links[f] === null) throw new AzureRefusal(`Azure DevOps gave an address for ${f} that is not one of its attachments`);
    }
    table = tableOf({ parts, chosen, schemes, notes, files: new Set(readdirSync(out)), before, after, page, slug, branch, pr, same, markChanges, whole, texts, loupes, onlyNew, drawn, links });
  } else {
    table = nothingTableOf({ why: nothing, before, after, page, onlyNew });
  }
  writeFileSync(join(out, 'table.md'), `${table}\n`);
  if (!updatePr) {
    console.info(
      nothing === null
        ? `Uploaded the pictures to #${pr}. The table, also in ${join(out, 'table.md')}:\n\n${table}\n`
        : `What the comment would say, also in ${join(out, 'table.md')}:\n\n${table}\n`,
    );
    return;
  }
  const content = bodyWith('', table).trimEnd();
  const own = ownThreadOf(await azureCall('GET', `${at}/threads`));
  if (own) await azureCall('PATCH', `${at}/threads/${String(own.thread)}/comments/${String(own.comment)}`, { content });
  else await azureCall('POST', `${at}/threads`, { comments: [{ parentCommentId: 0, content, commentType: 1 }], status: 4 });
  const { description } = await azureCall('GET', `/pullrequests/${pr}`);
  const next = describedWith(description, "Pictures of this change: in SideShot's comment on this pull request.");
  if (next !== null && next !== description) await azureCall('PATCH', `/pullrequests/${pr}`, { description: next });
  console.info(
    nothing === null
      ? `Uploaded the pictures to #${pr} and put the table in a comment on it.`
      : `Said in a comment on #${pr} that there was nothing to compare, and why.`,
  );
}

/** The pictures pushed to their own branch, and the table made of them: printed, or put in the description. With
 * nothing to compare, nothing is pushed, and the description says so, and why. */
function publishingOnGitHub(pictures, { same, nothing, whole = [], texts = {}, loupes = false, drawn = null }) {
  if (nothing === null) {
    // A refused push is said once the checkout is gone, so none is left behind, and before any table is written.
    let refused = null;
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
      for (const f of pictures) cpSync(join(out, f), join(place, pr, f));
      git(['add', '-A'], place);
      if (git(['status', '--porcelain'], place) !== '') {
        git(['commit', '-m', `chore: before and after for #${pr}`], place);
        try {
          git(['push', 'origin', branch], place);
        } catch (error) {
          refused = refusal(error);
        }
      }
    } finally {
      git(['worktree', 'remove', '--force', place], root);
    }
    if (refused !== null) {
      console.error(
        `git could not push the pictures to ${branch} on origin:\n  ${refused}\n` +
          `Check that you can push to the repository, then run again with --reuse. They are still in ${out}.`,
      );
      process.exit(1);
    }
  }

  const files = new Set(readdirSync(out));
  const table =
    nothing === null
      ? tableOf({ parts, chosen, schemes, notes, files, before, after, page, slug, branch, pr, same, markChanges, whole, texts, loupes, onlyNew, drawn })
      : nothingTableOf({ why: nothing, before, after, page, onlyNew });
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
