---
description: Asked without the words screenshot, picture or before and after, the agent still finds SideShot for a visible change in a pull request, and pictures the part.
expected_outcome: A SideShot command for `.checkout button` on /cart, before from production and after from the dev server.
tags: [trigger, paraphrase]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

My PR restyles the checkout button on /cart (it's `.checkout button`). Can you show the reviewers how it looked
and how it looks now? Production is https://example.com, my branch is running on http://localhost:3000.

Don't run anything yet, tell me what you'd do first.
