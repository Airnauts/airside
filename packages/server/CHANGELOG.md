# @airnauts/comments-server

## 0.5.1

### Patch Changes

- @airnauts/comments-core@0.5.1

## 0.5.0

### Patch Changes

- @airnauts/comments-core@0.5.0

## 0.4.0

### Minor Changes

- All `@airnauts/comments-*` packages now share a single, synchronized version line
  (starting at 0.4.0) and are released together. Adopters can pin one version across
  the whole set instead of reconciling per-package versions.

### Patch Changes

- Updated dependencies
  - @airnauts/comments-core@0.4.0

## 0.2.0

### Minor Changes

- ab680eb: Thread list items now include a `rootComment` preview (the first comment's text and
  timestamp), so list UIs can show what a thread is about without fetching the full thread.
- 5cf77fd: Add Slack notifications. The server now accepts `notifiers: [...]`, a generic outbound
  channel seam, and the new `@airnauts/comments-notifier-slack` package posts a message to a
  Slack channel (via an Incoming Webhook) whenever a reviewer creates a thread or replies —
  showing who commented, the text, and a link to the page. Notification failures never break
  a comment write.

### Patch Changes

- cd42711: Update package READMEs to match the current API. The server example no longer
  references the removed `InMemoryRepository` (use `memoryRepository()` from
  `@airnauts/comments-adapter-memory`), the Vercel Blob example passes the token
  explicitly via `vercelBlobStorage({ token })` instead of an ambient env read, the
  filesystem and Mongo adapters document their `fileSystemStorage()` / `mongoRepository()`
  factories, and the Next.js example is now self-contained.
- Updated dependencies [ab680eb]
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
  - @airnauts/comments-core@0.1.0
