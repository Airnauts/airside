import type {
  Attachment,
  AttachmentId,
  Comment,
  ExternalLink,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/comments-core'
import { unresolvedCountOf } from '@airnauts/comments-core'
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
import { type Db, type Filter, MongoClient, type UpdateFilter } from 'mongodb'
import { ensureIndexes } from './indexes'

export const COLLECTION = 'threads'
export const ATTACHMENTS_COLLECTION = 'attachments'

/** Stored shape: the wire Thread (minus its `id`) keyed by `_id`, plus server-only scope. */
type StoredThread = Omit<Thread, 'id'> & {
  _id: string
  projectId: string
  env: string | null
}

/** Stored shape: the wire Attachment (minus its `id`) keyed by `_id`, plus server-only scope. */
type StoredAttachment = Omit<Attachment, 'id'> & {
  _id: string
  projectId: string
  env: string | null
}

function toAttachment(doc: StoredAttachment): Attachment {
  const { _id, projectId: _p, env: _e, ...rest } = doc
  return { id: _id as AttachmentId, ...rest }
}

function scopeFilter(scope: Scope): { projectId: string; env: string | null } {
  return { projectId: scope.projectId, env: scope.env ?? null }
}

function toThread(doc: StoredThread): Thread {
  const { _id, projectId: _p, env: _e, ...rest } = doc
  return { id: _id as ThreadId, ...rest }
}

function toListItem(doc: StoredThread): ThreadListItem {
  // The list projection slices comments to just the first (root); updateAnchor returns the
  // full doc. Either way comments[0] is the root. Strip the rest of the thread-only payload.
  const root = doc.comments?.[0]
  const {
    _id,
    projectId: _p,
    env: _e,
    comments: _c,
    captureContext: _cc,
    provenance: _pr,
    ...rest
  } = doc
  return {
    id: _id as ThreadId,
    ...rest,
    rootComment: root ? { text: root.text, createdAt: root.createdAt } : null,
  }
}

export function createMongoRepository({ db }: { db: Db }): Repository {
  const col = db.collection<StoredThread>(COLLECTION)
  const attachmentsCol = db.collection<StoredAttachment>(ATTACHMENTS_COLLECTION)

  return {
    async createThread(input: NewThread): Promise<Thread> {
      const doc: StoredThread = {
        _id: input.id,
        projectId: input.projectId,
        env: input.env ?? null,
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
      await col.insertOne(doc)
      return toThread(doc)
    },

    async getThread(scope: Scope, id: ThreadId): Promise<Thread | null> {
      const doc = await col.findOne({ _id: id, ...scopeFilter(scope) })
      return doc ? toThread(doc) : null
    },

    async listThreads(query: ListQuery): Promise<ListResult> {
      const limit = Math.max(1, Math.min(query.limit, 200))
      const filter: Record<string, unknown> = scopeFilter(query)
      if (query.pageKey !== undefined) filter.pageKey = query.pageKey
      if (query.status !== undefined) filter.status = query.status
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
      if (cursor) {
        filter.$or = [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
        ]
      }
      const docs = await col
        .find(filter as Filter<StoredThread>, {
          projection: { comments: { $slice: 1 }, captureContext: 0, provenance: 0 },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray()
      const more = docs.length > limit
      const page = more ? docs.slice(0, limit) : docs
      const last = page[page.length - 1]
      const nextCursor =
        more && last ? encodeCursor({ updatedAt: last.updatedAt, id: last._id }) : null
      return { threads: page.map((d) => toListItem(d as StoredThread)), nextCursor }
    },

    async addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<Comment> {
      // unresolvedCount is intentionally untouched: it tracks `status` only, and
      // addComment never changes status. Do NOT add a spurious $inc here.
      const res = await col.updateOne(
        { _id: threadId, ...scopeFilter(scope) },
        {
          $push: { comments: comment },
          $inc: { commentCount: 1 },
          $set: { updatedAt: comment.createdAt, lastActivityAt: comment.createdAt },
        },
      )
      if (res.matchedCount === 0) throw new Error('thread not found')
      return comment
    },

    async setStatus(
      scope: Scope,
      threadId: ThreadId,
      status: ThreadStatus,
      now: string,
    ): Promise<Thread> {
      const doc = await col.findOneAndUpdate(
        { _id: threadId, ...scopeFilter(scope) },
        {
          $set: {
            status,
            updatedAt: now,
            lastActivityAt: now,
            unresolvedCount: unresolvedCountOf(status),
          },
        },
        { returnDocument: 'after' },
      )
      if (!doc) throw new Error('thread not found')
      return toThread(doc)
    },

    async updateAnchor(
      scope: Scope,
      threadId: ThreadId,
      patch: AnchorPatch,
      now: string,
    ): Promise<ThreadListItem> {
      const set: Record<string, unknown> = {
        anchorState: patch.anchorState,
        updatedAt: now,
        lastActivityAt: now,
      }
      if (patch.selectors !== undefined) set['anchor.selectors'] = patch.selectors
      if (patch.signals !== undefined) set['anchor.signals'] = patch.signals
      if (patch.selectionLost !== undefined) set.selectionLost = patch.selectionLost
      const doc = await col.findOneAndUpdate(
        { _id: threadId, ...scopeFilter(scope) },
        { $set: set } as UpdateFilter<StoredThread>,
        { returnDocument: 'after' },
      )
      if (!doc) throw new Error('thread not found')
      return toListItem(doc)
    },

    async putAttachment(scope: Scope, attachment: Attachment): Promise<void> {
      const { id, ...rest } = attachment
      const doc: StoredAttachment = { _id: id, ...scopeFilter(scope), ...rest }
      await attachmentsCol.replaceOne({ _id: id }, doc, { upsert: true })
    },

    async getAttachments(scope: Scope, ids: AttachmentId[]): Promise<Attachment[]> {
      if (ids.length === 0) return []
      const docs = await attachmentsCol
        .find({ _id: { $in: ids as unknown as string[] }, ...scopeFilter(scope) })
        .toArray()
      return docs.map((d) => toAttachment(d as StoredAttachment))
    },

    async upsertExternalLink(
      scope: Scope,
      threadId: ThreadId,
      link: ExternalLink,
      now: string,
    ): Promise<Thread> {
      const filter = { _id: threadId, ...scopeFilter(scope) }
      // Two-step: Mongo can't $pull and $push the same array in one update.
      // Acceptable for v1 (one link per provider); not atomic across the two ops.
      const pulled = await col.updateOne(filter, {
        $pull: { externalLinks: { provider: link.provider } },
      } as UpdateFilter<StoredThread>)
      if (pulled.matchedCount === 0) throw new Error('thread not found')
      const doc = await col.findOneAndUpdate(
        filter,
        {
          $push: { externalLinks: link },
          $set: { updatedAt: now, lastActivityAt: now },
        } as UpdateFilter<StoredThread>,
        { returnDocument: 'after' },
      )
      if (!doc) throw new Error('thread not found')
      return toThread(doc)
    },
  }
}

/** Open one client, connect, ensure indexes, and build the repository. */
async function connectMongo(uri: string): Promise<Repository> {
  const client = new MongoClient(uri)
  try {
    await client.connect() // intentionally left open for the process lifetime on success
  } catch (err) {
    await client.close().catch(() => {}) // best-effort cleanup; swallow secondary errors
    throw err
  }
  const db = client.db() // database name comes from the connection string
  await ensureIndexes(db)
  return createMongoRepository({ db })
}

/**
 * Host-facing Mongo `Repository`: connects lazily on first use and memoizes the
 * connection (warm serverless / HMR reuse) under `cacheKey`. The single function
 * a host imports — `createMongoRepository`/`ensureIndexes` remain for callers
 * that own their own connection.
 *
 * `cacheKey` defaults to `'mongo'`. If you connect to more than one database in the
 * same process, pass a distinct `cacheKey` per connection — otherwise the second
 * call reuses the first connection under the shared default key.
 */
export function mongoRepository({
  uri,
  cacheKey = 'mongo',
}: {
  uri: string
  cacheKey?: string
}): Repository {
  return lazyRepository(() => connectMongo(uri), { cacheKey })
}
