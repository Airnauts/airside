---
'@airnauts/comments-adapter-postgres': minor
---

Add `@airnauts/comments-adapter-postgres`: a PostgreSQL repository adapter that's a drop-in alternative to the MongoDB adapter. Driver-agnostic — pass any `pg`/Neon/PGlite executor to `createPostgresRepository`, or use the lazy `postgresRepository({ connectionString })` convenience.
