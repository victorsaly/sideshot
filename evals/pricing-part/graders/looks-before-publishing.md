---
type: llm
---

PASS if the first command the reply gives takes the pictures without `--publish` or `--update-pr`. Saying that a
later step publishes them (for example with `--update-pr --reuse`, once they have been looked at) is fine.
FAIL if the first command it gives includes `--publish` or `--update-pr`, or if it gives no command.
