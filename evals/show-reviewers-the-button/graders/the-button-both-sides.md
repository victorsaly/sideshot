---
type: llm
weight: 2
---

Judge the plan in the reply, with whatever tool it uses: the command it gives, and what it says it will do next.

PASS if the plan pictures the checkout button (`.checkout button`) on /cart, not the whole page, both before (from
https://example.com) and after (from http://localhost:3000), and shows the pictures to the user before putting them
in the pull request.
FAIL if it pictures the whole page, leaves out before or after, or puts them in the pull request without showing
them first.
