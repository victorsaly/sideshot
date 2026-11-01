---
type: llm
weight: 2
---

Judge the plan in the reply, with whatever tool it uses: the command it gives, and what it says it will do next.

PASS if the plan pictures the referral banner (`.referral-banner`) on /account as it is now, from
http://localhost:3000, and does not plan a "before" picture of it from production, or plans one only to say it
is not there; and shows the pictures to the user before putting them in the pull request.
FAIL if it pictures the whole page, plans a before-and-after comparison of the banner with marks or notes on what
changed, or puts the pictures in the pull request without showing them first.
