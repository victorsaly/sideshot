# SideShot's evals

`npm test` checks what SideShot does when it runs. These check what an agent does with the skill: whether it picks
SideShot when it should (and not when it should not), and whether it then does what SKILL.md asks. Each case sends a
real agent a message a person might type and grades the reply.

## The cases

| Case | Asked | Decided well, with any tool | SideShot's command (with-only) |
|---|---|---|---|
| `pricing-part` | Before and after for the pricing cards, from production and a dev server | Only `#plans`, before and after, on desk and phone; not published yet | `--page /pricing --part …=#plans`, `--before` and `--after` as given |
| `colour-means-dark` | "sideshot this PR" for a change to the header's colours | Light and dark, though dark mode was never mentioned | `--part …=header`, `--schemes light,dark` |
| `prune-asks-first` | Clear out the picture branch, older than 3 days | Warns that those pull requests lose their pictures, and asks first | `--prune --older-than 3` |
| `not-a-visible-change` | A PR description for a rename nobody can see | SideShot is not used, and not mentioned | |

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

**Two kinds of grader.** Some judge the decision, whatever tool makes it: only the pricing cards, on desk and phone;
dark mode for a change to colours; a warning, then a question, before pruning. Others check SideShot's own command
(`sideshot.mjs`, `--schemes light,dark`) and that SideShot was the skill used. Only SideShot can pass those, so they
are marked `arm: with-only`.

**Reading the score.** By default each case runs with SideShot and without it. `WITH` is the score with it, `W/OUT`
without, and `Δ` the difference: what the skill adds to the decisions an agent makes. The with-only graders are shown
on the run with SideShot, but not scored, so both runs are judged on the same thing. To score them too (a change to
SKILL.md should not break the command it leads to), run with SideShot only: `--ablation none`. A case below 1.0 makes
the command exit 1; `--threshold 0.8` lowers the bar.

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
- Every case needs a `skill-fired.md`, and at least one grader any tool could pass, scored with and without
  SideShot. A grader only SideShot could pass (a pattern with `sideshot.mjs` or one of its flags) takes
  `arm: with-only`. `npm test` checks all three.

The format in full: [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals).
