---
"@airnauts/comments-server": patch
"@airnauts/comments-storage-fs": patch
"@airnauts/comments-storage-vercel-blob": patch
---

`@airnauts/comments-server` now exports the storage helpers `sanitizeName` and
`readAllBytes` for use when building a custom `StorageAdapter`; the filesystem and
Vercel Blob adapters consume them instead of private copies. No behavior change.
