import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The skill as an agent reads it, and the version as people read it, checked as files: nothing here runs SideShot.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const skill = 'skills/sideshot';

// SKILL.md's frontmatter, top-level `key: value` lines only (which is all it has), and the body after it.
const [, front, body] = read(`${skill}/SKILL.md`).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
const field = (key) => front?.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
// The files a markdown file links to in the skill's folder, not addresses or anchors.
const linksOf = (text) =>
  [...text.matchAll(/\]\(([^)#\s]+)/g)].map((m) => m[1]).filter((to) => !/^[a-z]+:/i.test(to));

describe('SKILL.md', () => {
  it('starts with frontmatter', () => {
    assert.ok(front, 'SKILL.md opens with --- frontmatter ---');
  });

  it('has a name the agents take: the folder, lowercase, digits and dashes, at most 64', () => {
    const name = field('name');
    assert.equal(name, 'sideshot');
    assert.match(name, /^[a-z0-9-]{1,64}$/);
    assert.doesNotMatch(name, /anthropic|claude/);
  });

  it('says what it does and when to use it, in at most 1024 characters and no tags', () => {
    const description = field('description') ?? '';
    assert.ok(description.length > 0 && description.length <= 1024, `${description.length} characters`);
    assert.doesNotMatch(description, /<[^>]+>/);
    assert.match(description, /\bUse when\b/);
  });

  it('is short enough to read whole: under 500 lines', () => {
    const lines = body.split('\n').length;
    assert.ok(lines < 500, `${lines} lines`);
  });

  it('fits whole in what Claude Code puts back after compacting: 20,000 bytes', () => {
    // A skill read again after the conversation is compacted is cut at 20,000 characters, as obra/superpowers
    // found (tests/skill-size there). Bytes are the stricter count.
    const bytes = Buffer.byteLength(read(`${skill}/SKILL.md`));
    assert.ok(bytes <= 20_000, `${bytes} bytes`);
  });

  it('links only to files that are there, each one step from SKILL.md', () => {
    for (const to of linksOf(body)) {
      assert.ok(existsSync(join(root, skill, to)), `${to} is in ${skill}/`);
      // An agent may read a file it was sent to only in part, so a link from there could go unread.
      if (to.endsWith('.md')) assert.deepEqual(linksOf(read(`${skill}/${to}`)), [], `${to} links on`);
    }
  });

  it('runs only its own scripts', () => {
    assert.equal(field('allowed-tools'), 'Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)');
  });
});

describe('the files SKILL.md sends an agent to', () => {
  it('say what is in them first, when longer than 100 lines', () => {
    for (const to of linksOf(body).filter((t) => t.endsWith('.md'))) {
      const text = read(`${skill}/${to}`);
      if (text.split('\n').length > 100) assert.match(text, /^## Contents$/m, `${to} has a ## Contents`);
    }
  });
});

describe('what the docs say to install', () => {
  it('adds Chromium wherever it adds Playwright, which cannot picture anything without it', () => {
    for (const path of ['README.md', `${skill}/SKILL.md`, `${skill}/reference.md`, 'CONTRIBUTING.md']) {
      for (const line of read(path).split('\n').filter((l) => /npm i(nstall)? (-D|-g) playwright/.test(l))) {
        assert.match(line, /npx playwright install chromium/, `${path}: ${line.trim()}`);
      }
    }
  });
});

describe('the version', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const readme = read('README.md');

  it('is the same in plugin.json, SKILL.md, the README badge, and the newest changelog entry', () => {
    const { version } = plugin;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    // What an install with `npx skills add` has to say which version it is: it has SKILL.md, not plugin.json.
    assert.equal(front.match(/^ {2}version: (.*)$/m)?.[1], version, "SKILL.md's metadata");
    assert.equal(readme.match(/badge\/version-([\d.]+)-/)?.[1], version, 'the badge');
    assert.equal(readme.match(/alt="Version ([\d.]+)"/)?.[1], version, "the badge's words");
    assert.equal(read('CHANGELOG.md').match(/^## (\S+) /m)?.[1], version, 'the changelog');
  });

  it('has a newest changelog entry that is dated or says it is unreleased', () => {
    const newest = read('CHANGELOG.md').match(/^## .*$/m)?.[0];
    assert.match(newest, /^## \d+\.\d+\.\d+ \((\d{4}-\d{2}-\d{2}|unreleased)\)$/);
  });

  it('has an icon the plugin directory takes: a square PNG, 512 to 2048 pixels a side', () => {
    const png = readFileSync(join(root, plugin.icon));
    assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${plugin.icon} is a PNG`);
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(width, height, `${plugin.icon} is ${width}×${height}`);
    assert.ok(width >= 512 && width <= 2048, `${plugin.icon} is ${width} pixels a side`);
    assert.ok(png.length < 2 * 1024 * 1024, `${plugin.icon} is under 2 MB`);
  });

  it('is described the same in the plugin and the marketplace', () => {
    const [listed] = JSON.parse(read('.claude-plugin/marketplace.json')).plugins;
    assert.equal(listed.name, plugin.name);
    assert.equal(listed.description, plugin.description);
  });
});

// The evals run real sessions and cost money (claude plugin eval), so not here. What is checked here is what would
// stop one at its start: a key the runner refuses, a grader of no known type, a pattern that is not a regex.
describe('the evals', () => {
  const cases = readdirSync(join(root, 'evals'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'results')
    .map((e) => e.name);
  /** A file's frontmatter, as `key: value` pairs; a 'single-quoted' value is unquoted as YAML does it.
   * @returns {Record<string, string>} */
  const frontOf = (path) => {
    const [, yaml] = read(path).match(/^---\n([\s\S]*?)\n---\n?/) ?? [];
    assert.ok(yaml !== undefined, `${path} opens with --- frontmatter ---`);
    return Object.fromEntries(
      [...yaml.matchAll(/^([\w-]+): ?(.*)$/gm)].map(([, k, v]) => [k, v.replace(/^'(.*)'$/, (_, s) => s.replaceAll("''", "'"))]),
    );
  };
  const promptKeys = ['schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome', 'model',
    'max_turns', 'timeout_seconds', 'allowed_tools', 'append_system_prompt', 'env'];
  const graderTypes = ['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline'];

  it('has at least three cases', () => {
    assert.ok(cases.length >= 3, `${cases.length} cases`);
  });

  // Each case runs with SideShot and without. A grader that only SideShot could pass (its script, its flags) says
  // nothing about the run without it, so it is marked with-only; the score both runs share comes from graders that
  // judge the decision, whatever the tool. Without one, the difference between them is SideShot's name, not its use.
  /** @returns {Record<string, string>[]} Each grader's frontmatter, with its file name and its text. */
  const gradersOf = (name) =>
    readdirSync(join(root, 'evals', name, 'graders'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: f, ...frontOf(`evals/${name}/graders/${f}`), body: read(`evals/${name}/graders/${f}`) }));
  // One that asks for SideShot's command; one that asks for it to be absent (match: not_contains) anyone can pass.
  const sideshotOnly = (g) => /sideshot\.mjs|--[a-z]/.test(g.pattern ?? '') && g.match !== 'not_contains';
  const scoredInBoth = (g) =>
    g.arm === 'both' || (g.arm !== 'with-only' && !(g.type === 'tool_used' && g.tool === 'Skill'));

  it('marks a grader only SideShot could pass as with-only', () => {
    for (const name of cases) {
      for (const g of gradersOf(name).filter(sideshotOnly)) {
        assert.equal(g.arm, 'with-only', `evals/${name}/graders/${g.file}`);
      }
    }
  });

  it('scores each case, with and without SideShot, on what was decided', () => {
    for (const name of cases) assert.ok(gradersOf(name).some(scoredInBoth), `evals/${name} has a grader for both`);
  });

  it('gives each judge a PASS and a FAIL to choose between', () => {
    for (const name of cases) {
      for (const g of gradersOf(name).filter((g) => g.type === 'llm')) {
        assert.match(g.body, /^PASS if /m, `evals/${name}/graders/${g.file}`);
        assert.match(g.body, /^FAIL if /m, `evals/${name}/graders/${g.file}`);
      }
    }
  });

  it('takes only an arm the runner knows', () => {
    for (const name of cases) {
      for (const g of gradersOf(name).filter((g) => g.arm !== undefined)) {
        assert.ok(['with-only', 'both'].includes(g.arm), `evals/${name}/graders/${g.file}: arm ${g.arm}`);
      }
    }
  });

  it('gives each case a prompt the runner takes, and nothing it would refuse', () => {
    for (const name of cases) {
      const path = `evals/${name}/prompt.md`;
      for (const key of Object.keys(frontOf(path))) assert.ok(promptKeys.includes(key), `${path}: ${key}`);
      assert.ok(read(path).replace(/^---\n[\s\S]*?\n---\n/, '').trim().length > 0, `${path} says something`);
    }
  });

  it('grades each case, with graders of known types and patterns that are regexes', () => {
    for (const name of cases) {
      const graders = readdirSync(join(root, 'evals', name, 'graders')).filter((f) => f.endsWith('.md'));
      assert.ok(graders.length > 0, `evals/${name} has a grader`);
      for (const file of graders) {
        const path = `evals/${name}/graders/${file}`;
        const grader = frontOf(path);
        assert.ok(graderTypes.includes(grader.type), `${path}: type ${grader.type}`);
        for (const key of ['pattern', 'input_match']) {
          if (grader[key] !== undefined) assert.doesNotThrow(() => new RegExp(grader[key], grader.flags), `${path}: ${key}`);
        }
      }
    }
  });

  // What a grader should take, and what it should not: a value that only starts like the right one (another port,
  // another page, another part) is the wrong one.
  const examples = {
    'pricing-part/graders/command.md': {
      takes: [
        "node ~/.claude/skills/sideshot/scripts/sideshot.mjs --page /pricing --part plans='#plans' \\\n" +
          '  --before https://example.com --after http://localhost:4321 --mark-changes',
        'node sideshot.mjs --part "plans=#plans" --page "/pricing" --before "https://example.com/" ' +
          '--after "http://localhost:4321/"',
      ],
      refuses: [
        'node sideshot.mjs --page /pricing --part plans=#plans --before https://example.com --after http://localhost:43210',
        'node sideshot.mjs --page /pricing-old --part plans=#plans --before https://example.com --after http://localhost:4321',
        'node sideshot.mjs --page /pricing --part plans=#plans-old --before https://example.com --after http://localhost:4321',
        'node sideshot.mjs --page /pricing --part plans=#plans --before https://example.com.evil --after http://localhost:4321',
      ],
    },
    'colour-means-dark/graders/the-header.md': {
      takes: ['node sideshot.mjs --part header=header --schemes light,dark', 'node sideshot.mjs --part nav="header nav"'],
      refuses: ['node sideshot.mjs --part top=header-old', 'node sideshot.mjs --part top=headers'],
    },
    'colour-means-dark/graders/both-schemes.md': {
      takes: ['--schemes light,dark', "--schemes 'dark,light' --part x=y"],
      refuses: ['--schemes light', '--schemes light,dark-ish'],
    },
    'prune-asks-first/graders/command.md': {
      takes: ['node sideshot.mjs --prune --older-than 3', 'node sideshot.mjs --older-than "3" --prune'],
      refuses: ['node sideshot.mjs --prune --older-than 30', 'node sideshot.mjs --prune --older-than 3.5'],
    },
    'show-reviewers-the-button/graders/command.md': {
      takes: [
        'node sideshot.mjs --page /cart --part "checkout=.checkout button" --before https://example.com ' +
          '--after http://localhost:3000',
        "node sideshot.mjs --part 'button=.checkout button' --after http://localhost:3000/ --page /cart " +
          '--before https://example.com --mark-changes',
        // Before and after saved in .sideshot.json, as SKILL.md suggests, so the command needs only the part.
        'put `{ "before": "https://example.com", "after": "http://localhost:3000" }` in `.sideshot.json`\n' +
          'node <skill>/scripts/sideshot.mjs --page /cart \\\n  --part checkout=".checkout button" --mark-changes',
      ],
      refuses: [
        'node sideshot.mjs --page /cart --part "page=body" --before https://example.com --after http://localhost:3000',
        'node sideshot.mjs --page /cart-old --part "b=.checkout button" --before https://example.com --after http://localhost:3000',
        'node sideshot.mjs --page /cart --part "b=.checkout button" --before https://example.com --after http://localhost:30001',
        'node sideshot.mjs --page /cart --part "b=.checkout button" --after http://localhost:3000',
      ],
    },
  };
  for (const [path, { takes, refuses }] of Object.entries(examples)) {
    it(`grades ${path} on the whole value, not how it starts`, () => {
      const { pattern, flags } = frontOf(`evals/${path}`);
      const re = new RegExp(pattern, flags);
      for (const reply of takes) assert.ok(re.test(reply), `takes: ${reply}`);
      for (const reply of refuses) assert.ok(!re.test(reply), `refuses: ${reply}`);
    });
  }

  it('checks that SideShot is what answered, where it should be', () => {
    const fired = (name) =>
      readdirSync(join(root, 'evals', name, 'graders')).some((f) => {
        const grader = frontOf(`evals/${name}/graders/${f}`);
        return grader.type === 'tool_used' && grader.tool === 'Skill' && /sideshot/.test(grader.input_match);
      });
    for (const name of cases) assert.ok(fired(name), `evals/${name} checks the skill, fired or not`);
  });
});
