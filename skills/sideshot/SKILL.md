---
name: sideshot
description: Before-and-after screenshots for a pull request that changes what people see (a page, a component, a style), on a desk and a phone, optionally in dark mode, with what changed marked, kept on a branch of their own and put in the PR description as a table. Use when opening or updating a PR with visible UI changes, or when asked for before and after pictures, screenshots for review, visual proof of a change, or to "sideshot" a PR.
license: MIT
metadata:
  homepage: https://github.com/victorsaly/sideshot
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# SideShot: see the change, side by side

The same part of a page before and after a change, side by side, on a desk and a phone, kept on a `sideshot`
branch that never merges, with a table in the PR description. The script is `scripts/sideshot.mjs` next to this
file (in Claude Code, `${CLAUDE_SKILL_DIR}`); run it with Node from the project's folder. `--help` says every
option, so there is no need to read the script.

## 1. Decide what to picture, from the diff

- **The page** the change shows on (`--page /pricing`), one run per page.
- **The parts** that changed, each a name and a CSS selector: `--part plans=#plans`. The part, not the whole page,
  so before and after line up (`--part page=body` when it is the whole page). Names: letters, digits, `-`, `_`.
- **Something to press first**, when the part only shows then: `--click "button:has-text('Open')"`.
- **Dark mode** when colour or contrast changed: `--schemes light,dark`. Other screens only when the project or
  the user names them (`--devices`; desk and phone otherwise).
- **What to say on the picture**: two or three `--note "selector=what changed"` (a numbered ring, its words under
  the table), and `--mark-changes` to box whatever else differs.

The pull request is found with `gh` for this branch; when there is none yet, open it first.

## 2. Where before and after run

- **After** is this branch: start the project's dev or preview server in the background, and give its address
  (`--after http://localhost:4321`).
- **Before** is the site as it is: production or a preview (`--before https://example.com`). When that cannot
  show the page (a login, other data), or the page reads data only production has, see
  [reference.md](reference.md).
- Put both in `.sideshot.json` at the project's root (`{ "before": "…", "after": "…" }`), so later runs need
  only `--part`.

## 3. Take, look, then publish what you looked at

```bash
node <this skill's folder>/scripts/sideshot.mjs --page /pricing --part plans=#plans \
  --before https://example.com --after http://localhost:4321 --mark-changes
```

It says, in a few lines, where the pictures are (`.sideshot/<pr>/`) and names an overview sheet for each part,
every pair before beside after. **Open the overview, not each picture.** Check that the part is the right one and
that the change shows; the run also says where nothing changed, what is not on the page, and what could not be
pressed. If the page was not done drawing, give it longer (`--wait 3000`) and run again.

A pair that is the same before and after is not kept. When nothing is left to compare, the run stops (exit 3) and
says why: check that `--after` is this branch and that `--page` and `--part` show the change. If the change truly
does not show there, `--update-pr --reuse` says so in the PR description, and why, in place of a table.

When the pictures show the change, publish those same pictures: the same command with `--update-pr --reuse`. It
pushes them to the `sideshot` branch and puts the table in the PR description, replacing an earlier one. This
writes to the repository: do it only for the user's own PR, and tell them, with the link.

## Things to know

- **Playwright** comes from the project, or from a global install for a project without Node. If there is none,
  the script says so: ask before adding it.
- **Add `.sideshot/` to `.gitignore`.**
- Running `main` locally as "before", stand-in data, devices, colours and the tag: [reference.md](reference.md).
