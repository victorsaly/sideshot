# Changelog

## Unreleased

- `--mark-changes` marks only the card that changed when cards sit side by side. Where both pictures have an
  empty gutter from top to bottom, each column is compared on its own; before, a card that grew boxed the rows
  of the card beside it too. A picture with no such gutter is compared across its width, as before.

## 0.5.1 (2026-10-28)

- In a project with no `origin`, git's own "No such remote 'origin'" no longer shows on every run. git is still
  asked; only its answer is kept quiet, and when git really fails, what it said is in the error.
- The README links to a 36-second film of SideShot at work, on skills.victorsaly.com.

## 0.5.0 (2026-10-28)

### Quicker

- Pictures are taken four at a time (`--jobs`), each page waits `--wait` once instead of up to three times, and
  a part's height is checked for 0.6 seconds, not 2. Eight pictures of a small page: 47 seconds before, 7 now.
- Pictures are marked and the overview sheets drawn side by side too.

### Fewer words for an agent to read

- `--help` says every option, so the script need not be read to run it.
- The skill says the steps; what only some pages need is in `reference.md`, read when needed.
- An overview sheet for each part (`<part>-overview.png`), every pair before beside after: one image to look at
  instead of each picture. It is never published.
- The run says what it did in a few lines: how many pictures, which have nothing marked, what was not there.
  With `--update-pr` the table goes in the description and `table.md`, and is not printed again.

### Easier in any project

- `--pr` can be left out: the GitHub CLI finds the branch's pull request.
- Playwright installed globally works, for a project without Node of its own.
- A server that does not answer, or a Chromium not installed, is said in a line before any picture is taken.
- `--reuse` publishes the pictures already taken, the ones that were looked at, without taking them again.

### Only what changed

- A pair that is the same before and after, pixel for pixel, is not kept, shown or published; the table names
  it in a line, so the reviewer knows it was looked at.
- With nothing left to compare, the run stops before drawing anything (exit 3) and says why: pairs that were the
  same, parts on neither side. With `--update-pr` the description says so, and why, in place of a table, and no
  pictures are pushed.

### Fixed

- A note is ringed only on the part it is in, not on every part's picture.
- Every GitHub CLI call names origin's repository (`--repo`), so `GH_REPO` or gh's own default can never point
  it at a pull request of the same number elsewhere.
- An address with a login is reached, and a login or token in an address is never printed.
- A second run for another page no longer draws again on the first page's pictures (a second tag, marks around
  the marks): only the pictures a run takes are finished.
- A `--click` on something only one side has (a new button) no longer stops the run after 30 seconds: that
  side is pictured as it is, and the run says so.

## 0.4.1 (2026-10-28)

- `--prune [--older-than 30]` takes off the `sideshot` branch the pictures of pull requests closed or merged at
  least that many days ago, so a project that uses SideShot does not grow for ever. The branch is written again as
  one commit of what is left, with a push that is refused if anyone pushed to it in between. Those pull requests
  no longer show their pictures; open ones keep theirs. Only folders named for a pull request are taken off.
- `gh` is always asked about the repository origin is (`--repo`), when publishing and when pruning, never about
  one it would pick by itself.
- A flag given last, with no value after it (`--branch`), is refused rather than taken as its default.
- Development: TypeScript 7, ESLint 10. The type check says `strict: false` rather than taking the default, and
  Node's types stay on the Node SideShot supports. `main` now needs the checks to pass before a merge.

## 0.4.0 (2026-10-28)

### Safer to run

- A token in `origin`'s address, or a login or token in `--before` or `--page`, no longer reaches the pull
  request's description: the table shows only the GitHub repository, and where each side came from as origin and
  path.
- A picture can no longer be written outside the output folder: part names are letters, digits, `-` and `_`.
- `--branch` is checked before git sees it (never as an option such as `--upload-pack=…`), and with
  `git check-ref-format` before anything is pushed.
- `$` in a note stays as written in the description, and text written by hand around the table is kept on every
  later run, even after a marker is deleted.

### Says what is wrong, before a browser opens

SideShot now stops, with a plain message, on input it used to accept or quietly change:

- a part name that is not safe in a file name, or two parts or two devices of one name
- an unknown colour scheme (`--schemes light,drak`)
- a `--wait` that is not a whole number of milliseconds
- an address for "before" or "after" that is not http or https
- a `.sideshot.json` that is not a JSON object
- running outside a git repository

`.sideshot.json` can now give `schemes` and `devices` as text: `"schemes": "dark"`.

### Marks only what changed

- `--mark-changes` boxes what was added close around it, instead of across the card or column it sits in.
- Space that only grew or shrank, such as the inside of a card made taller by something new, is no longer marked,
  and content that only moved down is no longer boxed with what was added above it.
- A solid block, a bar or a button, that only got taller is boxed, and one that got shorter is ruled.
- Something taken out is ruled even when a block just like it is still on the page.

### For people working on SideShot

- Tests: `npm test` (unit), `npm run test:e2e` (pictured in Chromium, what is drawn on the pictures, and
  publishing to a repository made in the test), `npm run lint`, `npm run typecheck`, and `npm run check` for all
  of them. CI runs them on every pull request, on Linux and macOS.
- CodeQL looks at the code on every pull request and weekly. Actions are pinned to commits, and Dependabot keeps
  them and the development tools current.
- [SECURITY.md](SECURITY.md) says how to report a vulnerability privately.
- What is drawn on the pictures (`draw.mjs`) and what SideShot is asked (`lib.mjs`) are modules of their own.

## 0.3.1

- One SideShot tag to a pair, on the "after" picture.

## 0.3.0

- Devices you choose, numbered rings for notes, change marks, an accent colour that stands out from the page, and
  the SideShot tag.
