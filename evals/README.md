# SideShot's evals

`npm test` checks what SideShot does when it runs. These check what an agent does with the skill: whether it picks
SideShot when it should (and not when it should not), and whether it then does what SKILL.md asks. Each case sends a
real agent a message a person might type and grades the reply.

## The cases

| Case | Asked | Passes when |
|---|---|---|
| `pricing-part` | Before and after for the pricing cards, from production and a dev server | The first command pictures `#plans` on `/pricing`, before and after where they were said to be, and does not publish yet |
| `colour-means-dark` | SideShot for a change to the header's colours | The command pictures the header with `--schemes light,dark`, though dark mode was never mentioned |
| `prune-asks-first` | Clear out the picture branch, older than 3 days | It gives `--prune --older-than 3`, says those pull requests lose their pictures, and asks before running it |
| `not-a-visible-change` | A PR description for a rename nobody can see | SideShot is not used, and not mentioned |

The cases ask for the command rather than run it, so a run needs no project, server or browser: each starts in an
empty folder, and the agent may only read (`Read`, `Glob`, `Grep`, `Skill`).

## Running them

Claude Code 2.1.269 or later, from the repository's root:

```bash
claude plugin eval . --max-cost-usd 10                      # all of them, 3 runs each, with and without SideShot
claude plugin eval . --case pricing-part --runs 1 --ablation none   # one case, once, while you work on it
```

The first run asks you to trust the folder (`--trust-plugin` says yes for you). Each run is a real session on your own
plan or API key, which is why CI does not run them; `--max-cost-usd` stops the run if it gets there. The HTML report
is also published to claude.ai when your account can, unless you add `--no-publish`; either way it, and
`aggregate-result.json`, are kept in `evals/results/`, which git ignores.

**Reading the score.** Each case runs with SideShot and without it. `WITH` is the score with it, `W/OUT` without, and
`Δ` the difference: what the skill adds. The check that SideShot was the skill used is shown, but not scored, since
it can never pass without SideShot (except in `not-a-visible-change`, where SideShot not being used is the point).
A case below 1.0 makes the command exit 1; `--threshold 0.8` lowers the bar.

## Adding a case

A folder here, named for what it checks:

```text
evals/<case>/
├── prompt.md          # frontmatter, then the message, as a person would type it, not naming the skill
└── graders/
    ├── skill-fired.md # copy one: checks SideShot was used (or, with min: 0 and max: 0, that it was not)
    └── <what>.md      # what the reply is graded on
```

- `prompt.md` takes only the keys `claude plugin eval` knows (`description`, `expected_outcome`, `tags`,
  `max_turns`, `allowed_tools`, `runs`, `model`, …); `npm test` refuses any other, as the runner would.
- Grade with a `regex` where you can: it costs nothing and gives the same answer every time. Match the whole value
  (`/pricing`, not `/pricing-old`), and add replies it must take and must refuse to `examples` in
  `test/skill.test.mjs`. Keep `llm` graders for what a pattern cannot say (it warned, then asked), with a PASS and a
  FAIL line each.
- Every case needs a `skill-fired.md`; `npm test` checks that too.

The format in full: [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals).
