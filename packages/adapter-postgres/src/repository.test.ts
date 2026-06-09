import { repositoryContract } from '@airnauts/comments-test-support'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll } from 'vitest'
import { createPostgresRepository, ensureSchema } from './index'
import type { SqlExecutor } from './schema'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await ensureSchema(db)
})

afterAll(async () => {
  await db?.close()
})

// The contract suite calls makeRepo in beforeEach and registers no afterEach,
// so isolation lives here: truncate the shared tables before each test.
repositoryContract('postgres', async () => {
  await db.query('TRUNCATE comments_threads, comments_attachments')
  return createPostgresRepository({ sql: db as unknown as SqlExecutor })
})
