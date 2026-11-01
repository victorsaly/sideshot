# SideShot: when the page needs more

Read only what the page in front of you needs. Every option is in `node <this skill's folder>/scripts/sideshot.mjs
--help`.

## "Before" from `main`, run locally

When production cannot show the page as it needs (behind a login, or showing different data), run `main` beside
the branch: `git worktree add ../<repo>-main origin/main`, install, build and serve it on another port in the
background, and give that as `--before http://localhost:4322`. Stop it and remove the worktree afterwards.

## Azure DevOps

When origin is on Azure DevOps (dev.azure.com, or an older `*.visualstudio.com`), taking and looking are the same;
publishing differs:

- **Sign-in:** `az login` with the Azure CLI, or a personal access token with Code (read and write) in
  `AZURE_DEVOPS_EXT_PAT`. In a pipeline, `SYSTEM_ACCESSTOKEN` is used. Without one, publishing stops and says so.
- **Where the pictures go:** attachments of the pull request, not a branch, so there is nothing to `--prune`.
- **Where the table goes:** a comment of SideShot's own on the pull request, replaced on every run and posted as
  closed, so it never holds a merge that wants every comment resolved. A description holds only 4000 characters;
  it gets one line saying where the pictures are, when that fits.

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
- **What `--mark-changes` draws**, said in a line under the table too: a box around what was added or changed, a
  dashed rule on "after" where something was taken out, and a dashed box on "before" where it was. A noted
  element's ring stands in for a box it covers. A part that differs nearly everywhere (a colour, a font, a
  spacing) is boxed once, and the run and the table say so. A change under 40 pixels each way is shown again at
  three times its size, in an inset joined to it by a thin line.
- **Which words changed**, under each pair in the table: the part's text as the page shows it, what went struck
  through and what came in bold, three words round each stretch.
- **One small SideShot tag** to a pair, in the corner of the "after" picture. `--no-watermark` leaves it off.
- A picture drawn on keeps a plain copy beside it (`*-plain.png`); plain copies and overview sheets are never
  published.
- Pictures are 2x. A part that was removed shows as "(not there)" on after. A part that is new is shown alone,
  marked "new", with no rings or boxes on it; when every part is, the table is headed "What's new".

## When a run is slow or wrong

- **Speed.** Pictures are taken four at a time (`--jobs`). A dev server that builds each page on first request
  may do better with `--jobs 2`; a fast machine and server, with more.
- **Not done drawing.** Each part gets `--wait` (1500 ms) once it is in view, then until its animations end and
  its height holds. A chart or a font that comes late: `--wait 3000`.
- **Pages that never go quiet** (they poll) are fine: the network is waited on briefly, not until it stops.
- **A press that misses** on one side (a button that is new or gone) is said, and that side is pictured as it is.
