---
"@airnauts/comments-server": minor
"@airnauts/comments-adapter-memory": minor
"@airnauts/comments-adapter-mongo": minor
"@airnauts/comments-storage-fs": minor
"@airnauts/comments-storage-vercel-blob": minor
"@airnauts/comments-next": minor
---

Uniform adapter construction: every repository/storage adapter now exposes a factory
function (`memoryRepository()`, `mongoRepository({ uri })`, `fileSystemStorage({ rootDir, baseUrl })`,
`vercelBlobStorage({ ... })`). Adds the `lazyRepository` connection-memoization
primitive to the server, extracts `InMemoryRepository` into the new
`@airnauts/comments-adapter-memory` package (it is no longer exported from
`@airnauts/comments-server`), adds a `baseUrl` option to the filesystem storage, and
adds the new `@airnauts/comments-next` package with `createCommentsRoute`.
