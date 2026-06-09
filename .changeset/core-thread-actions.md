---
"@airnauts/comments-core": minor
---

Threads can now carry `externalLinks` (e.g. a created Jira issue) and thread read responses
include an evaluated `actions` array describing the server-side actions a reviewer can run on the
thread. Adds the contract for the generic thread-action endpoint
(`POST /threads/:id/actions/:actionId`).
