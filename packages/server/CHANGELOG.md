# @airnauts/comments-server

## 0.7.0

### Patch Changes

- @airnauts/comments-core@0.7.0

## 0.6.0

### Minor Changes

- cbf6378: Add first-class Next.js Pages Router support and unify the Next integration. `@airnauts/comments-next` now exports `createCommentsAppRoute` (App Router) and `createCommentsPagesRoute` (Pages Router); the old `createCommentsRoute` is renamed to `createCommentsAppRoute`. All Next.js glue moves into `@airnauts/comments-next`: `@airnauts/comments-server` drops the `@airnauts/comments-server/next` subpath and adds `@airnauts/comments-server/node`, a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any Node server.

  BREAKING: `createCommentsRoute` → `createCommentsAppRoute`; `@airnauts/comments-server/next` (`createNextHandler`) moves to `@airnauts/comments-next`.

- bf41997: New `extensions` option on `createCommentsServer` wires both notification channels and thread
  actions through one list (each factory returns an array, so spread them:
  `extensions: [...slackNotifications({ … })]`). Adds `POST /threads/:id/actions/:actionId` to run a
  registered thread action, which can persist an external link back on the thread. The old
  `notifiers` option still works but is now **deprecated** — prefer `extensions`.
- 3f4bcb1: Notification events now carry a ready-made `threadUrl` deep-link, built by the server from a new
  optional `threadParam` option on `createCommentsServer` (defaults to `comments-thread`). Notifiers
  no longer build the link themselves. Events also carry `participants` — the thread's other active
  commenters (excluding the event's author) — so per-recipient channels like email don't re-walk the
  thread.

### Patch Changes

- e9cc0e9: Docs: README updated to match the current public API.
- 0292473: Docs: correct `Repository` interface method names in README (`setStatus`, `updateAnchor`, `putAttachment`, `getAttachments`, `upsertExternalLink`).
- 79fe6ba: `@airnauts/comments-server` now exports the storage helpers `sanitizeName` and
  `readAllBytes` for use when building a custom `StorageAdapter`; the filesystem and
  Vercel Blob adapters consume them instead of private copies. No behavior change.
- Updated dependencies [3f4bcb1]
- Updated dependencies [bf41997]
- Updated dependencies [79fe6ba]
- Updated dependencies [54bbab0]
- Updated dependencies [e9cc0e9]
  - @airnauts/comments-core@0.6.0

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
