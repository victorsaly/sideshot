import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UsageError,
  bodyWith,
  configOf,
  deviceOf,
  fileNameOf,
  isBranchName,
  isPicture,
  label,
  markers,
  optionsOf,
  pictureName,
  plainOf,
  slugOf,
  swatches,
  tableOf,
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
  it('refuses a branch git would read as an option', () => {
    refused([...base, '--branch', '--upload-pack=touch /tmp/x'], /Cannot use --branch/);
    refused(base, /Cannot use --branch/, { branch: '-x' });
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
});

describe('tableOf', () => {
  const o = asked('--schemes', 'light,dark', '--note', '.a=Bigger button');
  const table = (files, more = {}) => tableOf({ ...o, files: new Set(files), slug: 'o/r', branch: 'sideshot', ...more });

  it('has a row for each picture taken, linked on the branch', () => {
    const t = table(['hero-desk-before.png', 'hero-desk-after.png']);
    assert.match(t, /\*\*hero, desk\*\* <sub>1280×900<\/sub>/);
    assert.ok(t.includes('<img src="https://raw.githubusercontent.com/o/r/sideshot/12/hero-desk-after.png"'), t);
    assert.doesNotMatch(t, /phone/);
  });
  it('says when one side is not there', () => {
    assert.match(table(['hero-phone-dark-after.png']), /\| \(not there\) \| <img/);
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
