import type {
  Attachment,
  AttachmentId,
  Comment,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/comments-core'
import {
  type AnchorPatch,
  decodeCursor,
  encodeCursor,
  type ListQuery,
  type ListResult,
  lazyRepository,
  type NewComment,
  type NewThread,
  type Repository,
  type Scope,
} from '@airnauts/comments-server'
import { ensureSchema, type SqlExecutor } from './schema'

/** Absent env is stored/queried as '' (never SQL NULL) so equality stays simple. */
function scopeEnv(scope: Scope): string {
  return scope.env ?? ''
}

function unresolvedCountOf(status: ThreadStatus): number {
  return status === 'open' ? 1 : 0
}

/** The Thread without the heavy fields the list projection drops. */
type ThreadBaseRow = Omit<Thread, 'comments' | 'captureContext' | 'provenance'>

function toListItem(base: ThreadBaseRow, root: Comment | null | undefined): ThreadListItem {
  return {
    ...base,
    rootComment: root ? { text: root.text, createdAt: root.createdAt } : null,
  }
}

export function createPostgresRepository({ sql }: { sql: SqlExecutor }): Repository {
  return {
    async createThread(input: NewThread): Promise<Thread> {
      // doc is the full wire Thread (incl. id). project_id/env are server-only scope columns.
      const thread: Thread = {
        id: input.id,
        scope: input.scope,
        pageKey: input.pageKey,
        pageUrl: input.pageUrl,
        ...(input.pageTitle !== undefined ? { pageTitle: input.pageTitle } : {}),
        anchor: input.anchor,
        status: input.status,
        anchorState: input.anchorState,
        ...(input.selectionLost !== undefined ? { selectionLost: input.selectionLost } : {}),
        commentCount: 1,
        unresolvedCount: unresolvedCountOf(input.status),
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        lastActivityAt: input.lastActivityAt,
        schemaVersion: input.schemaVersion,
        comments: [input.firstComment],
        captureContext: input.captureContext,
        ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
      }
      await sql.query(
        `INSERT INTO comments_threads (id, project_id, env, page_key, status, updated_at, doc)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          input.id,
          input.projectId,
          scopeEnv(input),
          input.pageKey,
          input.status,
          input.updatedAt,
          JSON.stringify(thread),
        ],
      )
      return thread
    },

    async getThread(scope: Scope, id: ThreadId): Promise<Thread | null> {
      const { rows } = (await sql.query(
        `SELECT doc FROM comments_threads WHERE id = $1 AND project_id = $2 AND env = $3`,
        [id, scope.projectId, scopeEnv(scope)],
      )) as { rows: Array<{ doc: Thread }> }
      const row = rows[0]
      return row ? row.doc : null
    },

    async listThreads(query: ListQuery): Promise<ListResult> {
      const limit = Math.max(1, Math.min(query.limit, 200))
      const where: string[] = ['project_id = $1', 'env = $2']
      const params: unknown[] = [query.projectId, scopeEnv(query)]
      if (query.pageKey !== undefined) {
        params.push(query.pageKey)
        where.push(`page_key = $${params.length}`)
      }
      if (query.status !== undefined) {
        params.push(query.status)
        where.push(`status = $${params.length}`)
      }
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
      if (cursor) {
        params.push(cursor.updatedAt, cursor.id)
        where.push(`(updated_at, id) < ($${params.length - 1}, $${params.length})`)
      }
      params.push(limit + 1)
      const { rows } = (await sql.query(
        `SELECT doc - 'comments' - 'captureContext' - 'provenance' AS base,
                doc->'comments'->0 AS root
         FROM comments_threads
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC, id DESC
         LIMIT $${params.length}`,
        params,
      )) as { rows: Array<{ base: ThreadBaseRow; root: Comment | null }> }
      const more = rows.length > limit
      const page = more ? rows.slice(0, limit) : rows
      const threads = page.map((r) => toListItem(r.base, r.root))
      const last = page[page.length - 1]
      const nextCursor =
        more && last ? encodeCursor({ updatedAt: last.base.updatedAt, id: last.base.id }) : null
      return { threads, nextCursor }
    },

    async addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<Comment> {
      // unresolvedCount is intentionally untouched: it tracks `status` only, and
      // addComment never changes status. Single statement => atomic without a txn.
      const { rows } = (await sql.query(
        `UPDATE comments_threads
         SET doc = jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(doc, '{comments}', (doc->'comments') || $4::jsonb),
                         '{commentCount}', to_jsonb(COALESCE((doc->>'commentCount')::int, 0) + 1)
                       ),
                       '{updatedAt}', to_jsonb($5::text)
                     ),
                     '{lastActivityAt}', to_jsonb($5::text)
                   ),
             updated_at = $5
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING id`,
        [threadId, scope.projectId, scopeEnv(scope), JSON.stringify(comment), comment.createdAt],
      )) as { rows: Array<{ id: string }> }
      if (rows.length === 0) throw new Error('thread not found')
      return comment
    },

    async setStatus(
      scope: Scope,
      threadId: ThreadId,
      status: ThreadStatus,
      now: string,
    ): Promise<Thread> {
      const { rows } = (await sql.query(
        `UPDATE comments_threads
         SET status = $4,
             updated_at = $5,
             doc = jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(doc, '{status}', to_jsonb($4::text)),
                         '{updatedAt}', to_jsonb($5::text)
                       ),
                       '{lastActivityAt}', to_jsonb($5::text)
                     ),
                     '{unresolvedCount}', to_jsonb($6::int)
                   )
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING doc`,
        [threadId, scope.projectId, scopeEnv(scope), status, now, unresolvedCountOf(status)],
      )) as { rows: Array<{ doc: Thread }> }
      const row = rows[0]
      if (!row) throw new Error('thread not found')
      return row.doc
    },

    async updateAnchor(
      scope: Scope,
      threadId: ThreadId,
      patch: AnchorPatch,
      now: string,
    ): Promise<ThreadListItem> {
      // Always set anchorState + timestamps; conditionally set the patched anchor fields.
      const sets: string[] = [
        `'{anchorState}', to_jsonb($4::text)`,
        `'{updatedAt}', to_jsonb($5::text)`,
        `'{lastActivityAt}', to_jsonb($5::text)`,
      ]
      const params: unknown[] = [threadId, scope.projectId, scopeEnv(scope), patch.anchorState, now]
      if (patch.selectors !== undefined) {
        params.push(JSON.stringify(patch.selectors))
        sets.push(`'{anchor,selectors}', $${params.length}::jsonb`)
      }
      if (patch.signals !== undefined) {
        params.push(JSON.stringify(patch.signals))
        sets.push(`'{anchor,signals}', $${params.length}::jsonb`)
      }
      if (patch.selectionLost !== undefined) {
        params.push(patch.selectionLost)
        sets.push(`'{selectionLost}', to_jsonb($${params.length}::boolean)`)
      }
      // Each iteration wraps the previous expression; later entries in `sets` are
      // outermost and win if two paths overlap.
      let docExpr = 'doc'
      for (const s of sets) docExpr = `jsonb_set(${docExpr}, ${s})`
      const { rows } = (await sql.query(
        `UPDATE comments_threads
         SET doc = ${docExpr}, updated_at = $5
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING doc - 'comments' - 'captureContext' - 'provenance' AS base,
                   doc->'comments'->0 AS root`,
        params,
      )) as { rows: Array<{ base: ThreadBaseRow; root: Comment | null }> }
      const row = rows[0]
      if (!row) throw new Error('thread not found')
      return toListItem(row.base, row.root)
    },

    async putAttachment(scope: Scope, attachment: Attachment): Promise<void> {
      await sql.query(
        `INSERT INTO comments_attachments (id, project_id, env, doc)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
                                        env = EXCLUDED.env,
                                        doc = EXCLUDED.doc`,
        [attachment.id, scope.projectId, scopeEnv(scope), JSON.stringify(attachment)],
      )
    },

    async getAttachments(scope: Scope, ids: AttachmentId[]): Promise<Attachment[]> {
      if (ids.length === 0) return []
      // Build an IN-list (portable across pg/PGlite — avoids array-param binding quirks).
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
      const params: unknown[] = [...ids, scope.projectId, scopeEnv(scope)]
      const { rows } = (await sql.query(
        `SELECT doc FROM comments_attachments
         WHERE id IN (${placeholders})
           AND project_id = $${ids.length + 1}
           AND env = $${ids.length + 2}`,
        params,
      )) as { rows: Array<{ doc: Attachment }> }
      return rows.map((r) => r.doc)
    },
  }
}

/** Open a `pg` Pool, ensure the schema, and build the repository. */
async function connectPostgres(connectionString: string): Promise<Repository> {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString }) // intentionally left open for the process lifetime
  await ensureSchema(pool as unknown as SqlExecutor)
  return createPostgresRepository({ sql: pool as unknown as SqlExecutor })
}

/**
 * Host-facing Postgres `Repository`: lazily opens a `pg` Pool on first use and
 * memoizes it under `cacheKey` (warm serverless / HMR reuse). Use this when you
 * want the adapter to own the connection; `createPostgresRepository` remains for
 * callers that supply their own executor (Neon Pool, Supabase/PgBouncer pool).
 *
 * `cacheKey` defaults to `'postgres'`. Pass a distinct key per database if you
 * connect to more than one in the same process.
 */
export function postgresRepository({
  connectionString,
  cacheKey = 'postgres',
}: {
  connectionString: string
  cacheKey?: string
}): Repository {
  return lazyRepository(() => connectPostgres(connectionString), { cacheKey })
}
