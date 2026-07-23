---
"@airnauts/airside-core": patch
"@airnauts/airside-server": patch
"@airnauts/airside-integration-next": patch
"@airnauts/airside-adapter-memory": patch
"@airnauts/airside-storage-fs": patch
"@airnauts/airside-storage-vercel-blob": patch
---

Docs: README updated to document previously undocumented public exports — `ANCHOR_SCHEMA_VERSION`, `UploadForm`, `ThreadView`, `ThreadListItemView`, `unresolvedCountOf` in core; `readBody` and `NodeRequestLike` in the server `./node` subpath; `createNextHandler`, `createNextPagesHandler`, `NodePagesHandler`, `NodePagesRequest` in the Next.js integration; and factory aliases `memoryRepository`, `fileSystemStorage`, `vercelBlobStorage`. Also corrects the `ThreadListResponse` description to reflect `ThreadListItemView[]`.
