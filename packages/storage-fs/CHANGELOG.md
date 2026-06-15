# @airnauts/comments-storage-fs

## 0.7.0

### Minor Changes

- d8990ae: Unify the adapter and extension factory names onto a single `create…`/`…Extension`
  convention. Storage factories are now `createFileSystemStorage` and
  `createVercelBlobStorage`; the in-memory repository factory is `createMemoryRepository`;
  and the notification/integration extension factories are `slackExtension`,
  `emailExtension`, and `jiraExtension` (with matching `SlackExtensionOptions`,
  `EmailExtensionOptions`, and `JiraExtensionOptions` types).

  The previous names (`fileSystemStorage`, `vercelBlobStorage`, `memoryRepository`,
  `slackNotifications`, `emailNotifications`, `jiraIssues`, and the old `*NotifierOptions` /
  `JiraIssuesOptions` types) remain exported as deprecated aliases for one release — update
  imports to the new names before the next minor.

### Patch Changes

- @airnauts/comments-server@0.7.0
- @airnauts/comments-core@0.7.0

## 0.6.0

### Patch Changes

- e9cc0e9: Docs: README updated to match the current public API.
- 79fe6ba: `@airnauts/comments-server` now exports the storage helpers `sanitizeName` and
  `readAllBytes` for use when building a custom `StorageAdapter`; the filesystem and
  Vercel Blob adapters consume them instead of private copies. No behavior change.
- Updated dependencies [3f4bcb1]
- Updated dependencies [bf41997]
- Updated dependencies [79fe6ba]
- Updated dependencies [54bbab0]
- Updated dependencies [cbf6378]
- Updated dependencies [e9cc0e9]
- Updated dependencies [bf41997]
- Updated dependencies [0292473]
- Updated dependencies [79fe6ba]
- Updated dependencies [3f4bcb1]
  - @airnauts/comments-core@0.6.0
  - @airnauts/comments-server@0.6.0

## 0.5.1

### Patch Changes

- @airnauts/comments-core@0.5.1
- @airnauts/comments-server@0.5.1

## 0.5.0

### Patch Changes

- @airnauts/comments-core@0.5.0
- @airnauts/comments-server@0.5.0

## 0.4.0

### Minor Changes

- All `@airnauts/comments-*` packages now share a single, synchronized version line
  (starting at 0.4.0) and are released together. Adopters can pin one version across
  the whole set instead of reconciling per-package versions.

### Patch Changes

- Updated dependencies
  - @airnauts/comments-core@0.4.0
  - @airnauts/comments-server@0.4.0

## 0.1.1

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
  - @airnauts/comments-core@0.2.0

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
