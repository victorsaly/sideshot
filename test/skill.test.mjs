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

describe('the version', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const readme = read('README.md');

  it('is the same in plugin.json, the README badge, and the newest changelog entry', () => {
    const { version } = plugin;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(readme.match(/badge\/version-([\d.]+)-/)?.[1], version, 'the badge');
    assert.equal(readme.match(/alt="Version ([\d.]+)"/)?.[1], version, "the badge's words");
    assert.equal(read('CHANGELOG.md').match(/^## (\S+) /m)?.[1], version, 'the changelog');
  });

  it('has a newest changelog entry that is dated or says it is unreleased', () => {
    const newest = read('CHANGELOG.md').match(/^## .*$/m)?.[0];
    assert.match(newest, /^## \d+\.\d+\.\d+ \((\d{4}-\d{2}-\d{2}|unreleased)\)$/);
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
  // A file's frontmatter, as `key: value` pairs; a 'single-quoted' value is unquoted as YAML does it.
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

  it('checks that SideShot is what answered, where it should be', () => {
    const fired = (name) =>
      readdirSync(join(root, 'evals', name, 'graders')).some((f) => {
        const grader = frontOf(`evals/${name}/graders/${f}`);
        return grader.type === 'tool_used' && grader.tool === 'Skill' && /sideshot/.test(grader.input_match);
      });
    for (const name of cases) assert.ok(fired(name), `evals/${name} checks the skill, fired or not`);
  });
});
