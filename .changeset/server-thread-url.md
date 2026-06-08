---
"@airnauts/comments-server": minor
---

Notification events now carry a ready-made `threadUrl` deep-link, built by the server from a new
optional `threadParam` option on `createCommentsServer` (defaults to `comments-thread`). Notifiers
no longer build the link themselves.
