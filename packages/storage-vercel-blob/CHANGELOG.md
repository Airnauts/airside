# @airnauts/comments-storage-vercel-blob

## 0.2.0

### Minor Changes

- 2af3552: BREAKING: `vercelBlobStorage` now requires an explicit `token`. The previous ambient read
  of `BLOB_READ_WRITE_TOKEN` from `process.env` is gone — pass the value in, the same way as
  `mongoRepository({ uri })`. `vercelBlobStorage()` and `new VercelBlobStorage()` with no
  token no longer typecheck.

## 0.1.0

### Minor Changes

- 8f30bb1: Initial public release of the Airnauts embeddable commenting tool.
- initial release
- 8cf5ff7: Uniform adapter construction: every repository/storage adapter now exposes a factory
  function (`memoryRepository()`, `mongoRepository({ uri })`, `fileSystemStorage({ rootDir, baseUrl })`,
  `vercelBlobStorage({ ... })`). Adds the `lazyRepository` connection-memoization
  primitive to the server, extracts `InMemoryRepository` into the new
  `@airnauts/comments-adapter-memory` package (it is no longer exported from
  `@airnauts/comments-server`), adds a `baseUrl` option to the filesystem storage, and
  adds the new `@airnauts/comments-next` package with `createCommentsRoute`.

### Patch Changes

- Updated dependencies [8f30bb1]
- Updated dependencies
- Updated dependencies [8cf5ff7]
  - @airnauts/comments-core@0.1.0
  - @airnauts/comments-server@0.1.0
