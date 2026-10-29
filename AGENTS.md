# Working on SideShot

For coding agents changing this repository. People: [CONTRIBUTING.md](CONTRIBUTING.md) says the same, longer.

## What is where

- `skills/sideshot/SKILL.md`: what an agent reads to use SideShot. Short on purpose (the checks hold it under
  500 lines); anything only some pages need goes in `reference.md`, linked from SKILL.md and linking nowhere.
- `skills/sideshot/scripts/sideshot.mjs`: the command. It opens the browser, runs git and gh, writes files.
- `skills/sideshot/scripts/lib.mjs`: everything that can be worked out without a browser or git: reading the
  options, `--help`'s words, the table, what to prune. Pure functions, at least 90% covered by `test/lib.test.mjs`.
- `skills/sideshot/scripts/draw.mjs`: handed to the page as source and run there, so browser globals, not Node's.
- `test/e2e/`: pictured for real in Chromium, and publishing to a local bare repository, never to GitHub.
- `evals/`: whether agents use the skill as SKILL.md says, run with `claude plugin eval .`. Not in CI: each run is
  a real session, paid for.

## Before you push

```bash
npm run check   # lint, typecheck, unit tests with coverage, e2e: what CI runs on Linux and macOS
```

Change SKILL.md or reference.md, and run the evals too.

## How the code is written

- Comments say why, in plain words, and code that reads like the code around it. The docs say "pictures", not
  "screenshots", and use British spelling (colour, licence).
- The skill needs nothing but Node 22 and Playwright. No dependencies in `skills/`.
- A number that is waited for or measured is named and its value explained where it is defined (`waits` in
  sideshot.mjs), not left in the code.
- Errors say what to do next, in a sentence an agent can act on; exit 1 for what was asked, 2 for what is
  missing, 3 for nothing to compare.

## Rules

- Write the failing test first, then the fix.
- One pull request is one release: bump `.claude-plugin/plugin.json`, the README badge and a changelog entry
  marked `(unreleased)` in the same pull request. `npm test` fails when they disagree. Find the number from what
  is released (`git fetch --tags && gh release list`), not from memory.
- Never move or replace a published tag; ship a new patch instead.
- Tests that commit pass their own identity (`git -c user.name=… -c user.email=…`): the Linux runner has none.
- Put a login in a test address at run time (`loginIn` in `test/lib.test.mjs`), never written out, so secret
  scanners do not flag it.
- Other sessions may work in the main checkout at the same time: work in a `git worktree` of your own.
