---
"@airnauts/comments-storage-vercel-blob": minor
---

BREAKING: `vercelBlobStorage` now requires an explicit `token`. The previous ambient read
of `BLOB_READ_WRITE_TOKEN` from `process.env` is gone — pass the value in, the same way as
`mongoRepository({ uri })`. `vercelBlobStorage()` and `new VercelBlobStorage()` with no
token no longer typecheck.
