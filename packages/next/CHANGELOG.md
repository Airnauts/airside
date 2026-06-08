# @airnauts/comments-next

## 0.3.0

### Minor Changes

- ab680eb: Thread list items now include a `rootComment` preview (the first comment's text and
  timestamp), so list UIs can show what a thread is about without fetching the full thread.

### Patch Changes

- cd42711: Update package READMEs to match the current API. The server example no longer
  references the removed `InMemoryRepository` (use `memoryRepository()` from
  `@airnauts/comments-adapter-memory`), the Vercel Blob example passes the token
  explicitly via `vercelBlobStorage({ token })` instead of an ambient env read, the
  filesystem and Mongo adapters document their `fileSystemStorage()` / `mongoRepository()`
  factories, and the Next.js example is now self-contained.
- Updated dependencies [cd42711]
- Updated dependencies [ab680eb]
- Updated dependencies [5cf77fd]
  - @airnauts/comments-server@0.2.0

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
