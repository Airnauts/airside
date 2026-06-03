---
"@airnauts/comments-next": minor
---

Add a `disabled?: boolean` flag to `createCommentsRoute`. When set, every handler
(`GET`/`POST`/`PATCH`/`OPTIONS`) returns `404` and no server is constructed — for keeping
the route mounted but dormant when a backend is unconfigured.

BREAKING: the returned `server` is now optional (`server?: CommentsServer`) — it is
`undefined` on the disabled path. Consumers reading `route.server` must narrow it.
