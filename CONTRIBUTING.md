# Contributing to SideShot

Thank you for helping. A bug found, a page SideShot pictures wrong, a sentence in the README that misled you: all
of it is welcome.

## Saying what is wrong, or what is missing

[Open an issue](https://github.com/victorsaly/sideshot/issues/new/choose). For a bug, the command you ran (or what
you asked your agent), what it said, and what you expected are what make it quick to fix. A security problem goes
to [private reporting](https://github.com/victorsaly/sideshot/security/advisories/new) instead, as
[SECURITY.md](SECURITY.md) says.

For a bigger change, open an issue first, so we can agree on the shape before you write it.

## Setting up

Node 22 or later, then:

```bash
npm install && npx playwright install chromium
npm run check   # lint, typecheck, unit tests with coverage, e2e: what CI runs on Linux and macOS
```

How the code is laid out, and how it is written, is in [AGENTS.md](AGENTS.md): it is the same for people as for
agents.

## Making a change

1. **A test first.** A bug gets a test that fails without the fix. Something new gets tests for what it does,
   and `lib.mjs` stays at least 90% covered.
2. **`npm run check` passes** before you push.
3. **The skill, when you change what it says.** A change to `SKILL.md` or `reference.md` is a change to how
   agents behave, so run the evals (`claude plugin eval .`, Claude Code 2.1.269 or later): they run real sessions
   on your own plan, so CI does not. Add a case under `evals/` for a new behaviour; [evals/README.md](evals/README.md)
   says what each case checks, how to run one cheaply, and how to add one.
4. **Pictures, when it changes what SideShot draws or publishes.** Run SideShot on its own pull request.
5. **A version, in the same pull request** (below).

Every review comment is answered: fixed (with a test, and the commit named in the reply) or explained, and the
conversation resolved. `main` takes a pull request once CI and CodeQL pass and every conversation is resolved.

## Versions and releases

Each pull request that changes the skill is its own release: a fix is a patch (0.5.3 to 0.5.4), more than that a
minor (0.5.4 to 0.6.0). Take the number from what is released, `git fetch --tags && gh release list`, since another pull request
may have shipped since you started.

In the pull request, these say the same version, and `npm test` fails when they do not:

- `"version"` in `.claude-plugin/plugin.json`
- `version` under `metadata` in `skills/sideshot/SKILL.md`, which is all an install with `npx skills add` has
- the `version-x.y.z` badge in the README, and its words
- the newest heading in `CHANGELOG.md`: `## x.y.z (unreleased)`

To release it:

1. As the pull request's last commit, date the changelog heading: `## x.y.z (YYYY-MM-DD)`.
2. Merge it with a merge commit, at the commit CI checked: `gh pr merge <n> --merge --match-head-commit <sha>`.
3. Tag the merge commit: `git tag -a vx.y.z -m "SideShot x.y.z" <merge commit> && git push origin vx.y.z`.
4. Publish the release, its notes the changelog section for x.y.z (everything under its heading, saved as
   `notes.md`): `gh release create vx.y.z --title "SideShot x.y.z" --notes-file notes.md --latest`.

A tag that is published is never moved or replaced. If something was missed, it goes out as the next patch.
