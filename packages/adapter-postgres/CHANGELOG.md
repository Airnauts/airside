# @airnauts/comments-adapter-postgres

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
