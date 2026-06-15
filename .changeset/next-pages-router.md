---
"@airnauts/comments-next": minor
"@airnauts/comments-server": minor
---

Add first-class Next.js Pages Router support and unify the Next integration. `@airnauts/comments-next` now exports `createCommentsAppRoute` (App Router) and `createCommentsPagesRoute` (Pages Router); the old `createCommentsRoute` is renamed to `createCommentsAppRoute`. All Next.js glue moves into `@airnauts/comments-next`: `@airnauts/comments-server` drops the `@airnauts/comments-server/next` subpath and adds `@airnauts/comments-server/node`, a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any Node server.

BREAKING: `createCommentsRoute` → `createCommentsAppRoute`; `@airnauts/comments-server/next` (`createNextHandler`) moves to `@airnauts/comments-next`.
