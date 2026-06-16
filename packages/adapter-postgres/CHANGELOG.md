# @airnauts/airside-adapter-postgres

## 0.8.1

### Patch Changes

- 4404855: Add the Airside logo and "Embeddable Commenting Tool" tagline as a centered, dark/light-aware header to the package README.
- Updated dependencies [4404855]
  - @airnauts/airside-core@0.8.1
  - @airnauts/airside-server@0.8.1

## 0.8.0

### Minor Changes

- Rebrand: the package family is now published as `@airnauts/airside-*` (Airside). This is a breaking change — update your imports and: the React prop `airsideKey` (was `commentsKey`), URL params `?airside-key` / `?airside-thread`, the `x-airside-key` request header, `AIRSIDE_*` env vars, and (if you target the widget DOM) the `air:` CSS class prefix and `data-airside-*` attributes. The Slack/email/Jira integrations are now `@airnauts/airside-extension-{slack,email,jira}`. The former `@airnauts/comments-*` packages are deprecated with a pointer to their replacements.

### Patch Changes

- Updated dependencies
- Updated dependencies [402b2c4]
  - @airnauts/airside-core@0.8.0
  - @airnauts/airside-server@0.8.0

## 0.7.0

### Patch Changes

- @airnauts/comments-server@0.7.0
- @airnauts/comments-core@0.7.0

## 0.6.0

### Minor Changes

- d9ce5a3: Persist a thread's `externalLinks` (e.g. a linked Jira issue) so they survive reads.
- 23a4f49: Add `@airnauts/comments-adapter-postgres`: a PostgreSQL repository adapter that's a drop-in alternative to the MongoDB adapter. Driver-agnostic — pass any `pg`/Neon/PGlite executor to `createPostgresRepository`, or use the lazy `postgresRepository({ connectionString })` convenience.

### Patch Changes

- 79fe6ba: Thread `unresolvedCount` is now computed via core's shared `unresolvedCountOf`
  policy instead of per-adapter copies. Stored data and query results are unchanged.
- e9cc0e9: Docs: README updated to match the current public API.
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
