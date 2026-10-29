---
description: A near miss. The pull request touches the pricing page's API, by name, but nothing on screen changes, so SideShot stays out.
expected_outcome: A PR description, written without SideShot and without proposing screenshots.
tags: [trigger, negative, near-miss]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Write the pull request description for my change: the `/api/pricing` endpoint now returns prices in cents
instead of dollars (`server/routes/pricing.ts`), and the pricing page formats them through the same
`formatPrice` helper, so what people see on /pricing stays exactly the same.
