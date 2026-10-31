import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UsageError,
  bareOf,
  bodyWith,
  configOf,
  deviceOf,
  fileNameOf,
  isBranchName,
  isPicture,
  label,
  splitNote,
  markers,
  nothingOf,
  nothingTableOf,
  optionsOf,
  pictureName,
  plainOf,
  pool,
  prOfBranch,
  prFoldersOf,
  pruneOptionsOf,
  ringsWithin,
  runOf,
  runsOf,
  runKeyOf,
  sheetsOf,
  shownOf,
  slugOf,
  swatches,
  tableOf,
  toPrune,
  usage as help,
} from '../skills/sideshot/scripts/lib.mjs';

// The least SideShot can be asked, and what it is asked on top of that.
const base = ['--pr', '12', '--before', 'https://example.com', '--part', 'hero=.hero'];
const asked = (...more) => optionsOf([...base, ...more]);
// The same, with the part, or where "before" lives, given differently.
const withPart = (part, ...more) => optionsOf([...base.slice(0, 4), '--part', part, ...more]);
const withBefore = (before) => optionsOf(['--pr', '1', '--before', before, '--part', 'a=.a']);

// A login in an address, put together here rather than written out, so a secret scanner reading this file does
// not take it for a real one.
const loginIn = (address, login) => address.replace('://', `://${login.join(':')}@`);

const usage = (fn, pattern) =>
  assert.throws(fn, (e) => e instanceof UsageError && pattern.test(e.message));
const refused = (args, pattern, config = {}) => usage(() => optionsOf(args, config), pattern);

describe('fileNameOf', () => {
  it('keeps letters, digits, dashes and underscores', () => {
    assert.equal(fileNameOf('Hero_2-top'), 'Hero_2-top');
  });
  it('turns the rest to dashes, so it cannot climb out of a folder', () => {
    assert.equal(fileNameOf('../../etc/passwd'), 'etc-passwd');
    assert.equal(fileNameOf('Pixel 7'), 'Pixel-7');
  });
  it('is empty when nothing usable is left', () => {
    assert.equal(fileNameOf('../..'), '');
  });
});

describe('deviceOf', () => {
  it('reads a named size', () => {
    assert.deepEqual(deviceOf('phone'), {
      name: 'phone',
      size: '390×844',
      options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    });
  });
  it('reads a bare size and your own name for one', () => {
    assert.equal(deviceOf('1440x900').name, '1440x900');
    assert.equal(deviceOf('1440x900').options.isMobile, false);
    assert.equal(deviceOf('Pixel 7=412x915:mobile').name, 'pixel-7');
    assert.equal(deviceOf('kiosk=wide').size, '1920×1080');
  });
  it('is null for what it cannot read', () => {
    for (const spec of ['huge', '1x1', '=phone', '../=phone', 'a=phone=x', 'toString'])
      assert.equal(deviceOf(spec), null, spec);
  });
});

describe('isBranchName', () => {
  it('takes ordinary branch names', () => {
    for (const b of ['sideshot', 'shots/ui', 'v1.2_x']) assert.ok(isBranchName(b), b);
  });
  it('refuses what git would take as an option, or would not take at all', () => {
    for (const b of ['--upload-pack=touch x', '-b', 'a..b', 'a//b', 'a/.b', 'a.lock', 'a/', 'a.', 'a b', ''])
      assert.ok(!isBranchName(b), b);
  });
});

describe('slugOf', () => {
  it('reads every way GitHub is reached', () => {
    for (const remote of [
      'https://github.com/victorsaly/sideshot',
      'https://github.com/victorsaly/sideshot.git',
      'https://github.com/victorsaly/sideshot/',
      'git@github.com:victorsaly/sideshot.git',
      'ssh://git@github.com/victorsaly/sideshot.git',
      'ssh://git@github.com:22/victorsaly/sideshot',
    ])
      assert.equal(slugOf(remote), 'victorsaly/sideshot', remote);
  });
  it('keeps a token in the address out of the slug', () => {
    const remote = loginIn('https://github.com/victorsaly/sideshot.git', ['x-access-token', 'not-a-real-token']);
    assert.equal(slugOf(remote), 'victorsaly/sideshot');
  });
  it('is null for anything not on GitHub', () => {
    for (const remote of ['https://gitlab.com/a/b', 'https://github.com.evil.io/a/b', 'git@github.com:a', ''])
      assert.equal(slugOf(remote), null, remote);
  });
});

describe('configOf', () => {
  it('reads an object', () => {
    assert.deepEqual(configOf('{"before":"https://example.com"}'), { before: 'https://example.com' });
  });
  it('says when the file is not JSON, or not an object', () => {
    usage(() => configOf('{nope'), /not valid JSON/);
    for (const text of ['[]', 'null', '"x"']) usage(() => configOf(text), /must be an object/);
  });
});

describe('optionsOf', () => {
  it('has defaults for all but the pull request, before, and a part', () => {
    const o = asked();
    assert.equal(o.pr, '12');
    assert.equal(o.page, '/');
    assert.equal(o.after, 'http://localhost:3000');
    assert.equal(o.wait, 1500);
    assert.equal(o.jobs, 4);
    assert.equal(o.branch, 'sideshot');
    assert.equal(o.out, '.sideshot');
    assert.equal(o.accent, 'auto');
    assert.deepEqual(o.schemes, ['light']);
    assert.deepEqual(o.chosen.map((d) => d.name), ['desk', 'phone']);
    assert.deepEqual(o.parts, [{ name: 'hero', selector: '.hero' }]);
    assert.equal(o.watermark, true);
    assert.equal(o.publish, false);
  });
  it('asks for the pull request, before, and a part', () => {
    refused(base.slice(2), /Give the pull request/);
    refused(['--pr', '1', '--part', 'a=.a'], /Give the pull request/);
    refused(base.slice(0, 4), /Give the pull request/);
    refused(['--pr', '1; rm -rf /', ...base.slice(2)], /Give the pull request/);
  });
  it('takes the flag over .sideshot.json, and .sideshot.json over the default', () => {
    const config = { after: 'http://localhost:4321', wait: 200, devices: ['wide'] };
    const o = optionsOf([...base, '--wait', '50'], config);
    assert.equal(o.after, 'http://localhost:4321');
    assert.equal(o.wait, 50);
    assert.deepEqual(o.chosen.map((d) => d.name), ['wide']);
  });
  it('takes the pull request from .sideshot.json as a number too', () => {
    assert.equal(optionsOf(base.slice(2), { pr: 7 }).pr, '7');
  });
  it('reads devices and schemes in .sideshot.json as a list, as text, or devices as a map', () => {
    const map = optionsOf(base, { devices: { web: 'desk', kiosk: '1080x1920' } });
    assert.deepEqual(map.chosen.map((d) => [d.name, d.size]), [['web', '1280×900'], ['kiosk', '1080×1920']]);
    const text = optionsOf(base, { devices: 'phone', schemes: 'light, dark' });
    assert.deepEqual(text.chosen.map((d) => d.name), ['phone']);
    assert.deepEqual(text.schemes, ['light', 'dark']);
  });
  it('refuses a part name that is not safe in a file name, rather than changing it', () => {
    refused([...base.slice(0, 4), '--part', '../../x=.hero'], /Cannot name a picture \.\.\/\.\.\/x/);
    refused([...base.slice(0, 4), '--part', 'a.b=.hero'], /Cannot name a picture a\.b/);
  });
  it('refuses two parts or two devices of one name, which would be pictured into one file', () => {
    refused([...base, '--part', 'hero=.other'], /More than one part is named hero/);
    refused([...base, '--devices', 'desk,1440x900,desk'], /More than one device is named desk/);
    refused(base, /More than one device is named pixel-7/, { devices: { 'Pixel 7': 'phone', 'pixel.7': 'tablet' } });
  });
  it('keeps = inside a selector, and names a bare selector page', () => {
    assert.deepEqual(asked('--part', 'cta=a[href="/x"]').parts[1], { name: 'cta', selector: 'a[href="/x"]' });
    assert.deepEqual(withPart('=main').parts, [{ name: 'page', selector: 'main' }]);
    assert.deepEqual(withPart('all').parts, [{ name: 'all', selector: 'body' }]);
  });
  it('refuses an address that is not http or https', () => {
    for (const before of ['file:///etc/passwd', 'javascript:alert(1)', 'example.com'])
      usage(() => withBefore(before), /--before must be an http or https/);
    refused([...base, '--after', 'ftp://x'], /--after must be/);
  });
  it('drops the slash at the end of an address, and adds one to the page', () => {
    const o = optionsOf(['--pr', '1', '--before', 'https://example.com/', '--part', 'a=.a', '--page', 'pricing']);
    assert.equal(o.before, 'https://example.com');
    assert.equal(o.page, '/pricing');
  });
  it('refuses a wait that is not a whole number of milliseconds', () => {
    for (const wait of ['soon', '-5', '', '1.5']) refused([...base, '--wait', wait], /--wait is in milliseconds/);
  });
  it('takes how many pictures go at once, from 1 to 16', () => {
    assert.equal(asked('--jobs', '1').jobs, 1);
    assert.equal(optionsOf(base, { jobs: 8 }).jobs, 8);
    for (const jobs of ['0', '17', 'two', '-1']) refused([...base, '--jobs', jobs], /--jobs is how many/);
  });
  it('reuses pictures only to publish them', () => {
    assert.equal(asked('--update-pr', '--reuse').reuse, true);
    assert.equal(asked('--publish').reuse, false);
    refused([...base, '--reuse'], /--reuse publishes/);
  });
  it('refuses a branch git would read as an option', () => {
    refused([...base, '--branch', '--upload-pack=touch /tmp/x'], /Cannot use --branch/);
    refused(base, /Cannot use --branch/, { branch: '-x' });
  });
  it('takes a scheme given twice once, so no two pictures share a file', () => {
    assert.deepEqual(asked('--schemes', 'light,light,dark').schemes, ['light', 'dark']);
  });
  it('refuses devices and schemes it cannot read', () => {
    refused([...base, '--devices', 'desk,huge'], /Cannot read --devices/);
    refused([...base, '--devices', ','], /Cannot read --devices/);
    refused([...base, '--devices', 'toString'], /Cannot read --devices/);
    refused([...base, '--schemes', 'sepia'], /Cannot read --schemes/);
    refused([...base, '--schemes', 'light,drak'], /Cannot read --schemes light,drak/);
    refused(base, /Cannot read --schemes/, { schemes: ['dark', 'sepia'] });
  });
  it('reads the accent by name, as a colour, or auto', () => {
    assert.equal(asked('--accent', 'Magenta').accent, swatches.magenta);
    assert.equal(asked('--accent', '#FF5A1F').accent, '#FF5A1F');
    for (const accent of ['red', '#fff', 'constructor']) refused([...base, '--accent', accent], /Cannot read --accent/);
  });
  it('numbers the notes and keeps = in their words', () => {
    assert.deepEqual(asked('--note', '.a=x=y', '--note', '.b').notes, [
      { n: 1, selector: '.a', text: 'x=y' },
      { n: 2, selector: '.b', text: '' },
    ]);
  });
  it('splits a note at the first = outside brackets and quotes, so a selector may hold its own', () => {
    assert.deepEqual(asked('--note', '.nav a[href*="skills"]=Skills joins the header').notes, [
      { n: 1, selector: '.nav a[href*="skills"]', text: 'Skills joins the header' },
    ]);
    assert.deepEqual(splitNote("input[value='a=b']=It says a=b"), ["input[value='a=b']", 'It says a=b']);
    assert.deepEqual(splitNote('li:not([data-x=y])=New row'), ['li:not([data-x=y])', 'New row']);
    // A CSS escape outside quotes, as Tailwind's class names have: the escaped bracket opens nothing.
    assert.deepEqual(splitNote('#foo\\[bar=Words'), ['#foo\\[bar', 'Words']);
    assert.deepEqual(splitNote('.w-\\[100px\\]=Wide'), ['.w-\\[100px\\]', 'Wide']);
    assert.deepEqual(splitNote('.plain'), ['.plain', undefined]);
  });
  it('refuses a flag given without its value, rather than falling back to the default', () => {
    refused([...base, '--branch'], /--branch needs a value/);
    refused([...base, '--wait'], /--wait needs a value/);
    refused([...base, '--part'], /--part needs a value/);
  });
  it('reads the switches', () => {
    const o = asked('--mark-changes', '--no-watermark', '--update-pr');
    assert.equal(o.markChanges, true);
    assert.equal(o.watermark, false);
    assert.equal(o.publish, true);
    assert.equal(o.updatePr, true);
    assert.equal(asked('--publish').updatePr, false);
    assert.equal(optionsOf(base, { watermark: false, markChanges: true }).watermark, false);
  });
});

describe('picture names', () => {
  it('names light by the device alone', () => {
    assert.equal(label('phone', 'light'), 'phone');
    assert.equal(label('phone', 'dark'), 'phone-dark');
    assert.equal(pictureName('hero', 'phone', 'dark', 'after'), 'hero-phone-dark-after.png');
  });
  it('refuses a name that was not checked', () => {
    assert.throws(() => pictureName('../x', 'desk', 'light', 'before'), /Cannot name a picture/);
    assert.throws(() => pictureName('x', 'a/b', 'light', 'before'), /Cannot name a picture/);
  });
  it('tells a picture from its plain copy', () => {
    assert.equal(plainOf('hero-desk-after.png'), 'hero-desk-after-plain.png');
    assert.ok(isPicture('hero-desk-after.png'));
    assert.ok(!isPicture(plainOf('hero-desk-after.png')));
    assert.ok(!isPicture('table.md'));
  });
  it('does not take an overview sheet for a picture, so it is never marked or published', () => {
    assert.ok(!isPicture('hero-overview.png'));
    assert.ok(!isPicture('hero-overview-2.png'));
  });
});

describe('addresses', () => {
  const secret = loginIn('https://preview.example.com/pricing?token=abc', ['me', 'pw']);
  it('are shown without a login or a token', () => {
    assert.equal(shownOf(secret), 'https://preview.example.com/pricing');
  });
  it('are asked for without a login, and with the rest as given', () => {
    assert.equal(bareOf(secret), 'https://preview.example.com/pricing?token=abc');
  });
});

describe('runKeyOf', () => {
  it('tells apart runs for two pages of one pull request, and is the same for the same run', () => {
    const a = asked('--page', '/a');
    assert.equal(runKeyOf(a), runKeyOf(asked('--page', '/a')));
    assert.notEqual(runKeyOf(a), runKeyOf(asked('--page', '/b')));
    assert.notEqual(runKeyOf(a), runKeyOf(asked('--page', '/a', '--schemes', 'dark')));
  });
});

describe('ringsWithin', () => {
  const ring = (x, y) => ({ n: 1, x, y, w: 40, h: 20 });
  it('keeps a ring on the picture, even one that only overlaps its edge', () => {
    assert.equal(ringsWithin([ring(10, 10), ring(-30, 290)], 300, 300).length, 2);
  });
  it('drops a note on another part of the page', () => {
    assert.deepEqual(ringsWithin([ring(10, 400), ring(-50, 10), ring(300, 10)], 300, 300), []);
  });
});

describe('pool', () => {
  it('keeps the order of the items, whatever order they finish in', async () => {
    const later = (ms, v) => new Promise((ok) => setTimeout(() => ok(v), ms));
    assert.deepEqual(await pool([30, 0, 10], 3, (ms, i) => later(ms, i)), [0, 1, 2]);
  });
  it('runs no more than jobs at once', async () => {
    let running = 0, most = 0;
    await pool([1, 2, 3, 4, 5], 2, async () => {
      most = Math.max(most, ++running);
      await new Promise((ok) => setTimeout(ok, 5));
      running--;
    });
    assert.equal(most, 2);
  });
  it('is done at once with nothing to do', async () => {
    assert.deepEqual(await pool([], 4, () => 1), []);
  });
});

describe('sheetsOf', () => {
  const o = asked('--devices', 'desk,phone,tablet', '--schemes', 'light,dark');
  const all = o.chosen.flatMap((d) =>
    o.schemes.flatMap((s) => ['before', 'after'].map((w) => pictureName('hero', d.name, s, w))));
  it('puts the pairs of each part four to a sheet', () => {
    const sheets = sheetsOf({ ...o, files: new Set(all) });
    assert.deepEqual(sheets.map((s) => s.file), ['hero-overview.png', 'hero-overview-2.png']);
    assert.deepEqual(sheets.map((s) => s.rows.length), [4, 2]);
    assert.deepEqual(sheets[0].rows[1], {
      label: 'hero, desk-dark (1280×900)',
      before: 'hero-desk-dark-before.png',
      after: 'hero-desk-dark-after.png',
    });
  });
  it('leaves out a pair with no picture, and an empty side as null', () => {
    const sheets = sheetsOf({ ...o, files: new Set(['hero-phone-after.png']) });
    assert.deepEqual(sheets, [
      { file: 'hero-overview.png', rows: [{ label: 'hero, phone (390×844)', before: null, after: 'hero-phone-after.png' }] },
    ]);
  });
});

describe('usage', () => {
  it('names every flag optionsOf reads', () => {
    const read = ['--pr', '--page', '--part', '--click', '--devices', '--schemes', '--before', '--after', '--setup',
      '--note', '--mark-changes', '--accent', '--no-watermark', '--wait', '--jobs', '--out', '--publish',
      '--update-pr', '--reuse', '--branch'];
    for (const flag of read) assert.ok(help.includes(`  ${flag} `), flag);
  });
});

describe('tableOf', () => {
  const o = asked('--schemes', 'light,dark', '--note', '.a=Bigger button');
  const table = (files, more = {}) => tableOf({ ...o, files: new Set(files), slug: 'o/r', branch: 'sideshot', ...more });

  it('has a row for each picture taken, linked on the branch', () => {
    const t = table(['hero-desk-before.png', 'hero-desk-after.png']);
    assert.match(t, /\*\*hero, desk\*\* <sub>1280×900<\/sub>/);
    assert.ok(t.includes('<img src="https://github.com/o/r/raw/refs/heads/sideshot/12/hero-desk-after.png"'), t);
    assert.doesNotMatch(t, /phone/);
  });
  // raw.githubusercontent.com answers 404 for a private repository, even to people who can read it; github.com
  // sends them on to the picture with their sign-in, and for a public one ends at the same picture.
  it('links the pictures through github.com, so they show in a private repository too', () => {
    const t = table(['hero-desk-before.png', 'hero-desk-after.png']);
    const hosts = [...t.matchAll(/<img src="([^"]+)"/g)].map(([, src]) => new URL(src).host);
    assert.equal(hosts.length, 2, t);
    assert.deepEqual(new Set(hosts), new Set(['github.com']));
  });
  it('names the branch in full, so one with a slash in it is not read as part of the path', () => {
    const t = table(['hero-desk-before.png', 'hero-desk-after.png'], { branch: 'pictures/sideshot' });
    assert.ok(t.includes('https://github.com/o/r/raw/refs/heads/pictures/sideshot/12/hero-desk-before.png'), t);
  });
  it('says when one side is not there', () => {
    assert.match(table(['hero-phone-dark-after.png']), /\| \(not there\) \| <img/);
  });
  it('names the pairs left out for being the same, and only when there are any', () => {
    const t = table(['hero-desk-after.png'], { same: ['hero on phone', 'hero on phone-dark'] });
    assert.ok(t.includes('<sub>The same before and after, so not shown: hero on phone, hero on phone-dark.</sub>'), t);
    assert.doesNotMatch(table(['hero-desk-after.png']), /The same before and after/);
  });
  it('lists the notes and where before and after came from', () => {
    const t = table(['hero-desk-after.png']);
    assert.match(t, /\*\*What changed\*\*\n\n1\. Bigger button/);
    assert.ok(t.includes('Before: https://example.com/ · After: run locally'), t);
  });
  it('says where a side came from without the login or query in its address', () => {
    const t = table(['hero-desk-after.png'], {
      before: loginIn('https://preview.example.com', ['someone', 'not-a-real-password']),
      after: 'http://[::1]:4321',
      page: '/pricing?bypass=not-a-real-token',
    });
    assert.ok(t.includes('Before: https://preview.example.com/pricing · After: run locally'), t);
    assert.doesNotMatch(t, /someone|not-a-real/);
  });
});

describe('nothing to compare', () => {
  it('says which pairs were the same and which parts were on neither side', () => {
    assert.equal(
      nothingOf({ same: ['card on desk', 'card on phone'], gone: [], page: '/pricing' }),
      'SideShot found nothing to compare on /pricing: before and after are the same, pixel for pixel, on card on ' +
        'desk, card on phone.',
    );
    assert.match(
      nothingOf({ same: ['card on desk'], gone: ['badge on desk'], page: '/' }),
      /pixel for pixel, on card on desk; the part is on neither side on badge on desk\.$/,
    );
  });
  it('names the page without its query', () => {
    assert.match(nothingOf({ same: [], gone: ['a on desk'], page: '/p?token=secret' }), /on \/p: /);
  });
  it('puts that, and where each side came from, where the table would go', () => {
    const text = nothingTableOf({
      why: 'SideShot found nothing to compare on /: the part is on neither side on a on desk.',
      before: loginIn('https://example.com', ['me', 'pw']),
      after: 'http://localhost:4321',
      page: '/',
    });
    assert.match(text, /^## Before and after\n\nSideShot found nothing to compare on \/: .* so there are no pictures\./);
    assert.match(text, /Before: https:\/\/example\.com\/ · After: run locally/);
    assert.ok(!text.includes('pw'));
  });
});

describe('bodyWith', () => {
  const { start, end } = markers;

  it('adds the table at the end the first time', () => {
    assert.equal(bodyWith('Fixes the hero.\n', 'T'), `Fixes the hero.\n\n${start}\nT\n${end}\n`);
    assert.equal(bodyWith('', 'T'), `${start}\nT\n${end}\n`);
  });
  it('replaces the table between the markers, and leaves the rest as it is', () => {
    const body = `Intro\n\n${start}\nold\n${end}\n\nOutro\n`;
    assert.equal(bodyWith(body, 'new'), `Intro\n\n${start}\nnew\n${end}\n\nOutro\n`);
  });
  it('takes $ in the table literally', () => {
    const body = `${start}\nold\n${end}`;
    assert.equal(bodyWith(body, "Costs $$5, was $& and $'"), `${start}\nCosts $$5, was $& and $'\n${end}`);
  });
  it('keeps its own markers when a note names them', () => {
    const next = bodyWith('', `a ${end} b ${start}`);
    assert.equal(next.split(start).length, 2);
    assert.equal(next.split(end).length, 2);
  });
  it('adds a new table, and loses nothing, when the end marker was taken out', () => {
    const body = `${start}\nold, by hand`;
    assert.equal(bodyWith(body, 'T'), `${body}\n\n${start}\nT\n${end}\n`);
  });
  it('still loses nothing on the runs after that', () => {
    const body = `${start}\nold, by hand`;
    const once = bodyWith(body, 'T1');
    assert.equal(bodyWith(once, 'T2'), `${body}\n\n${start}\nT2\n${end}\n`);
  });
  it('replaces a table whose start marker was taken out, after the end of an earlier one', () => {
    const body = `old, by hand\n${end}\n\n${start}\nT1\n${end}\n`;
    assert.equal(bodyWith(body, 'T2'), `old, by hand\n${end}\n\n${start}\nT2\n${end}\n`);
  });
});

describe('pruneOptionsOf', () => {
  it('prunes after 30 days on the sideshot branch, unless told otherwise', () => {
    assert.deepEqual(pruneOptionsOf(['--prune']), { branch: 'sideshot', olderThan: 30 });
    assert.deepEqual(pruneOptionsOf(['--prune', '--older-than', '0'], { branch: 'shots' }), { branch: 'shots', olderThan: 0 });
    assert.equal(pruneOptionsOf(['--prune'], { olderThan: 7 }).olderThan, 7);
  });
  it('refuses a number of days or a branch it cannot use', () => {
    for (const days of ['soon', '-1', '', '1.5'])
      usage(() => pruneOptionsOf(['--prune', '--older-than', days]), /--older-than is a number of days/);
    usage(() => pruneOptionsOf(['--prune', '--branch', '--upload-pack=x']), /Cannot use --branch/);
  });
  it('refuses a flag given without its value, rather than falling back to the default', () => {
    usage(() => pruneOptionsOf(['--prune', '--branch']), /--branch needs a value/);
    usage(() => pruneOptionsOf(['--prune', '--older-than']), /--older-than needs a value/);
  });
});

describe('toPrune', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
  const prs = [
    { number: 1, state: 'MERGED', closedAt: daysAgo(40) },
    { number: 2, state: 'CLOSED', closedAt: daysAgo(31) },
    { number: 3, state: 'MERGED', closedAt: daysAgo(5) },
    { number: 4, state: 'OPEN', closedAt: null },
  ];

  it('takes the folders of pull requests closed or merged long enough ago', () => {
    assert.deepEqual(toPrune(['1', '2', '3', '4'], prs, now, 30), ['1', '2']);
    assert.deepEqual(toPrune(['1', '2', '3', '4'], prs, now, 0), ['1', '2', '3']);
  });
  it("keeps what is open, what it knows nothing of, and what is not a pull request's folder", () => {
    assert.deepEqual(toPrune(['4', '99', 'README.md', 'x1'], prs, now, 0), []);
  });
});

describe('prFoldersOf', () => {
  it('names the folders git lists that are named for a pull request, and no file', () => {
    const entries = [
      '040000 tree aaaa\t5',
      '100644 blob bbbb\t6',
      '120000 blob cccc\t7',
      '040000 tree dddd\tnotes',
      '100644 blob eeee\tREADME.md',
      '040000 tree ffff\t12',
    ];
    assert.deepEqual(prFoldersOf(entries), ['5', '12']);
  });
});

describe('prOfBranch', () => {
  const own = (number) => ({ number, isCrossRepository: false });
  const fork = (number) => ({ number, isCrossRepository: true });

  it('takes the one open pull request whose branch is in this repository', () => {
    assert.equal(prOfBranch([own(12)]), '12');
    // A fork's pull request from a branch of the same name (forks often open them from main) is never taken.
    assert.equal(prOfBranch([fork(40), own(12), fork(41)]), '12');
  });
  it('takes none when it would have to guess, so --pr is asked for', () => {
    for (const listed of [[], [fork(40)], [own(12), own(13)], null, 'x', [{ number: '12; rm', isCrossRepository: false }]])
      assert.equal(prOfBranch(listed), null, JSON.stringify(listed));
  });
});

describe('runsOf and runOf', () => {
  it('reads what earlier runs kept, and nothing from a file that is not theirs', () => {
    assert.deepEqual(runsOf('{"k":{"same":["a on desk"],"nothing":null}}'), { k: { same: ['a on desk'], nothing: null } });
    for (const text of ['', '{nope', 'null', '[]', '"x"', '12']) assert.deepEqual(runsOf(text), {}, text);
  });
  it('gives a run what it found, or nothing found when what is kept is not in that shape', () => {
    const runs = { a: { same: ['x'], nothing: null }, b: { same: [], nothing: 'Nothing to compare.' } };
    assert.deepEqual(runOf(runs, 'a'), { same: ['x'], nothing: null });
    assert.deepEqual(runOf(runs, 'b'), { same: [], nothing: 'Nothing to compare.' });
    const none = { same: [], nothing: null };
    for (const kept of [undefined, null, 'x', { same: 'x' }, { same: [1] }, { same: [], nothing: 4 }])
      assert.deepEqual(runOf({ k: kept }, 'k'), none, JSON.stringify(kept));
    assert.deepEqual(runOf({}, '__proto__'), none);
  });
});
