---
"@airnauts/comments-adapter-memory": patch
"@airnauts/comments-adapter-mongo": patch
"@airnauts/comments-adapter-postgres": patch
---

Thread `unresolvedCount` is now computed via core's shared `unresolvedCountOf`
policy instead of per-adapter copies. Stored data and query results are unchanged.
