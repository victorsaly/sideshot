# Changelog

## 0.6.0 (unreleased)

- **A pull request that changes what people see gets its pictures without being asked for them**, in Claude Code.
  The plugin has a hook now: after the agent pushes, or opens a pull request, that changes styles, components,
  markup, images or fonts, and whose description has no SideShot table yet, the agent is reminded of SideShot and
  decides whether the change shows on a page. Backend changes, and pull requests that have their table, hear
  nothing. `"remind": false` in `.sideshot.json` turns it off for a project, and `SIDESHOT_REMIND=off` for every
  one. With the skill alone, the README says how to turn the same reminder on in Claude Code; for other agents, it
  gives the line to put in `AGENTS.md`.

## 0.5.7 (unreleased)

- **`--mark-changes` boxes the one thing that changed in a row, not the row.** A block that replaced rows of the
  same height in the same place (a button's colour, a word, an icon) was boxed around everything inked in those
  rows, measured against the row above, so a changed button took the button beside it into its box, and a dot
  that turned green took the line of text beside it. Such a block is now compared with the rows it replaced, and
  boxed around what differs from them: the button, the dot. A block that is new, or taller or shorter than what it
  replaced, is boxed as before.

## 0.5.6 (2026-10-29)

- **`--mark-changes` marks what changed, not lines that only moved a pixel.** A page's lines sit at fractional
  heights and are drawn at the nearest whole pixel, so when something above them changes height, each can land a
  pixel higher or lower than it was. Beside a gutter that runs down every row (a diff's + column), the space between
  them read as content, and a pixel more or less of it was boxed or ruled: small boxes round single letters, dashed
  rules between lines that had not changed. A label in a button that did not move, a pixel or two higher, was boxed
  too, its icon and its words each rounded on their own. Space that grew or shrank by 2 pixels or less is now left
  alone, and so is a box or a rule over something whose every pixel is still within 2 pixels of where it was, both
  ways, so a mark that turned into another in the same place is still marked. On the pictures of
  victorsaly/skills#2, 7 marks on a phone became 1, the line that was added, and 7 on the merge section became the
  one that changed.

## 0.5.5 (2026-10-29)

- **The description says what SideShot pictures: the part that changed, not the whole page**, shown first, and
  that the skill is opened before the pictures are planned. An agent asked to "show the reviewers how it looked and
  how it looks now" named SideShot from its description in one run of three, never opened it, and planned the whole
  page; with the new description it opened SideShot and planned the part in five of five.
- **Three more evals**: two near misses SideShot stays out of (an API change that shows nothing on screen, and one
  screenshot for the docs) and one ask with no word for pictures it must still take. Seven cases now.
- **The README says the problem first** (*A diff cannot show a UI change*), what a reviewer is spared, and, as a
  diff, screenshots by hand beside SideShot. SideShot's page on skills.victorsaly.com says the same
  (victorsaly/skills#2).

## 0.5.4 (2026-10-29)

- **Pictures show in a private repository's pull requests.** The table linked them on `raw.githubusercontent.com`,
  which answers 404 for a private repository, even to those who can read it. It links them through `github.com` now,
  which sends a reader on to the picture with their sign-in; on a public repository it ends at the same picture as
  before. The branch is named in full (`refs/heads/`), so a `--branch` with a slash in it works too.
- **The GitHub CLI, missing or not signed in, is said before anything is pictured** (exit 2), for `--update-pr` and
  `--prune`, in place of gh's own error once the pictures were pushed and no table was written.
- **A refused push is said in a sentence**, with what git said, in place of a stack trace. The checkout is gone
  and the pictures are kept, for `--reuse`; a prune that is refused takes nothing off.
- **An icon for the plugin**, SideShot's mark (`docs/assets/mark.png`).

Measured against Anthropic's checklist for skills and the most-starred skill repositories:

- **Evals.** Four cases under `evals/`, run with `claude plugin eval .`. They check that an agent asked in plain words
  pictures the part that changed, on desk and phone, and looks before it publishes; adds dark mode when colours
  changed; says what pruning takes away and asks first; and leaves SideShot alone for a change nobody can see. Each
  is judged on the decision, with SideShot and without it, so the difference is what the skill adds; SideShot's own
  command is checked too. With it, all four pass every run; without it, three do not (`evals/README.md`).
- **`npm test` checks the skill's own files.** SKILL.md's name, description, length and size, that its links are
  there and go one step deep, that the eval cases are ones the runner takes and judge fairly, that every install line
  in the docs adds Chromium, and that `plugin.json`, SKILL.md, the README badge and the newest changelog entry give
  the same version.
- **SKILL.md says its version**, so an install with `npx skills add` can tell which one it is.
- **What each wait is for.** The timings in `sideshot.mjs` are named in one place, `waits`, each with why it is that
  long. They have not changed.
- **A clearer README.** What it needs up front, one place to install, what a part is, what it writes to your
  repository and who can see it, every option with what it is unless said, and *When something goes wrong*: what
  each message means and what to do. `reference.md` says which options `.sideshot.json` takes, exactly.
- **For people and agents working on SideShot**: `CONTRIBUTING.md`, `AGENTS.md` (and `CLAUDE.md`, which reads
  it), issue forms and a pull request checklist.

## 0.5.3 (2026-10-29)

From a security and code-standards review of 0.5.0:

- With `--pr` left out, SideShot takes only a pull request whose branch is in this repository. gh finds pull
  requests by branch name alone, forks too, so on `main` it could have taken a fork's pull request and, with
  `--update-pr`, rewritten its description. With none, or more than one, it asks for `--pr`.
- A part or a note named in Playwright's own selectors (`:has-text(...)`, `text=`) is pictured and ringed,
  instead of stopping the run: they were also handed to the page's `querySelector`, which cannot read them.
- What `run.json` keeps is read only in the shape SideShot writes it, since it goes into a pull request's
  description. A file that is not that is ignored, instead of stopping `--reuse`.

## 0.5.2 (2026-10-28)

- `--mark-changes` marks only the card that changed when cards sit side by side. Where both pictures have an
  empty gutter from top to bottom, each column is compared on its own; before, a card that grew boxed the rows
  of the card beside it too. A picture with no such gutter is compared across its width, as before. A thin thing taken out in a column of its own is still ruled.

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
