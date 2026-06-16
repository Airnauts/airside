import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ensureSchema } from './schema'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await ensureSchema(db)
})

afterAll(async () => {
  await db?.close()
})

it('creates the threads and attachments tables', async () => {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('airside_threads', 'airside_attachments')
     ORDER BY table_name`,
  )
  expect(rows.map((r) => r.table_name)).toEqual(['airside_attachments', 'airside_threads'])
})

it('creates the list index used for keyset pagination', async () => {
  const { rows } = await db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'airside_threads' AND indexname = 'airside_threads_list'`,
  )
  expect(rows).toHaveLength(1)
})

it('is idempotent — running twice does not throw', async () => {
  await ensureSchema(db)
  await ensureSchema(db)
})
