# SideShot: when the page needs more

Read only what the page in front of you needs. Every option is in `node <this skill's folder>/scripts/sideshot.mjs
--help`.

## "Before" from `main`, run locally

When production cannot show the page as it needs (behind a login, or showing different data), run `main` beside
the branch: `git worktree add ../<repo>-main origin/main`, install, build and serve it on another port in the
background, and give that as `--before http://localhost:4322`. Stop it and remove the worktree afterwards.

## Pages whose data only exists in production

When a page reads live data the local server cannot reach (an API behind auth, a database), give it stand-in data
with `--setup ./sideshot-setup.mjs`, a module whose default export runs on every page before it opens:

```js
// sideshot-setup.mjs: the same stand-in data for before and after, so only the change differs.
export default async (page, { when, device, scheme }) => {
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [/* … */] } }));
};
```

Use the same stand-ins for both sides, and say in the PR that the data is stood in. The module is the project's
own code and runs as it is.

## Devices

`--devices` (default `desk,phone`): `desk`/`web` 1280×900, `phone`/`mobile` 390×844, `tablet` 820×1180, `laptop`
1440×900, `wide` 1920×1080, any size (`1024x768`), or your own name for one (`pixel=412x915:mobile`; `:mobile` for
touch). In `.sideshot.json`, `devices` is a list, or a map of the project's names to sizes:
`{ "web": "desk", "kiosk": "1080x1920" }`.

## `.sideshot.json`

These options, under their own names, at the project's root: `pr`, `before`, `after`, `page`, `devices`, `schemes`,
`click`, `setup`, `wait`, `jobs`, `accent`, `markChanges: true`, `watermark: false`, `out`, `branch`, `olderThan`, and
`remind: false`, which stops the Claude Code plugin reminding the agent after a push. Parts and notes are not kept
there: they change with every pull request. A flag given on the command line wins over the file.

## What the pictures carry

- **One marking colour.** Rings and change marks are marigold unless the page is close to it; then the script
  picks magenta, cyan, violet or lime, whichever the pictures use least, and says so. `--accent cyan` or
  `--accent "#ff5a1f"` pins one.
- **One small SideShot tag** to a pair, in the corner of the "after" picture. `--no-watermark` leaves it off.
- A picture drawn on keeps a plain copy beside it (`*-plain.png`); plain copies and overview sheets are never
  published.
- Pictures are 2x. A part that is new or removed shows as "(not there)" on one side.

## When a run is slow or wrong

- **Speed.** Pictures are taken four at a time (`--jobs`). A dev server that builds each page on first request
  may do better with `--jobs 2`; a fast machine and server, with more.
- **Not done drawing.** Each part gets `--wait` (1500 ms) once it is in view, then until its animations end and
  its height holds. A chart or a font that comes late: `--wait 3000`.
- **Pages that never go quiet** (they poll) are fine: the network is waited on briefly, not until it stops.
- **A press that misses** on one side (a button that is new or gone) is said, and that side is pictured as it is.
