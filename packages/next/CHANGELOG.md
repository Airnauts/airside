# @airnauts/airside-next

## 0.8.0

### Minor Changes

- Rebrand: the package family is now published as `@airnauts/airside-*` (Airside). This is a breaking change — update your imports and: the React prop `airsideKey` (was `commentsKey`), URL params `?airside-key` / `?airside-thread`, the `x-airside-key` request header, `AIRSIDE_*` env vars, and (if you target the widget DOM) the `air:` CSS class prefix and `data-airside-*` attributes. The Slack/email/Jira integrations are now `@airnauts/airside-extension-{slack,email,jira}`. The former `@airnauts/comments-*` packages are deprecated with a pointer to their replacements.

### Patch Changes

- Updated dependencies
  - @airnauts/airside-server@0.8.0

## 0.7.0

### Patch Changes

- @airnauts/comments-server@0.7.0

## 0.6.0

### Minor Changes

- cbf6378: Add first-class Next.js Pages Router support and unify the Next integration. `@airnauts/comments-next` now exports `createCommentsAppRoute` (App Router) and `createCommentsPagesRoute` (Pages Router); the old `createCommentsRoute` is renamed to `createCommentsAppRoute`. All Next.js glue moves into `@airnauts/comments-next`: `@airnauts/comments-server` drops the `@airnauts/comments-server/next` subpath and adds `@airnauts/comments-server/node`, a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any Node server.

  BREAKING: `createCommentsRoute` → `createCommentsAppRoute`; `@airnauts/comments-server/next` (`createNextHandler`) moves to `@airnauts/comments-next`.

### Patch Changes

- e9cc0e9: Docs: README updated to match the current public API.
- Updated dependencies [cbf6378]
- Updated dependencies [e9cc0e9]
- Updated dependencies [bf41997]
- Updated dependencies [0292473]
- Updated dependencies [79fe6ba]
- Updated dependencies [3f4bcb1]
  - @airnauts/comments-server@0.6.0

## 0.5.1

### Patch Changes

- @airnauts/comments-server@0.5.1

## 0.5.0

### Patch Changes

- @airnauts/comments-server@0.5.0

## 0.4.0

### Minor Changes

- All `@airnauts/comments-*` packages now share a single, synchronized version line
  (starting at 0.4.0) and are released together. Adopters can pin one version across
  the whole set instead of reconciling per-package versions.

### Patch Changes

- Updated dependencies
  - @airnauts/comments-server@0.4.0

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
