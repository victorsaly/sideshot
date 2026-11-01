---
description: For a component that did not exist before, the agent pictures only what is new, with --new, rather than a before that shows nothing.
expected_outcome: A SideShot command with --new for `.referral-banner` on /account, after from the dev server, with no --before, no notes and no marks.
tags: [new-feature]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

My PR adds a brand-new referral banner on /account (it's `.referral-banner`); nothing like it was there before. I
want screenshots of it in the PR. My branch is running on http://localhost:3000, production is https://example.com.

Don't run anything yet, tell me the command you'd run first.
