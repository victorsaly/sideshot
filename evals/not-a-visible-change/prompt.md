---
description: A pull request nobody can see stays clear of SideShot, so the skill does not fire on every PR.
expected_outcome: A PR description, written without SideShot and without screenshots.
tags: [trigger, negative]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a short pull request description for this change: I renamed the private helper `parseRow` to `rowOf` in
`server/db.ts` and updated its two call sites. Nothing user-facing changed.
