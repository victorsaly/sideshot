// What the end-to-end tests share: SideShot's script, a page to picture, a server for it, and a way to run it.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(repo, 'skills/sideshot/scripts/sideshot.mjs');

/** A plan card, with what is given added inside it. */
export const pageOf = (card) => `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font: 16px system-ui; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
  .card { width: 320px; margin: 40px; padding: 24px; border: 1px solid #ccc; border-radius: 12px; }
  .new { display: inline-block; margin-top: 12px; padding: 4px 10px; background: #0a7; color: #fff; }
</style>
<div class="card"><h2>Pro plan</h2><p>Everything in Free, and more.</p>${card}</div>`;
export const badge = '<span class="new">New: priority support</span>';

/** A server for one page, on a port of its own. */
export const serve = (html) =>
  new Promise((ok) => {
    const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
    server.listen(0, '127.0.0.1', () => ok(server));
  });
export const addressOf = (server) => `http://127.0.0.1:${String(server.address().port)}`;

/** SideShot run apart and awaited, never synchronously: the pages are served from this process, which must stay
 * free to answer. */
export const run = (args, { cwd = repo, env = process.env } = {}) =>
  new Promise((ok, fail) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, timeout: 120_000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', fail);
    child.on('close', (status) => ok({ status, stdout, stderr }));
  });

export const isPng = (file) => readFileSync(file).subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
