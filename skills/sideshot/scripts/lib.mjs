// SideShot's reading of what it is asked to do, and its writing of the table, kept apart from the browser and
// from git so they can be tested on their own. Nothing here touches the disk, the network or a process.

/** A mistake in what SideShot was asked: said to the person as it is, without a stack. */
export class UsageError extends Error {}

// Where to picture it: a named size, or your own (WIDTHxHEIGHT, with :mobile for a touch screen). The default is
// desk and phone, a web browser and a mobile one.
export const sizes = {
  desk: '1280x900',
  web: '1280x900',
  desktop: '1280x900',
  laptop: '1440x900',
  wide: '1920x1080',
  tablet: '820x1180:mobile',
  phone: '390x844:mobile',
  mobile: '390x844:mobile',
};

// The colours a mark can take. Marigold is SideShot's own; the others are there for pages it would vanish on.
export const swatches = {
  marigold: '#ffc400',
  magenta: '#ff2e88',
  cyan: '#00b4ff',
  violet: '#8b5cf6',
  lime: '#5ee01b',
};

export const markers = { start: '<!-- sideshot:start -->', end: '<!-- sideshot:end -->' };

// A name that goes into a file name: only letters, digits, dashes and underscores, so it cannot leave the folder
// it is written to.
const safeName = /^[A-Za-z0-9_-]+$/;

/** A name made safe for a file name, its other characters turned to dashes. Empty when nothing of it is left. */
export const fileNameOf = (name) =>
  String(name)
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "name=rest" split at the first "=" only, since selectors and notes may hold "=" themselves; rest is undefined
 * when there is no "=". */
const splitOnce = (s) => {
  const i = s.indexOf('=');
  return i === -1 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
};

/** A note, "selector=words", split at the first "=" outside brackets and quotes: a selector such as
 * a[href*="skills"] holds "=" of its own, and the words may too. A CSS escape (\[ in a Tailwind class name,
 * \" in a value) is skipped wherever it stands: it opens and closes nothing. */
export const splitNote = (note) => {
  let depth = 0, quote = '';
  for (let i = 0; i < note.length; i++) {
    const ch = note[i];
    if (ch === '\\') i++;
    else if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') depth++;
    else if ((ch === ']' || ch === ')') && depth > 0) depth--;
    else if (ch === '=' && depth === 0) return [note.slice(0, i), note.slice(i + 1)];
  }
  return [note, undefined];
};

/** "phone", "1440x900", or "pixel=412x915:mobile"; null when the size cannot be read. */
export function deviceOf(spec) {
  const [given, sized] = splitOnce(String(spec));
  const name = given.trim();
  const size = (sized ?? given).trim();
  const key = size.toLowerCase();
  const m = /^(\d{2,5})x(\d{2,5})(:mobile)?$/i.exec(Object.hasOwn(sizes, key) ? sizes[key] : size);
  // A device's name is made safe rather than refused, so "Pixel 7" in .sideshot.json still reads.
  const safe = fileNameOf(name.toLowerCase());
  if (!m || safe === '') return null;
  const mobile = Boolean(m[3]);
  return {
    name: safe,
    size: `${m[1]}×${m[2]}`,
    options: {
      viewport: { width: Number(m[1]), height: Number(m[2]) },
      isMobile: mobile,
      hasTouch: mobile,
    },
  };
}

/** A branch name git takes as a name and never as an option (no leading dash). git check-ref-format has the last
 * word before anything is pushed. */
export const isBranchName = (b) =>
  /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(b) &&
  !/\.\.|\/\/|\/\.|\.lock$|[./]$/.test(b);

/** "owner/repo" from origin's address (https, ssh, or git@github.com:), and nothing else of it: a token in the
 * address must never reach a pull request's description. null when origin is not on GitHub. */
export function slugOf(remote) {
  const m =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
      String(remote).trim(),
    );
  return m ? `${m[1]}/${m[2]}` : null;
}

/** .sideshot.json, read: an object of defaults, or a UsageError that says what is wrong with it. */
export function configOf(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`.sideshot.json is not valid JSON: ${error.message}`);
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config))
    throw new UsageError('.sideshot.json must be an object, like { "before": "https://example.com" }.');
  return config;
}

/** Where "before" or "after" lives: an http or https address, without a slash at the end (the page adds one). */
function baseOf(flag, value) {
  let url = null;
  try {
    url = new URL(value);
  } catch {
    // Said below.
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:'))
    throw new UsageError(`${flag} must be an http or https address, like https://example.com (not ${value}).`);
  return value.replace(/\/+$/, '');
}

/** A list from a flag ("desk,phone"), else from .sideshot.json (a list, or the same text as the flag), else the
 * fallback. */
function listOf(given, configured, fallback) {
  const split = (s) => s.split(',').map((v) => v.trim()).filter(Boolean);
  if (given !== undefined) return split(given);
  if (Array.isArray(configured)) return configured.map(String);
  if (typeof configured === 'string') return split(configured);
  return fallback;
}

/** The names among these that are given more than once. */
const twiceOf = (names) => [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];

/** The devices to picture on: listed as the flag lists them, or in .sideshot.json as a map of your own names to
 * sizes; desk and phone when neither says. */
function devicesOf(given, configured) {
  const specs =
    given === undefined && typeof configured === 'object' && configured !== null && !Array.isArray(configured)
      ? Object.entries(configured).map(([name, size]) => `${name}=${String(size)}`)
      : listOf(given, configured, ['desk', 'phone']);
  const chosen = specs.map(deviceOf);
  if (chosen.length === 0 || chosen.some((d) => d === null))
    throw new UsageError(
      `Cannot read --devices ${specs.join(',')}. Use a name (${Object.keys(sizes).join(', ')}),\n` +
        'a size like 1440x900, or your own name and size like pixel=412x915:mobile.',
    );
  // Two devices of one name would be pictured into the same file, the second over the first.
  const twice = twiceOf(chosen.map((d) => d.name));
  if (twice.length > 0) throw new UsageError(`More than one device is named ${twice.join(', ')}: name each once.`);
  return chosen;
}

/** The colour that marks what changed: a swatch by name, a #hex, or auto, which picks, from the pictures, the one
 * least like the page's own colours. */
function accentOf(spec) {
  if (spec === 'auto') return 'auto';
  const named = spec.toLowerCase();
  if (Object.hasOwn(swatches, named)) return swatches[named];
  if (/^#[0-9a-f]{6}$/i.test(spec)) return spec;
  throw new UsageError(
    `Cannot read --accent ${spec}. Use auto, ${Object.keys(swatches).join(', ')}, or a colour like #ff5a1f.`,
  );
}

/** Refuses a flag given last, with no value after it: falling back to .sideshot.json or the default instead would
 * act on what was not asked (prune the default branch when another was meant). */
function needValues(args, flags) {
  const bare = args.filter((a, i) => flags.includes(a) && args[i + 1] === undefined);
  if (bare.length > 0) throw new UsageError(`${bare[0]} needs a value, like ${bare[0]} ${examples[bare[0]]}.`);
}
const examples = {
  '--pr': '123', '--page': '/pricing', '--before': 'https://example.com', '--after': 'http://localhost:3000',
  '--wait': '1500', '--click': '"button:has-text(\'Open\')"', '--branch': 'sideshot', '--setup': './sideshot-setup.mjs',
  '--out': '.sideshot', '--part': 'hero=.hero', '--note': '".hero=What changed"', '--devices': 'desk,phone',
  '--schemes': 'light,dark', '--accent': 'auto', '--older-than': '30',
};

/** Everything SideShot was asked, from the command line first and .sideshot.json second, checked. Throws a
 * UsageError for anything it cannot use. */
export function optionsOf(args, config = {}) {
  needValues(args, Object.keys(examples).filter((f) => f !== '--older-than'));
  /** Every value given for a flag, in order: --part hero=.hero --part list=.list. */
  const all = (flag) =>
    args.flatMap((a, i) => (a === flag && args[i + 1] !== undefined ? [args[i + 1]] : []));
  const one = (flag, key, fallback) => String(all(flag)[0] ?? config[key] ?? fallback);
  const list = (flag, key, fallback) => listOf(all(flag)[0], config[key], fallback);

  const pr = one('--pr', 'pr', '');
  const before = one('--before', 'before', '');
  const parts = all('--part').map((p) => {
    const [name, selector] = splitOnce(p);
    return { name: name || 'page', selector: selector || 'body' };
  });
  if (!/^\d+$/.test(pr) || parts.length === 0 || before === '')
    throw new UsageError(
      'Give the pull request, where "before" lives, and at least one part:\n' +
        '  --pr 123 --before https://example.com --part hero=.hero\n' +
        '(--before and --after can also be set in .sideshot.json)',
    );
  const unsafe = parts.filter((p) => !safeName.test(p.name)).map((p) => p.name);
  if (unsafe.length > 0)
    throw new UsageError(
      `Cannot name a picture ${unsafe.join(', ')}. Use letters, digits, - and _, like hero=.hero.`,
    );
  const twice = twiceOf(parts.map((p) => p.name));
  if (twice.length > 0) throw new UsageError(`More than one part is named ${twice.join(', ')}: name each once.`);

  const chosen = devicesOf(all('--devices')[0], config.devices);

  const schemeSpecs = list('--schemes', 'schemes', ['light']);
  // A typo among them is said, not dropped: light,drak would otherwise quietly picture light alone. One given
  // twice is taken once, or two pictures would be taken into one file.
  const known = schemeSpecs.filter((s) => s === 'light' || s === 'dark');
  const schemes = [...new Set(known)];
  if (schemes.length === 0 || known.length < schemeSpecs.length)
    throw new UsageError(`Cannot read --schemes ${schemeSpecs.join(',')}. Use light, dark, or light,dark.`);

  const waitText = one('--wait', 'wait', '1500');
  if (!/^\d+$/.test(waitText)) throw new UsageError(`--wait is in milliseconds, like 1500 (not ${waitText}).`);

  // Pictures taken at once, each in a browser context of its own: more is faster until the machine, or the dev
  // server, is the one waiting.
  const jobsText = one('--jobs', 'jobs', '4');
  if (!/^\d+$/.test(jobsText) || Number(jobsText) < 1 || Number(jobsText) > 16)
    throw new UsageError(`--jobs is how many pictures are taken at once, 1 to 16 (not ${jobsText}).`);

  const branch = one('--branch', 'branch', 'sideshot');
  if (!isBranchName(branch))
    throw new UsageError(`Cannot use --branch ${branch}. Use a branch name like sideshot or shots/ui.`);

  const page = one('--page', 'page', '/');
  const updatePr = args.includes('--update-pr');
  const publish = updatePr || args.includes('--publish');
  // The pictures already taken, published as they were looked at, rather than taken again.
  const reuse = args.includes('--reuse');
  if (reuse && !publish)
    throw new UsageError('--reuse publishes the pictures already taken: give it with --publish or --update-pr.');
  return {
    pr,
    page: page.startsWith('/') ? page : `/${page}`,
    before: baseOf('--before', before),
    after: baseOf('--after', one('--after', 'after', 'http://localhost:3000')),
    wait: Number(waitText),
    jobs: Number(jobsText),
    click: one('--click', 'click', ''),
    branch,
    setupPath: one('--setup', 'setup', ''),
    out: one('--out', 'out', '.sideshot'),
    chosen,
    schemes,
    parts,
    // What changed, said on the picture: a numbered ring around each noted element in the "after" picture.
    notes: all('--note').map((note, i) => {
      const [selector, text = ''] = splitNote(note);
      return { n: i + 1, selector, text };
    }),
    accent: accentOf(one('--accent', 'accent', 'auto')),
    markChanges: args.includes('--mark-changes') || config.markChanges === true,
    // Each pair carries a small SideShot tag in the corner of its "after" picture, unless asked not to.
    watermark: !args.includes('--no-watermark') && config.watermark !== false,
    publish,
    updatePr,
    reuse,
  };
}

/** What --prune was asked: the branch the pictures are kept on, and how many days after a pull request closes its
 * pictures may go. */
export function pruneOptionsOf(args, config = {}) {
  needValues(args, ['--branch', '--older-than']);
  const one = (flag, key, fallback) => {
    const i = args.indexOf(flag);
    return String(i !== -1 && args[i + 1] !== undefined ? args[i + 1] : config[key] ?? fallback);
  };
  const branch = one('--branch', 'branch', 'sideshot');
  if (!isBranchName(branch))
    throw new UsageError(`Cannot use --branch ${branch}. Use a branch name like sideshot or shots/ui.`);
  const days = one('--older-than', 'olderThan', '30');
  if (!/^\d+$/.test(days))
    throw new UsageError(`--older-than is a number of days after a pull request closed, like 30 (not ${days}).`);
  return { branch, olderThan: Number(days) };
}

/** The names of the folders, among what git ls-tree lists ("mode type sha<tab>name"), that are named for a pull
 * request. A file of that name is not one, and is never pruned. */
export const prFoldersOf = (entries) =>
  entries
    .filter((entry) => entry.split(' ')[1] === 'tree')
    .map((entry) => entry.slice(entry.indexOf('\t') + 1))
    .filter((name) => /^\d+$/.test(name));

/** The pull requests' folders whose pictures may go: closed or merged at least that many days before now. A folder
 * of an open pull request, of one not in the list, or not named for one at all, is kept. */
export function toPrune(folders, prs, now, olderThan) {
  const closed = new Map(
    prs.filter((p) => p.state !== 'OPEN' && p.closedAt).map((p) => [String(p.number), Date.parse(p.closedAt)]),
  );
  return folders.filter(
    (f) => /^\d+$/.test(f) && closed.has(f) && now - closed.get(f) >= olderThan * 86_400_000,
  );
}

export const label = (device, scheme) => (scheme === 'light' ? device : `${device}-${scheme}`);

/** The one way a picture is named, so the pictures taken and the table's links always agree. Its names were
 * checked by optionsOf; one that was not is refused here, where the file name is made. */
export function pictureName(part, device, scheme, when) {
  if (!safeName.test(part) || !safeName.test(device))
    throw new Error(`Cannot name a picture after ${part} on ${device}.`);
  return `${part}-${label(device, scheme)}-${when}.png`;
}

/** The copy of a picture as it was taken, kept beside it when it has been drawn on. */
export const plainOf = (picture) => picture.replace(/\.png$/, '-plain.png');
/** A picture taken, as named by pictureName: not its plain copy, and not an overview sheet. */
export const isPicture = (file) => /-(?:before|after)\.png$/.test(file);

/** The rings whose element shows in a picture of this size: a note on another part of the page is not drawn on
 * this one. */
export const ringsWithin = (rings, width, height) =>
  rings.filter((r) => r.x < width && r.y < height && r.x + r.w > 0 && r.y + r.h > 0);

/** fn run over the items, at most jobs at a time; the results in the items' order, whatever order they finish in. */
export async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  return results;
}

/** The overview sheets: for each part, its pairs before beside after, four to a sheet, so the pictures can be
 * looked over in one image (or a few) instead of one by one. Only pairs with a picture on either side. */
export function sheetsOf({ parts, chosen, schemes, files }) {
  const sheets = [];
  for (const part of parts) {
    const rows = [];
    for (const device of chosen) {
      for (const scheme of schemes) {
        const before = pictureName(part.name, device.name, scheme, 'before');
        const after = pictureName(part.name, device.name, scheme, 'after');
        if (!files.has(before) && !files.has(after)) continue;
        rows.push({
          label: `${part.name}, ${label(device.name, scheme)} (${device.size})`,
          before: files.has(before) ? before : null,
          after: files.has(after) ? after : null,
        });
      }
    }
    for (let k = 0; k < rows.length; k += 4) {
      const n = k / 4 + 1;
      sheets.push({ file: `${part.name}-overview${n === 1 ? '' : `-${String(n)}`}.png`, rows: rows.slice(k, k + 4) });
    }
  }
  return sheets;
}

/** What SideShot takes, as --help says it: enough to run it without reading the script. */
export const usage = `SideShot: before-and-after pictures of the part of a page a pull request changes.

  node sideshot.mjs --part plans=#plans [--page /pricing] [--before URL] [--after URL] [options]

What to picture
  --pr N                   the pull request (found with gh, for this branch, when left out)
  --page /path             the page, opened on both sides (default /)
  --part name=selector     a part to picture; repeat for more. page=body for the whole page
  --click selector         something to press first: a tab, a panel, a menu
  --devices list           desk 1280x900, phone 390x844, tablet, laptop, wide, 1024x768, or your own
                           name=412x915:mobile (default desk,phone; web and mobile are desk and phone)
  --schemes list           light, dark, or light,dark (default light)

Where before and after run
  --before URL             the site as it is: production, a preview, or main run locally
  --after URL              this branch, running locally (default http://localhost:3000)
  --setup file.mjs         runs on each page before it opens: stand-in data, a cookie, a login

What is drawn on the pictures
  --note "selector=words"  a numbered ring on the after picture; the words go under the table. Repeat
  --mark-changes           box what was added or changed, rule where something was taken out
  --accent auto            the marking colour: auto, marigold, magenta, cyan, violet, lime, or #hex
  --no-watermark           no SideShot tag in the corner of the after pictures

Running
  --wait ms                time a part is given to settle before it is pictured (default 1500)
  --jobs N                 pictures taken at once (default 4)
  --out folder             where the pictures go (default .sideshot), in a folder for the PR
  --publish                push the pictures to the picture branch and print the table
  --update-pr              also put the table in the PR description (needs gh)
  --reuse                  with --publish or --update-pr: the pictures already taken, as they are
  --branch name            the picture branch, which never merges (default sideshot)

Cleaning up
  --prune                  take off the picture branch the pictures of pull requests closed or merged
                           a while ago, leaving it one commit of what is left; needs no browser
  --older-than days        with --prune: how long ago (default 30). Those pull requests no longer show them

A pair the same before and after is not kept. With nothing left to compare, it stops (exit 3), and with
--update-pr the description says so, and why.

Defaults can live in .sideshot.json at the project's root, under the same names (markChanges, and
"watermark": false), so later runs need only --part:
  { "before": "https://example.com", "after": "http://localhost:4321", "devices": ["desk", "phone"] }`;

/** An address as it may be shown, in a description or a log: without what else it can carry, a login before the
 * host or a token in the query. */
export const shownOf = (address) => {
  const where = new URL(address);
  return `${where.origin}${where.pathname}`;
};

/** An address without its login, for a request that only asks whether a server answers: fetch refuses an address
 * with one, and any answer (a 401 too) will do. */
export const bareOf = (address) => {
  const where = new URL(address);
  where.username = '';
  where.password = '';
  return where.href;
};

/** The pull request for this branch, from what gh pr list --head says (number and isCrossRepository): the one
 * whose branch is in this repository. gh matches the branch's name alone, so a fork's pull request from a branch
 * of the same name (forks often open them from main) is listed too, and is never taken. None, or more than one,
 * is null: it would be a guess, so --pr is asked for. */
export function prOfBranch(listed) {
  if (!Array.isArray(listed)) return null;
  const own = listed.filter((p) => p && p.isCrossRepository === false && /^\d+$/.test(String(p.number)));
  return own.length === 1 ? String(own[0].number) : null;
}

/** What earlier runs kept in run.json, read: an object of runs, or none at all when the file is not that. */
export function runsOf(text) {
  try {
    const runs = JSON.parse(text);
    return typeof runs === 'object' && runs !== null && !Array.isArray(runs) ? runs : {};
  } catch {
    return {};
  }
}

/** What one run found (pairs the same, parts boxed once for differing nearly everywhere, or why there was nothing to compare), or nothing found when what is kept
 * for it is not in that shape: it goes into a pull request's description, so only what SideShot itself writes. */
export function runOf(runs, key) {
  const kept = Object.hasOwn(runs, key) ? runs[key] : null;
  const shaped =
    typeof kept === 'object' &&
    kept !== null &&
    Array.isArray(kept.same) &&
    kept.same.every((s) => typeof s === 'string') &&
    (kept.nothing === null || typeof kept.nothing === 'string') &&
    (kept.whole === undefined || (Array.isArray(kept.whole) && kept.whole.every((s) => typeof s === 'string'))) &&
    (kept.texts === undefined ||
      (typeof kept.texts === 'object' && kept.texts !== null && !Array.isArray(kept.texts) &&
        Object.values(kept.texts).every((v) => Array.isArray(v) && v.every((s) => typeof s === 'string')))) &&
    (kept.loupes === undefined || typeof kept.loupes === 'boolean');
  return shaped
    ? { same: kept.same, nothing: kept.nothing, whole: kept.whole ?? [], texts: kept.texts ?? {}, loupes: kept.loupes ?? false }
    : { same: [], nothing: null, whole: [], texts: {}, loupes: false };
}

/** What a run is known by, beside its pictures: its page, parts, devices and schemes. Two runs for one pull request
 * (two pages) each keep what they found, and --reuse finds the one it repeats. */
export const runKeyOf = ({ page, parts, chosen, schemes }) =>
  JSON.stringify([page, parts.map((p) => `${p.name}=${p.selector}`), chosen.map((d) => d.name), schemes]);

/** Where each side came from, shown without a login or a token: the description is read by everyone who can see
 * the pull request. */
function sourcesOf(before, after, page) {
  const named = (base) => {
    const where = new URL(`${base}${page}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(where.hostname) ? 'run locally' : shownOf(where.href);
  };
  return `<sub>Before: ${named(before)} · After: ${named(after)} · made with [SideShot](https://github.com/victorsaly/sideshot)</sub>`;
}

/** Why a run has nothing to compare, in words for the person running it and for the pull request: pairs the
 * same before and after, pixel for pixel, and parts on neither side. */
export function nothingOf({ same, gone, page }) {
  const path = new URL(page, 'http://localhost').pathname;
  const why = [];
  if (same.length > 0) why.push(`before and after are the same, pixel for pixel, on ${same.join(', ')}`);
  if (gone.length > 0) why.push(`the part is on neither side on ${gone.join(', ')}`);
  return `SideShot found nothing to compare on ${path}: ${why.join('; ')}.`;
}

/** What goes in the description in place of a table when there was nothing to compare: that, and why. */
export const nothingTableOf = ({ why, before, after, page }) =>
  [
    '## Before and after',
    '',
    `${why} The change may not show on this page, or not in the parts pictured, so there are no pictures.`,
    '',
    sourcesOf(before, after, page),
  ].join('\n');

/** The before and after table, in Markdown, for the pictures that were taken (files). Pairs the same before and
 * after were not kept, and are named under it. */
/** What the part's words say that they did not, or said that they do not: the stretches that changed, each with
 * three words round it, what went struck through and what came in bold. Nothing when the words are the same. A
 * mark cannot say which word changed; the page's own text can. */
export function textDiffOf(before, after) {
  // Up to this many words a side: a part longer than that is a page, and its diff a scroll.
  // A stretch is at most 40 words all told, and no one run of them more than 18: the rest is said to be more.
  const most = 1500, context = 3, longest = 18, budget = 40, stretches = 4;
  const wordsOf = (text) => String(text ?? '').split(/\s+/).filter(Boolean).slice(0, most);
  const A = wordsOf(before), B = wordsOf(after), n = A.length, m = B.length;
  const L = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * (m + 1) + j] = A[i] === B[j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) ops.push(['=', A[i++]]), j++;
    else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) ops.push(['-', A[i++]]);
    else ops.push(['+', B[j++]]);
  }
  while (i < n) ops.push(['-', A[i++]]);
  while (j < m) ops.push(['+', B[j++]]);
  // The words as words, not as Markdown: a star or a bracket in them stays one.
  const plain = (w) => w.replace(/[\\*_~`<[]/g, (ch) => `\\${ch}`);
  const lines = [];
  for (let k = 0; k < ops.length && lines.length < stretches; ) {
    if (ops[k][0] === '=') {
      k++;
      continue;
    }
    // A stretch runs until three unchanged words in a row.
    let end = k;
    while (end < ops.length && !(ops[end][0] === '=' && ops[end + 1]?.[0] === '=' && ops[end + 2]?.[0] === '=')) end++;
    const piece = ops.slice(Math.max(0, k - context), k).map(([, w]) => plain(w));
    let cut = false, room = budget - piece.length, at = k;
    while (at < end) {
      const kind = ops[at][0];
      let to = at;
      while (to < end && ops[to][0] === kind) to++;
      const take = Math.min(to - at, longest, room);
      if (take < to - at) cut = true;
      if (take <= 0) break;
      const words = ops.slice(at, at + take).map(([, w]) => plain(w));
      piece.push(kind === '=' ? words.join(' ') : kind === '-' ? `~~${words.join(' ')}~~` : `**${words.join(' ')}**`);
      room -= take;
      if (cut) break;
      at = to;
    }
    if (!cut) piece.push(...ops.slice(end, end + context).map(([, w]) => plain(w)));
    const more = cut || end + context < ops.length;
    lines.push(`${k > context ? '… ' : ''}${piece.join(' ')}${more ? ' …' : ''}`);
    k = end;
  }
  return lines;
}

export function tableOf({ parts, chosen, schemes, notes, files, before, after, page, slug, branch, pr, same = [], markChanges = false, whole = [], texts = {}, loupes = false }) {
  // Through github.com, not raw.githubusercontent.com: that answers 404 for a private repository, even to those who
  // can read it, where github.com sends them on with their sign-in. The branch in full (refs/heads/), so one with a
  // slash in it is not taken for part of the path.
  const url = (file) => `https://github.com/${slug}/raw/refs/heads/${branch}/${pr}/${file}`;
  const lines = ['## Before and after', ''];
  for (const part of parts) {
    for (const device of chosen) {
      for (const scheme of schemes) {
        const b = pictureName(part.name, device.name, scheme, 'before');
        const a = pictureName(part.name, device.name, scheme, 'after');
        if (!files.has(b) && !files.has(a)) continue;
        lines.push(
          `**${part.name}, ${label(device.name, scheme)}** <sub>${device.size}</sub>`,
          '',
          '| Before | After |',
          '| --- | --- |',
        );
        const cell = (f) => (files.has(f) ? `<img src="${url(f)}" width="420">` : '(not there)');
        lines.push(`| ${cell(b)} | ${cell(a)} |`, '');
        // What the words say now that they did not, under the pair: a mark cannot name the word.
        const said = Object.hasOwn(texts, a) ? texts[a] : [];
        if (said.length > 0) lines.push(...said.map((line) => `<sub>Text: ${line}</sub>`), '');
      }
    }
  }
  // A pair left out for showing no change is still said: the reviewer knows it was looked at.
  if (same.length > 0) lines.push(`<sub>The same before and after, so not shown: ${same.join(', ')}.</sub>`, '');
  // What the marks mean, for a reader who has not met SideShot, and where a part was boxed once for differing
  // nearly everywhere, which is a style change more often than many.
  if (markChanges)
    lines.push(
      `<sub>Boxed: added or changed · dashed rule: taken out · dashed box on before: where it was${loupes ? ' · inset: a small change at 3×' : ''}.</sub>`,
      '',
    );
  if (whole.length > 0)
    lines.push(
      `<sub>Most of the part differs on ${whole.join(', ')}, so it is boxed once: likely a style change (colour, font, spacing).</sub>`,
      '',
    );
  // The numbered rings on the "after" pictures, said in words.
  if (notes.length > 0)
    lines.push('**What changed**', '', ...notes.map((note) => `${String(note.n)}. ${note.text}`), '');
  lines.push(sourcesOf(before, after, page));
  return lines.join('\n');
}

/** The pull request's description with the table between the markers: replacing the table there, or added at
 * the end the first time. Markers inside the table itself are taken out, so the next run still finds its own. */
export function bodyWith(body, table) {
  const { start, end } = markers;
  const block = `${start}\n${table.replaceAll(start, '').replaceAll(end, '')}\n${end}`;
  // The table is the first end marker and the start marker nearest before it, so a marker left alone after
  // a hand edit never pairs with one of a later table and takes the words between them.
  let to = body.indexOf(end);
  let from = to === -1 ? -1 : body.lastIndexOf(start, to);
  while (to !== -1 && from === -1) {
    to = body.indexOf(end, to + end.length);
    from = to === -1 ? -1 : body.lastIndexOf(start, to);
  }
  if (from !== -1) return body.slice(0, from) + block + body.slice(to + end.length);
  const rest = body.trimEnd();
  return rest === '' ? `${block}\n` : `${rest}\n\n${block}\n`;
}

/** A shell command's steps (split at &&, ||, ;, |, & and new lines) and each step's words, as the shell reads
 * them for this: quotes keep what is in them together, and a backslash keeps the character after it. Enough to know
 * what a command runs, and where; not a shell. */
function stepsOf(command) {
  const text = String(command);
  const steps = [[]];
  let word = null;
  let quote = null;
  const close = () => {
    if (word !== null) steps.at(-1).push(word);
    word = null;
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < text.length) word += text[(i += 1)];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= '';
    } else if (c === '\\' && i + 1 < text.length) {
      word = (word ?? '') + text[(i += 1)];
    } else if (c === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
      // A redirect (2>&1, &>), not a second command.
      word = (word ?? '') + c;
    } else if (c === '\n' || c === ';' || c === '|' || c === '&') {
      close();
      if (steps.at(-1).length > 0) steps.push([]);
    } else if (/\s/.test(c)) {
      close();
    } else {
      word = (word ?? '') + c;
    }
  }
  close();
  return steps.filter((step) => step.length > 0);
}

/** The value of a flag among a command's words (--repo o/r, -R o/r, --repo=o/r), or null. */
function flagOf(words, long, short) {
  for (let i = 0; i < words.length; i += 1) {
    if ((words[i] === long || words[i] === short) && i + 1 < words.length) return words[i + 1];
    if (words[i].startsWith(`${long}=`)) return words[i].slice(long.length + 1);
  }
  return null;
}

/** Where a command pushes a branch, or opens a pull request (gh pr create, or ready from a draft), or null when it
 * does neither: after it, the pull request may want pictures. dirs are the folders cd and git -C moved to before
 * it, in order, from where the command was run; pr and repo are the pull request and repository, when the command
 * names them. Pushes of tags, and deletions, change no pull request. */
export function pushOf(command) {
  const dirs = [];
  for (const step of stepsOf(command)) {
    const [name, ...rest] = step.slice(step.findIndex((w) => !/^\w+=/.test(w)));
    if (name === 'cd') {
      dirs.push(rest[0] ?? '~');
    } else if (name === 'gh' && rest[0] === 'pr' && (rest[1] === 'create' || rest[1] === 'ready')) {
      const after = rest.slice(2);
      const repo = flagOf(after, '--repo', '-R');
      // gh pr ready names the pull request as its one word that is not a flag or a flag's value.
      const named = after.find((w, i) => !w.startsWith('-') && !['--repo', '-R'].includes(after[i - 1]));
      const pr = rest[1] === 'ready' ? (named ?? null) : null;
      return { dirs, pr, repo };
    } else if (name === 'git') {
      const here = [...dirs];
      let i = 0;
      while (i < rest.length && rest[i].startsWith('-')) {
        if (rest[i] === '-C') here.push(rest[i + 1]);
        i += rest[i] === '-C' || rest[i] === '-c' ? 2 : 1;
      }
      const args = rest.slice(i + 1);
      const changesNoPr = args.some((a) => a === '--tags' || a === '--delete' || a === '-d' || a.startsWith(':'));
      if (rest[i] === 'push' && !changesNoPr) return { dirs: here, pr: null, repo: null };
    }
  }
  return null;
}

/** Whether a command pushes a branch or opens a pull request: pushOf, said yes or no. */
export const isPrPush = (command) => pushOf(command) !== null;

// What people see: styles, markup and components, images and fonts, and a theme's settings. Tests and stories of
// those are for the people working on them, and what is under .github never shows on a page.
const seenFile = /\.(?:css|scss|sass|less|styl|pcss|html?|jsx|tsx|vue|svelte|astro|mdx|erb|hbs|handlebars|njk|liquid|twig|ejs|pug|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$|(?:^|\/)tailwind\.config\.[cm]?[jt]s$/i;
const unseenFolder = /(?:^|\/)(?:__tests__|__snapshots__|tests?|e2e|\.storybook|\.github)\//i;
const unseenFile = /\.(?:test|spec|stories)\.[^/]+$/i;

/** The files among these that change what people see. */
export const seenOf = (files) => files.filter((f) => seenFile.test(f) && !unseenFolder.test(f) && !unseenFile.test(f));

/** Whether the reminder is turned off everywhere: SIDESHOT_REMIND=off in the environment, which Claude Code passes
 * on from the "env" of ~/.claude/settings.json. "remind": false in .sideshot.json is for one project. */
export const quietIn = (env) =>
  ['off', '0', 'false', 'no'].includes(String(env.SIDESHOT_REMIND ?? '').trim().toLowerCase());

/** What the agent is told after it pushes or opens a pull request that changes what people see and has no
 * pictures yet, or null when there is nothing to tell: a reminder, so whether the change shows on a page is still
 * the agent's call. A project turns it off with "remind": false in .sideshot.json, and a person everywhere with
 * SIDESHOT_REMIND=off. */
export function reminderOf({ command, config, body, files, env = {} }) {
  if (!isPrPush(command) || quietIn(env) || config.remind === false || String(body ?? '').includes(markers.start))
    return null;
  const seen = seenOf(files);
  if (seen.length === 0) return null;
  const shown = 5;
  const named =
    seen.length > shown ? `${seen.slice(0, shown).join(', ')} and ${String(seen.length - shown)} more` : seen.join(', ');
  return (
    `This pull request changes files people see (${named}), and its description has no before-and-after ` +
    'pictures. If the change shows on a page, use SideShot (the sideshot skill): picture the part that changed, and ' +
    'show the person before anything is published. If it does not show on a page, carry on. To turn this reminder ' +
    'off for the project, set "remind": false in .sideshot.json; for every project, SIDESHOT_REMIND=off.'
  );
}
