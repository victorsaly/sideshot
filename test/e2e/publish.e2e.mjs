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
  let was, now, place, bare, project, body, calls, prs, heads, env;
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
    heads = join(place, 'heads.json');
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
  "pr list") case " $* " in *" --head "*) cat "${heads}" ;; *) cat "${prs}" ;; esac ;;
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
  /** The pull requests gh lists: 5 and 8 closed that many days ago, 6 still open (7 it does not list). */
  const closedDaysAgo = (days) => {
    const closedAt = new Date(Date.now() - days * 86_400_000).toISOString();
    writeFileSync(
      prs,
      JSON.stringify([
        { number: 5, state: 'MERGED', closedAt },
        { number: 6, state: 'OPEN', closedAt: null },
        { number: 8, state: 'CLOSED', closedAt },
      ]),
    );
  };
  /** Puts a file, not a folder, named 8 on the sideshot branch, as one more commit on it. */
  const fileNamedEight = () => {
    const blob = execFileSync(realGit, ['hash-object', '-w', '--stdin'], { cwd: bare, input: 'not a folder\n', encoding: 'utf8' }).trim();
    const tip = sh(bare, ['rev-parse', 'sideshot']);
    const listed = `${sh(bare, ['ls-tree', tip])}\n100644 blob ${blob}\t8\n`;
    const tree = execFileSync(realGit, ['mktree'], { cwd: bare, input: listed, encoding: 'utf8' }).trim();
    // The bare repository has no one to commit as, and a CI runner may have no one either: say who.
    const as = ['-c', 'user.name=SideShot test', '-c', 'user.email=test@example.com'];
    const commit = sh(bare, [...as, 'commit-tree', tree, '-p', tip, '-m', 'A file named like a pull request']);
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
    // Bound to origin's repository, whatever gh would pick by itself.
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

  it('publishes the pictures already taken, as they are, with --reuse', async () => {
    const taken = sh(project, ['hash-object', join('.sideshot', '5', 'plan-desk-after.png')]);
    // Nothing answers at either address: had it taken them again, it would have stopped there.
    const silent = 'http://127.0.0.1:9';
    const result = await run(
      ['--pr', '5', '--before', silent, '--after', silent, '--devices', 'desk', '--part', 'plan=.card', '--publish', '--reuse'],
      { cwd: project, env },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Publishing the 2 pictures already in/);
    assert.equal(sh(bare, ['rev-parse', 'sideshot:5/plan-desk-after.png']), taken);
  });

  it('asks for pictures to reuse, and for somewhere to publish them', async () => {
    const none = await run(['--pr', '6', '--before', 'http://127.0.0.1:9', '--part', 'a=.a', '--publish', '--reuse'], {
      cwd: project,
      env,
    });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no pictures in .* to publish/);
    const nowhere = await publish(['--part', 'plan=.card', '--reuse']);
    assert.equal(nowhere.status, 1);
    assert.match(nowhere.stderr, /--reuse publishes the pictures already taken/);
  });

  it('says in the description that there was nothing to compare, and why, and pushes nothing', async () => {
    const pushed = sh(bare, ['rev-parse', 'sideshot']);
    const same = await run(
      ['--pr', '7', '--before', addressOf(was), '--after', addressOf(was), '--devices', 'desk', '--wait', '0',
        '--part', 'card=.card', '--update-pr'],
      { cwd: project, env },
    );
    assert.equal(same.status, 3, same.stderr);
    assert.match(same.stdout, /Said in the description of #7 that there was nothing to compare, and why\./);
    const text = readFileSync(body, 'utf8');
    assert.equal(markers(text), 1);
    assert.match(text, /<!-- sideshot:start -->\n## Before and after\n\nSideShot found nothing to compare on \/: before and after are the same, pixel for pixel, on card on desk\./);
    assert.doesNotMatch(text, /<img/);
    assert.equal(sh(bare, ['rev-parse', 'sideshot']), pushed);
    // Said again from what the run kept, without taking anything.
    writeFileSync(body, 'Fixes the pricing card.\n');
    const silent = 'http://127.0.0.1:9';
    const again = await run(['--pr', '7', '--before', silent, '--after', silent, '--devices', 'desk', '--part', 'card=.card', '--update-pr', '--reuse'], {
      cwd: project,
      env,
    });
    assert.equal(again.status, 0, again.stderr);
    assert.match(readFileSync(body, 'utf8'), /SideShot found nothing to compare/);
    // What a run for another page found stands for that page alone: --reuse for this one still publishes its pictures.
    const plan = await run(
      ['--pr', '7', '--before', addressOf(was), '--after', addressOf(now), '--devices', 'desk', '--wait', '0',
        '--part', 'plan=.card'],
      { cwd: project, env },
    );
    assert.equal(plan.status, 0, plan.stderr);
    const reused = await run(['--pr', '7', '--before', silent, '--after', silent, '--devices', 'desk',
      '--part', 'plan=.card', '--update-pr', '--reuse'], { cwd: project, env });
    assert.equal(reused.status, 0, reused.stderr);
    assert.match(reused.stdout, /Publishing the 2 pictures already in/);
    assert.match(readFileSync(body, 'utf8'), /<img src=".*\/7\/plan-desk-after\.png"/);
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
    fileNamedEight();
    assert.ok(Number(sh(bare, ['rev-list', '--count', 'sideshot'])) > 1);
    const result = await prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Took the pictures of #5 off sideshot/);
    // PR 8 closed long ago too, but its name is a file's here, not a folder of pictures: it stays. PR 7, which gh
    // does not list, keeps its folder.
    assert.deepEqual(onBranch(), [
      '6/card-desk-after.png',
      '6/card-desk-before.png',
      '7/plan-desk-after.png',
      '7/plan-desk-before.png',
      '8',
      'README.md',
    ]);
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

  it("finds the branch's own pull request when --pr is left out, and never a fork's of the same branch name", async () => {
    // A fork's pull request from its own main, listed by gh beside this repository's, as gh matches by name alone.
    writeFileSync(heads, JSON.stringify([{ number: 40, isCrossRepository: true }, { number: 9, isCrossRepository: false }]));
    const found = await run(
      ['--before', addressOf(was), '--after', addressOf(now), '--devices', 'desk', '--wait', '0', '--part', 'card=.card', '--publish'],
      { cwd: project, env },
    );
    assert.equal(found.status, 0, found.stderr);
    assert.match(found.stdout, /For #9, this branch's pull request\./);
    assert.ok(onBranch().includes('9/card-desk-after.png'), onBranch().join(', '));
    assert.ok(!onBranch().some((f) => f.startsWith('40/')));

    // Only the fork's: nothing is taken for it, and the pull request is asked for.
    writeFileSync(heads, JSON.stringify([{ number: 40, isCrossRepository: true }]));
    const none = await run(['--before', addressOf(was), '--part', 'card=.card', '--publish'], { cwd: project, env });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /Give the pull request/);
  });
});
