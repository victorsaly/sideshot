---
type: llm
weight: 2
---

Judge the plan in the reply, with whatever tool it uses: the command it gives, and what it says it will do next.

PASS if the plan pictures only the pricing cards (`#plans`), not the whole page, both before (from
https://example.com) and after (from http://localhost:4321), and on both a desktop-sized and a phone-sized screen.
A size can be named in the reply, or be the tool's own default: SideShot, for one, pictures desk and phone unless it
is told otherwise.
FAIL if it pictures the whole page, leaves out before or after, or plans one screen size only.
