// SideShot publishing to Azure DevOps for real, to a stand-in for its API served here: the pictures uploaded as
// attachments of the pull request, the table put in a comment of SideShot's own, and the description pointed to
// it. Nothing reaches Azure DevOps: SIDESHOT_AZURE_URL sends every request to the stand-in, and origin is only an
// address that nothing is pushed to.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { addressOf, badge, pageOf, repo, run, serve } from './helpers.mjs';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const sh = (dir, args) => execFileSync(realGit, args, { cwd: dir, encoding: 'utf8' }).trim();
const api = '/fabrikam/Web%20Shop/_apis/git/repositories/storefront';

/** A stand-in for the Azure DevOps API, as SideShot uses it: one pull request, 7, from the branch feature. It keeps
 * what is sent to it, and every request, with its sign-in. */
const azure = () => {
  const state = { description: 'Fixes the pricing card.', attachments: new Map(), threads: [], requests: [], refuse: 0 };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      state.requests.push({ method: req.method, path: url.pathname, query: url.search, auth: req.headers.authorization });
      const json = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      if (state.refuse) return json(state.refuse, { message: 'TF400813: not authorized' });
      if (url.searchParams.get('api-version') !== '7.1') return json(400, { message: 'api-version' });
      const body = Buffer.concat(chunks);
      const path = url.pathname.startsWith(api) ? url.pathname.slice(api.length) : null;
      const pr = '/pullRequests/7';
      if (path === '/pullrequests' && req.method === 'GET') {
        const from = url.searchParams.get('searchCriteria.sourceRefName');
        return json(200, { value: from === 'refs/heads/feature' ? [{ pullRequestId: 7 }, { pullRequestId: 40, forkSource: {} }] : [] });
      }
      if (path?.toLowerCase() === pr.toLowerCase() && req.method === 'GET') return json(200, { pullRequestId: 7, description: state.description });
      if (path?.toLowerCase() === pr.toLowerCase() && req.method === 'PATCH') {
        state.description = JSON.parse(String(body)).description;
        return json(200, { pullRequestId: 7 });
      }
      if (path === `${pr}/attachments` && req.method === 'GET')
        return json(200, { value: [...state.attachments.keys()].map((name) => ({ displayName: name, url: `https://att.example/${name}` })) });
      if (path?.startsWith(`${pr}/attachments/`) && req.method === 'POST') {
        const name = decodeURIComponent(path.slice(`${pr}/attachments/`.length));
        if (state.attachments.has(name)) return json(409, { message: 'exists' });
        state.attachments.set(name, body);
        return json(201, { displayName: name, url: `https://att.example/${name}` });
      }
      if (path === `${pr}/threads` && req.method === 'GET') return json(200, { value: state.threads });
      if (path === `${pr}/threads` && req.method === 'POST') {
        const thread = { ...JSON.parse(String(body)), id: state.threads.length + 1 };
        thread.comments = thread.comments.map((c, i) => ({ ...c, id: i + 1 }));
        state.threads.push(thread);
        return json(200, thread);
      }
      const edit = /^\/pullRequests\/7\/threads\/(\d+)\/comments\/(\d+)$/.exec(path ?? '');
      if (edit && req.method === 'PATCH') {
        const comment = state.threads.find((t) => t.id === Number(edit[1]))?.comments.find((c) => c.id === Number(edit[2]));
        comment.content = JSON.parse(String(body)).content;
        return json(200, comment);
      }
      return json(404, { message: `stand-in cannot ${req.method} ${url.pathname}` });
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, state })));
};

describe('publishing to Azure DevOps', () => {
  let was, now, stand, place, project, env, bare;
  before(async () => {
    was = await serve(pageOf(''));
    now = await serve(pageOf(badge));
    stand = await azure();
    place = mkdtempSync(join(tmpdir(), 'sideshot-azure-'));
    project = join(place, 'project');
    mkdirSync(project);
    sh(project, ['init', '-q', '-b', 'feature']);
    writeFileSync(join(project, '.gitignore'), '.sideshot/\nnode_modules\n');
    writeFileSync(join(project, 'package.json'), '{}\n');
    sh(project, ['add', '.']);
    sh(project, ['-c', 'user.name=SideShot test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'A project']);
    // Only an address: nothing is fetched from it or pushed to it.
    sh(project, ['remote', 'add', 'origin', 'https://dev.azure.com/fabrikam/Web%20Shop/_git/storefront']);
    symlinkSync(join(repo, 'node_modules'), join(project, 'node_modules'));
    env = { ...process.env, SIDESHOT_AZURE_URL: addressOf(stand.server), AZURE_DEVOPS_EXT_PAT: 'not-a-real-token' };
    // No Azure CLI and no token: git and Node alone on PATH.
    bare = join(place, 'bare-bin');
    mkdirSync(bare);
    symlinkSync(realGit, join(bare, 'git'));
    symlinkSync(process.execPath, join(bare, 'node'));
  });
  after(() => {
    was.close();
    now.close();
    stand.server.close();
    rmSync(place, { recursive: true, force: true });
  });

  const publish = (more, using = env) =>
    run(['--before', addressOf(was), '--after', addressOf(now), '--devices', 'desk', '--wait', '0', ...more], { cwd: project, env: using });
  const posted = () => stand.state.requests.filter((r) => r.method === 'POST' && r.path.includes('/attachments/')).length;

  it('uploads the pictures to the pull request, puts the table in a comment of its own, and points the description there', async () => {
    const result = await publish(['--part', 'card=.card', '--update-pr']);
    assert.equal(result.status, 0, result.stderr);
    // The pull request is this branch's own, not the fork's of the same branch name.
    assert.match(result.stdout, /For #7, this branch's pull request\./);
    assert.deepEqual([...stand.state.attachments.keys()].map((n) => n.replace(/^[0-9a-f]{12}-/, '')).sort(),
      ['card-desk-after.png', 'card-desk-before.png']);
    assert.equal(stand.state.threads.length, 1);
    const [thread] = stand.state.threads;
    // Closed, so a policy that asks for every comment to be resolved does not hold the merge on it.
    assert.equal(thread.status, 4);
    const content = thread.comments[0].content;
    assert.match(content, /^<!-- sideshot:start -->\n## Before and after\n/);
    assert.match(content, /<img src="https:\/\/att\.example\/[0-9a-f]{12}-card-desk-after\.png" width="420">/);
    assert.match(stand.state.description, /^Fixes the pricing card\.\n\n<!-- sideshot:start -->\n.*comment.*\n<!-- sideshot:end -->\n$/);
    // Every request signed in with the token, and none to GitHub.
    assert.ok(stand.state.requests.every((r) => r.auth === `Basic ${Buffer.from(':not-a-real-token').toString('base64')}`));
    assert.match(result.stdout, /Uploaded the pictures to #7 and put the table in a comment on it\./);
  });

  it('replaces its comment on the next run, and sends no picture twice', async () => {
    const sent = posted();
    const result = await publish(['--pr', '7', '--part', 'card=.card', '--update-pr', '--reuse']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(posted(), sent);
    assert.equal(stand.state.threads.length, 1);
    assert.ok(stand.state.requests.some((r) => r.method === 'PATCH' && r.path.endsWith('/threads/1/comments/1')));
    assert.equal(stand.state.description.split('<!-- sideshot:start -->').length, 2);
  });

  it('says in its comment when there was nothing to compare, and uploads nothing', async () => {
    const sent = posted();
    const result = await run(['--pr', '7', '--before', addressOf(was), '--after', addressOf(was), '--devices', 'desk',
      '--wait', '0', '--part', 'card=.card', '--update-pr'], { cwd: project, env });
    assert.equal(result.status, 3, result.stderr);
    assert.equal(posted(), sent);
    assert.match(stand.state.threads[0].comments[0].content, /SideShot found nothing to compare on \//);
  });

  it('says plainly how to sign in, before taking anything', async () => {
    const result = await publish(['--pr', '7', '--part', 'card=.card', '--update-pr'],
      { PATH: bare, HOME: place, SIDESHOT_AZURE_URL: env.SIDESHOT_AZURE_URL });
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /needs a sign-in to Azure DevOps: az login .* or a personal access token .* in AZURE_DEVOPS_EXT_PAT/);
    assert.doesNotMatch(result.stdout, /Took/);
  });

  it('says what Azure DevOps answered when it refuses, and what to do', async () => {
    stand.state.refuse = 401;
    try {
      const result = await publish(['--pr', '7', '--part', 'card=.card', '--update-pr', '--reuse']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Azure DevOps answered 401/);
      assert.match(result.stderr, /Code \(read and write\)/);
      assert.doesNotMatch(result.stderr, /\n\s+at /, 'no stack trace');
    } finally {
      stand.state.refuse = 0;
    }
  });

  it('has nothing to prune on Azure DevOps, where the pictures go with their pull request', async () => {
    const result = await run(['--prune'], { cwd: project, env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nothing to prune on Azure DevOps/);
  });
});
