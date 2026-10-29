---
description: Asked in plain words, the agent finds SideShot and pictures the part that changed, not the whole page, before it publishes anything.
expected_outcome: A first command that takes pictures of #plans on /pricing, before from production and after from the dev server, without publishing.
tags: [trigger, first-run]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

Can you get me before and after screenshots for my PR? I changed the pricing cards on /pricing, they're the
`#plans` section. Production is https://example.com and my dev server is running on http://localhost:4321.

Don't run anything yet: just tell me the exact command you'd run first.
