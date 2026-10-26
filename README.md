# victorsaly's skills for Claude Code

Habits from building [agentic-blog](https://github.com/victorsaly/agentic-blog), made reusable in any project as
[Claude Code](https://code.claude.com) plugins.

## Install

In Claude Code:

```
/plugin marketplace add victorsaly/claude-skills
/plugin install pr-shots@victorsaly
```

Or from a terminal:

```bash
claude plugin marketplace add victorsaly/claude-skills
claude plugin install pr-shots@victorsaly
```

New versions arrive with `claude plugin marketplace update victorsaly` and `claude plugin update pr-shots@victorsaly`
(or turn on auto-update for this marketplace under `/plugin` → Marketplaces).

## Plugins

### pr-shots: before and after, for a pull request

A pull request that changes what people see is reviewed faster, and more honestly, with the same part of the page
before and after the change, side by side, on a desk and on a phone.

Ask Claude for *before and after screenshots for this PR*, or type `/pr-shots` (or `/pr-shots:pr-shots`). It works
out the page and the parts from the diff, takes the pictures with Playwright (desk 1280×900 and phone 390×844,
optionally dark mode), shows them to you first, then keeps them on a `pr-screenshots` branch that never merges and
writes the table into the PR description, replacing its own table on later runs.

- **Before** comes from the site as it is (production, a preview, or `main` run locally when the page is behind a
  login); **after** from your branch running locally.
- **Live data** a local server cannot reach is stood in with a small `--setup` module (`page.route`), the same for
  both sides.
- Needs [Playwright](https://playwright.dev) in the project (`npm i -D playwright && npx playwright install chromium`)
  and the [GitHub CLI](https://cli.github.com) to update the PR.

The script also runs on its own:

```bash
node <plugin>/skills/pr-shots/scripts/pr-shots.mjs --pr 123 --page /pricing --part plans=#plans \
  --before https://example.com --after http://localhost:4321 [--schemes light,dark] [--update-pr]
```

Defaults can live in `.pr-shots.json` at the project's root:

```json
{ "before": "https://example.com", "after": "http://localhost:4321", "devices": ["desk", "phone"] }
```

## Licence

MIT
