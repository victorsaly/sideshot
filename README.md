<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lockup-dark.png" />
    <img src="docs/assets/lockup-light.png" alt="Sideshot: see the change, side by side" width="450" />
  </picture>
</p>
<h3 align="center">Before and after, for every pull request that changes what people see.</h3>

<p align="center"><img src="docs/assets/hero.png" alt="Sideshot: the same part of a page before and after a change, on a desk and a phone" width="960" /></p>

<p align="center">Tell your coding agent to <em>sideshot this PR</em>. It works out which page and which parts your change
touches, pictures them before and after on a desk and a phone (and in dark mode, if colours changed), shows you
first, then puts the side-by-side table in the pull request. Reviewers see the change instead of imagining it.</p>

<p align="center">
  <a href="#start"><strong>Get started</strong></a> &nbsp;·&nbsp;
  <a href="#what-you-get"><strong>What you get</strong></a> &nbsp;·&nbsp;
  <a href="#how-it-works"><strong>How it works</strong></a> &nbsp;·&nbsp;
  <a href="#options"><strong>Options</strong></a>
</p>

<p align="center">
  <a href="https://skills.sh"><img src="https://img.shields.io/badge/Agent_Skill-Claude_Code_%C2%B7_Codex_%C2%B7_Cursor_%C2%B7_OpenCode-000000?style=flat-square" alt="An Agent Skill, for Claude Code, Codex, Cursor and OpenCode" /></a>
  <img src="https://img.shields.io/badge/version-0.2.0-000000?style=flat-square" alt="Version 0.2.0" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000?style=flat-square" alt="MIT licence" /></a>
</p>

<a id="start"></a>

## Install, then ask

One skill, any coding agent that reads [Agent Skills](https://skills.sh):

```bash
npx skills add victorsaly/sideshot -g
```

Then, on a branch with a pull request:

```text
Sideshot this PR: the pricing table changed. Compare it with production, on desk and phone.
```

Then carry on: *"add dark mode"*, *"also the checkout page"*, *"put it in the PR"*.

<details>
<summary>Claude Code plugin, and other ways in</summary>

**Claude Code**, as a plugin (updates come through `/plugin`):

```text
/plugin marketplace add victorsaly/sideshot
/plugin install sideshot@sideshot
```

Then type `/sideshot` or just ask. From a terminal: `claude plugin marketplace add victorsaly/sideshot` and
`claude plugin install sideshot@sideshot`.

**By hand**, no agent at all: copy `skills/sideshot/` anywhere and run its script (see [Options](#options)).

</details>

<a id="what-you-get"></a>

## What you get

Real pictures, from a real pull request: a studio page whose merge button learned to wait while work was still
running ([agentic-blog #151](https://github.com/victorsaly/agentic-blog/pull/151)).

| On a desk | On a phone | Light and dark |
|---|---|---|
| [![The part that changed, before and after, on a desk](docs/assets/example-desk.png)](docs/assets/example-desk.png) | [![The same change on a phone](docs/assets/example-phone.png)](docs/assets/example-phone.png) | [![The change in light and dark](docs/assets/example-dark.png)](docs/assets/example-dark.png) |
| The part that changed, not the whole page, so before and after line up. | The same change where most people read it. | Colour and contrast checked in both themes. |

- **Pictures that stay out of your code.** They live on a `sideshot` branch that never merges.
- **A table that does not pile up.** The description gets one before/after table between markers; running again
  replaces it.
- **You look first.** Nothing is pushed until you have seen the pictures.
- **Honest about gaps.** A part that is new or removed shows as *(not there)* on one side, and the run says so.

<a id="how-it-works"></a>

## How it works

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-dark.png" />
    <img src="docs/assets/how-light.png" alt="Your diff, then before and after, then Playwright on desk and phone, then you look, then the PR" width="960" />
  </picture>
</p>

- **Before** is the site as it is: production, a preview deploy, or `main` run locally when the page sits behind a
  login.
- **After** is your branch, running locally.
- **Pages with live data** only production can reach get the same stand-in data on both sides, so only your change
  differs (a small `--setup` file, below).

## Quick start

1. **Install** with `npx skills add victorsaly/sideshot -g` (or the Claude Code plugin above).
2. **Have Playwright in the project**: `npm i -D playwright && npx playwright install chromium`. Your agent asks
   before adding it.
3. **Ask on a branch with a PR**: *"Sideshot this PR"*. Add `.sideshot/` to `.gitignore`.

Optional: save where *before* and *after* live in `.sideshot.json`, so later runs need nothing else:

```json
{ "before": "https://example.com", "after": "http://localhost:4321" }
```

<a id="options"></a>

<details>
<summary><strong>Options</strong>, for running the script yourself</summary>

```bash
node skills/sideshot/scripts/sideshot.mjs --pr 123 --page /pricing --part plans=#plans \
  --before https://example.com --after http://localhost:4321
```

| Option | What it does |
|---|---|
| `--pr 123` | The pull request the pictures belong to. |
| `--page /path` | The page to open on both sides. |
| `--part name=selector` | A part to picture; repeat for more. `--part page=body` for the whole page. |
| `--before URL` / `--after URL` | Where each side runs. |
| `--devices desk,phone` | Desk 1280×900 and phone 390×844, at 2x. |
| `--schemes light,dark` | Light, dark, or both. |
| `--click "selector"` | Something to press first: a tab, a panel, a menu. |
| `--setup ./file.mjs` | Runs on each page before it opens: stand-in data, a cookie, a login. |
| `--publish` | Pushes the pictures to the `sideshot` branch and prints the table. |
| `--update-pr` | Also writes the table into the PR description (needs the GitHub CLI). |

A `--setup` file, for a page whose data only production can reach:

```js
export default async (page, { when, device, scheme }) => {
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [] } }));
};
```

</details>

## Where it comes from

Sideshot grew out of [agentic-blog](https://github.com/victorsaly/agentic-blog), where every pull request that
changes a page carries its before and after; it has been taking those pictures there since
[#111](https://github.com/victorsaly/agentic-blog/pull/111), and became its own tool in October 2026.

## Licence

MIT, © Victor Saly
