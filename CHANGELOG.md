# Changelog

## 0.4.0 (unreleased, work in progress)

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
