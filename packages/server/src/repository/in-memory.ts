import type { Thread, ThreadId, ThreadListItem, ThreadStatus } from '@airnauts/comments-core'
import { decodeCursor, encodeCursor } from '../cursor'
import type {
  AnchorPatch,
  ListQuery,
  ListResult,
  NewComment,
  NewThread,
  Repository,
  Scope,
} from './types'

type StoredThread = Thread & { projectId: string; env?: string }

function clone<T>(value: T): T {
  return structuredClone(value)
}

function toListItem(t: StoredThread): ThreadListItem {
  // Strip server-only scope + thread-only payload (comments/captureContext/provenance).
  const {
    comments: _c,
    captureContext: _cc,
    provenance: _p,
    projectId: _pid,
    env: _env,
    ...rest
  } = t as StoredThread & Record<string, unknown>
  return rest as ThreadListItem
}

function toThread(t: StoredThread): Thread {
  const { projectId: _pid, env: _env, ...wire } = t as StoredThread & Record<string, unknown>
  return wire as Thread
}

function matchesScope(t: StoredThread, scope: Scope): boolean {
  if (t.projectId !== scope.projectId) return false
  return (t.env ?? undefined) === (scope.env ?? undefined)
}

function unresolvedCountOf(thread: StoredThread): number {
  return thread.status === 'open' ? 1 : 0
}

function recomputeCounts(thread: StoredThread): StoredThread {
  return {
    ...thread,
    commentCount: thread.comments.length,
    unresolvedCount: unresolvedCountOf(thread),
  }
}

export class InMemoryRepository implements Repository {
  private threads = new Map<string, StoredThread>()

  async createThread(input: NewThread): Promise<Thread> {
    const stored: StoredThread = recomputeCounts({
      projectId: input.projectId,
      env: input.env,
      id: input.id,
      scope: input.scope,
      pageKey: input.pageKey,
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      anchor: clone(input.anchor),
      status: input.status,
      anchorState: input.anchorState,
      selectionLost: input.selectionLost,
      captureContext: clone(input.captureContext),
      provenance: input.provenance ? clone(input.provenance) : undefined,
      createdBy: clone(input.createdBy),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      lastActivityAt: input.lastActivityAt,
      schemaVersion: input.schemaVersion,
      commentCount: 0, // placeholder, overwritten by recomputeCounts
      unresolvedCount: 0, // placeholder, overwritten by recomputeCounts
      comments: [clone(input.firstComment)],
    })
    this.threads.set(input.id, stored)
    return toThread(clone(stored))
  }

  async getThread(scope: Scope, id: ThreadId): Promise<Thread | null> {
    const t = this.threads.get(id)
    if (!t || !matchesScope(t, scope)) return null
    return toThread(clone(t))
  }

  async listThreads(query: ListQuery): Promise<ListResult> {
    const limit = Math.max(1, Math.min(query.limit, 200))
    const filtered: StoredThread[] = []
    for (const t of this.threads.values()) {
      if (!matchesScope(t, query)) continue
      if (query.pageKey !== undefined && t.pageKey !== query.pageKey) continue
      if (query.status !== undefined && t.status !== query.status) continue
      filtered.push(t)
    }
    filtered.sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })

    let start = 0
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor)
      if (decoded) {
        start = filtered.findIndex(
          (t) =>
            t.updatedAt < decoded.updatedAt ||
            (t.updatedAt === decoded.updatedAt && t.id < decoded.id),
        )
        if (start === -1) start = filtered.length
      }
    }
    const page = filtered.slice(start, start + limit)
    const last = page[page.length - 1]
    const more = start + limit < filtered.length
    const nextCursor =
      more && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null
    return {
      threads: page.map((t) => toListItem(clone(t))),
      nextCursor,
    }
  }

  async addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<NewComment> {
    const t = this.threads.get(threadId)
    if (!t || !matchesScope(t, scope)) throw new Error('thread not found')
    const next: StoredThread = recomputeCounts({
      ...t,
      comments: [...t.comments, clone(comment)],
      updatedAt: comment.createdAt,
      lastActivityAt: comment.createdAt,
    })
    this.threads.set(threadId, next)
    return clone(comment)
  }

  async setStatus(
    scope: Scope,
    threadId: ThreadId,
    status: ThreadStatus,
    now: string,
  ): Promise<Thread> {
    const t = this.threads.get(threadId)
    if (!t || !matchesScope(t, scope)) throw new Error('thread not found')
    const next: StoredThread = recomputeCounts({
      ...t,
      status,
      updatedAt: now,
      lastActivityAt: now,
    })
    this.threads.set(threadId, next)
    return toThread(clone(next))
  }

  async updateAnchor(
    scope: Scope,
    threadId: ThreadId,
    patch: AnchorPatch,
    now: string,
  ): Promise<ThreadListItem> {
    const t = this.threads.get(threadId)
    if (!t || !matchesScope(t, scope)) throw new Error('thread not found')
    const nextAnchor = {
      ...t.anchor,
      selectors: patch.selectors ?? t.anchor.selectors,
      signals: patch.signals ?? t.anchor.signals,
    }
    const next: StoredThread = recomputeCounts({
      ...t,
      anchor: nextAnchor,
      anchorState: patch.anchorState,
      selectionLost: patch.selectionLost ?? t.selectionLost,
      updatedAt: now,
      lastActivityAt: now,
    })
    this.threads.set(threadId, next)
    return toListItem(clone(next))
  }

  reset(): void {
    this.threads.clear()
  }
}
