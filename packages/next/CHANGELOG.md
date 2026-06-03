# @airnauts/comments-next

## 0.2.0

### Minor Changes

- 2af3552: Add a `disabled?: boolean` flag to `createCommentsRoute`. When set, every handler
  (`GET`/`POST`/`PATCH`/`OPTIONS`) returns `404` and no server is constructed — for keeping
  the route mounted but dormant when a backend is unconfigured.

  BREAKING: the returned `server` is now optional (`server?: CommentsServer`) — it is
  `undefined` on the disabled path. Consumers reading `route.server` must narrow it.

## 0.1.0

### Minor Changes

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
  - @airnauts/comments-server@0.1.0
