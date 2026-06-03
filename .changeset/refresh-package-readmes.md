---
"@airnauts/comments-server": patch
"@airnauts/comments-next": patch
"@airnauts/comments-adapter-memory": patch
"@airnauts/comments-adapter-mongo": patch
"@airnauts/comments-storage-fs": patch
"@airnauts/comments-storage-vercel-blob": patch
---

Update package READMEs to match the current API. The server example no longer
references the removed `InMemoryRepository` (use `memoryRepository()` from
`@airnauts/comments-adapter-memory`), the Vercel Blob example passes the token
explicitly via `vercelBlobStorage({ token })` instead of an ambient env read, the
filesystem and Mongo adapters document their `fileSystemStorage()` / `mongoRepository()`
factories, and the Next.js example is now self-contained.
