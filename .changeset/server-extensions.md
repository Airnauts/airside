---
"@airnauts/comments-server": minor
---

New `extensions` option on `createCommentsServer` wires both notification channels and thread
actions through one list (each factory returns an array, so spread them:
`extensions: [...slackNotifications({ … })]`). Adds `POST /threads/:id/actions/:actionId` to run a
registered thread action, which can persist an external link back on the thread. The old
`notifiers` option still works but is now **deprecated** — prefer `extensions`.
