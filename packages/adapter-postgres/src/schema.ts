/**
 * Minimal connection seam — the shape that `pg.Pool`, PGlite, and Neon's `Pool`
 * all satisfy. The adapter never owns the connection; the host supplies one.
 * (Neon's pure-HTTP tagged-template form does NOT satisfy this — use Neon's Pool.)
 */
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export const THREADS_TABLE = 'comments_threads'
export const ATTACHMENTS_TABLE = 'comments_attachments'

// Idempotent DDL (CREATE … IF NOT EXISTS). `updated_at` is text holding the exact
// ISO string so keyset comparison stays byte-for-byte consistent with the cursor;
// `env` is NOT NULL DEFAULT '' so absent env is plain equality, never SQL NULL.
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS comments_threads (
     id          text PRIMARY KEY,
     project_id  text NOT NULL,
     env         text NOT NULL DEFAULT '',
     page_key    text,
     status      text NOT NULL,
     updated_at  text NOT NULL,
     doc         jsonb NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS comments_threads_list
     ON comments_threads (project_id, env, updated_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS comments_attachments (
     id          text PRIMARY KEY,
     project_id  text NOT NULL,
     env         text NOT NULL DEFAULT '',
     doc         jsonb NOT NULL
   )`,
]

/** Create the tables + index. Idempotent: safe to run on every startup. */
export async function ensureSchema(sql: SqlExecutor): Promise<void> {
  for (const stmt of DDL) {
    await sql.query(stmt)
  }
}
