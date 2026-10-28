---
name: sideshot
description: See the change, side by side. Take before-and-after screenshots for a pull request that changes what people see (a page, a component, a style), on a desk and a phone, optionally in dark mode, keep them on a branch of their own, and put the before/after table in the PR description. Use when opening or updating a PR with visible UI changes, or when asked for before and after pictures, screenshots for review, visual proof of a change, or to "sideshot" a PR.
license: MIT
metadata:
  homepage: https://github.com/victorsaly/sideshot
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# Sideshot: see the change, side by side

A reviewer judges a visible change faster, and more honestly, with the same part of the page before and after,
side by side, on a desk and on a phone. Sideshot takes those pictures with Playwright, keeps them on a
`sideshot` branch that never merges (so the code stays light), and puts a table in the PR description.

**The script** is `scripts/sideshot.mjs`, next to this file. Run it with Node from the project's folder:
`node <this skill's folder>/scripts/sideshot.mjs …` (in Claude Code the folder is `${CLAUDE_SKILL_DIR}`).

## 1. Decide what to picture

From the diff, work out:

- **The pull request number** (`gh pr view --json number` on the branch, or ask). If there is no PR yet, open it
  first; the pictures go into its description.
- **The page or pages** the change shows on (`--page /pricing`). One run per page.
- **The parts** to picture, each a name and a CSS selector: `--part hero=.hero --part plans=#plans`. Picture the
  part that changed, not the whole page, so before and after line up. `--part page=body` for a whole page.
- **What must be done first** for the part to show: `--click "button:has-text('Open')"` (a panel, a tab, a menu).
  Closed `<details>` around a part are opened for you.
- **Dark mode** if the change touches colour or contrast: `--schemes light,dark`.

## 2. Where "before" and "after" come from

- **After** is this branch, running locally: start the project's dev or preview server in the background first
  (`--after http://localhost:4321`).
- **Before** is the site as it is now: production or a preview deploy (`--before https://example.com`). When that
  is not reachable as the page needs (behind a login, or showing different data), run `main` locally instead: a
  `git worktree add ../<repo>-main origin/main`, install, build and serve it on another port, and give that
  (`--before http://localhost:4322`). Stop it afterwards.
- Defaults can live in `.sideshot.json` at the project's root, so later runs need only `--pr` and `--part`:
  `{ "before": "https://example.com", "after": "http://localhost:4321" }`.

## 3. Pages whose data only exists in production

When a page reads live data the local server cannot reach (an API behind auth, a database), give it stand-in
data with `--setup ./sideshot-setup.mjs`, a module whose default export runs on every page before it opens:

```js
// sideshot-setup.mjs: the same stand-in data for before and after, so only the change differs.
export default async (page, { when, device, scheme }) => {
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [/* … */] } }));
};
```

Use the same stand-ins for before and after, and say in the PR that the data is stood in.

## 4. Run it

First without publishing, then look at the pictures (in `.sideshot/<pr>/`; open a few) before anything goes on
GitHub:

```bash
node <this skill's folder>/scripts/sideshot.mjs --pr 123 --page /pricing --part plans=#plans \
  --before https://example.com --after http://localhost:4321
```

When they show the change, run again with `--update-pr`. It pushes the pictures to the `sideshot` branch (created
the first time) and writes the before/after table into the PR description between `<!-- sideshot:start -->` and
`<!-- sideshot:end -->`; a later run replaces that table rather than adding a second. `--publish` alone pushes and
prints the table without touching the description.

## Things to know

- **Playwright comes from the project.** If it is missing, the script says so: ask before adding it
  (`npm i -D playwright && npx playwright install chromium`).
- **The GitHub CLI** (`gh`) is needed for `--update-pr`.
- **Pages that never go quiet** (they poll) are fine: the script waits briefly for the network, then until the
  part's height holds.
- **A part that is new or removed** shows as "(not there)" on one side; that is expected, and says so.
- **Pictures are 2x**, desk 1280×900 and phone 390×844. Add `.sideshot/` to `.gitignore`.
- **Publishing writes to the repository** (a branch and the PR description): do it only for the user's own PR,
  and tell them it was done, with the PR link.
