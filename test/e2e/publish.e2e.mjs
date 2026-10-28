// SideShot publishing for real, to a repository made here: the pictures pushed to the sideshot branch, and the
// table put in a pull request's description. Nothing reaches GitHub. Ahead of the real git and gh on PATH sit two
// stand-ins: git says origin is on GitHub (SideShot publishes only there) and passes everything else to the real
// git, so the push goes to a bare repository here; gh keeps the description in a file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { addressOf, badge, pageOf, repo, run, serve } from './helpers.mjs';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const sh = (dir, args) => execFileSync(realGit, args, { cwd: dir, encoding: 'utf8' }).trim();
const executable = (file, text) => {
  writeFileSync(file, text);
  chmodSync(file, 0o755);
};
const markers = (body) => body.split('<!-- sideshot:start -->').length - 1;

describe('publishing', () => {
  let was, now, place, bare, project, body, calls, prs, env;
  before(async () => {
    was = await serve(pageOf(''));
    now = await serve(pageOf(badge));
    place = mkdtempSync(join(tmpdir(), 'sideshot-publish-'));
    bare = join(place, 'origin.git');
    project = join(place, 'project');
    const bin = join(place, 'bin');
    body = join(place, 'body.md');
    calls = join(place, 'gh-calls.txt');
    prs = join(place, 'prs.json');
    for (const dir of [bare, project, bin]) mkdirSync(dir);

    sh(bare, ['init', '-q', '--bare', '-b', 'main']);
    sh(project, ['init', '-q', '-b', 'main']);
    for (const [key, value] of [['user.name', 'SideShot test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false']])
      sh(project, ['config', key, value]);
    writeFileSync(join(project, '.gitignore'), '.sideshot/\nnode_modules\n');
    writeFileSync(join(project, 'package.json'), '{}\n');
    sh(project, ['add', '.']);
    sh(project, ['commit', '-q', '-m', 'A project']);
    sh(project, ['remote', 'add', 'origin', bare]);
    sh(project, ['push', '-q', 'origin', 'main']);
    // Playwright comes from the project, as it would: this one borrows SideShot's own.
    symlinkSync(join(repo, 'node_modules'), join(project, 'node_modules'));

    executable(
      join(bin, 'git'),
      `#!/bin/sh
if [ "$1" = remote ] && [ "$2" = get-url ] && [ "$3" = origin ]; then
  echo https://github.com/test-owner/test-repo.git
  exit 0
fi
exec "${realGit}" "$@"
`,
    );
    // gh pr view N --json body --jq .body and gh pr edit N --body-file FILE to publish, gh pr list to prune: the
    // only calls SideShot makes.
    executable(
      join(bin, 'gh'),
      `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "pr view") cat "${body}" ;;
  "pr edit") cp "$5" "${body}" ;;
  "pr list") cat "${prs}" ;;
  *) echo "gh stand-in cannot $*" >&2; exit 1 ;;
esac
`,
    );
    writeFileSync(body, 'Fixes the pricing card.\n');
    env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  });
  after(() => {
    was.close();
    now.close();
    rmSync(place, { recursive: true, force: true });
  });

  /** SideShot run in the project for a pull request (5 unless said), with the stand-ins first on PATH unless asked
   * otherwise. */
  const publish = (more, { pr = '5', using = env } = {}) =>
    run(['--pr', pr, '--before', addressOf(was), '--after', addressOf(now), '--devices', 'desk', '--wait', '0', ...more], {
      cwd: project,
      env: using,
    });
  const prune = (more = [], using = env) => run(['--prune', ...more], { cwd: project, env: using });
  const onBranch = () => sh(bare, ['ls-tree', '-r', '--name-only', 'sideshot']).split('\n');
  /** The pull requests gh lists: 5 and 7 closed that many days ago, 6 still open. */
  const closedDaysAgo = (days) => {
    const closedAt = new Date(Date.now() - days * 86_400_000).toISOString();
    writeFileSync(
      prs,
      JSON.stringify([
        { number: 5, state: 'MERGED', closedAt },
        { number: 6, state: 'OPEN', closedAt: null },
        { number: 7, state: 'CLOSED', closedAt },
      ]),
    );
  };
  /** Puts a file, not a folder, named 7 on the sideshot branch, as one more commit on it. */
  const fileNamedSeven = () => {
    const blob = execFileSync(realGit, ['hash-object', '-w', '--stdin'], { cwd: bare, input: 'not a folder\n', encoding: 'utf8' }).trim();
    const tip = sh(bare, ['rev-parse', 'sideshot']);
    const listed = `${sh(bare, ['ls-tree', tip])}\n100644 blob ${blob}\t7\n`;
    const tree = execFileSync(realGit, ['mktree'], { cwd: bare, input: listed, encoding: 'utf8' }).trim();
    const commit = sh(bare, ['commit-tree', tree, '-p', tip, '-m', 'A file named like a pull request']);
    sh(bare, ['update-ref', 'refs/heads/sideshot', commit]);
  };

  it('pushes the pictures to the sideshot branch and puts the table in the description', async () => {
    const result = await publish(['--part', 'card=.card', '--update-pr']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(onBranch(), ['5/card-desk-after.png', '5/card-desk-before.png', 'README.md']);
    const text = readFileSync(body, 'utf8');
    assert.equal(markers(text), 1);
    assert.match(text, /^Fixes the pricing card\.\n\n<!-- sideshot:start -->/);
    const link = 'https://raw.githubusercontent.com/test-owner/test-repo/sideshot/5/card-desk-after.png';
    assert.ok(text.includes(`<img src="${link}"`), text);
    // Asked of the repository origin is, never of one gh would pick by itself.
    assert.match(
      readFileSync(calls, 'utf8'),
      /^pr view 5 --json body --jq \.body --repo test-owner\/test-repo\npr edit 5 --body-file .*body\.md --repo test-owner\/test-repo\n$/,
    );
    // The checkout it used to commit is gone again.
    assert.equal(sh(project, ['worktree', 'list']).split('\n').length, 1);
  });

  it('replaces its table on the next run, and keeps what was written around it', async () => {
    writeFileSync(body, `${readFileSync(body, 'utf8')}\nThanks for looking.\n`);
    const result = await publish(['--part', 'card=.card', '--update-pr']);
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(body, 'utf8');
    assert.equal(markers(text), 1);
    assert.match(text, /^Fixes the pricing card\./);
    assert.match(text, /Thanks for looking\.\n$/);
  });

  it('takes from the branch the pictures no longer kept here', async () => {
    rmSync(join(project, '.sideshot', '5'), { recursive: true });
    const result = await publish(['--part', 'plan=.card', '--publish']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(onBranch(), ['5/plan-desk-after.png', '5/plan-desk-before.png', 'README.md']);
  });

  it('keeps the pictures of a pull request closed more recently than --older-than', async () => {
    const opened = await publish(['--part', 'card=.card', '--publish'], { pr: '6' });
    assert.equal(opened.status, 0, opened.stderr);
    closedDaysAgo(2);
    const before = sh(bare, ['rev-parse', 'sideshot']);
    const result = await prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nothing to prune/);
    assert.equal(sh(bare, ['rev-parse', 'sideshot']), before);
  });

  it('prunes the pictures of a pull request closed long ago, leaving the branch one commit of what is left', async () => {
    closedDaysAgo(40);
    fileNamedSeven();
    assert.ok(Number(sh(bare, ['rev-list', '--count', 'sideshot'])) > 1);
    const result = await prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Took the pictures of #5 off sideshot/);
    // PR 7 closed long ago too, but its name is a file's here, not a folder of pictures: it stays.
    assert.deepEqual(onBranch(), ['6/card-desk-after.png', '6/card-desk-before.png', '7', 'README.md']);
    assert.match(readFileSync(calls, 'utf8'), /^pr list --state all --limit 1000 --json number,state,closedAt --repo test-owner\/test-repo$/m);
    assert.equal(sh(bare, ['rev-list', '--count', 'sideshot']), '1');
  });

  it('has nothing left to prune once those pictures are gone, and keeps an open pull request even at --older-than 0', async () => {
    closedDaysAgo(0);
    const result = await prune(['--older-than', '0']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nothing to prune/);
  });

  it('publishes and prunes nowhere but GitHub, and says so before opening anything', async () => {
    for (const result of [await publish(['--part', 'card=.card', '--publish'], { using: process.env }), await prune([], process.env)]) {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /only to an origin on GitHub/);
    }
  });
});
