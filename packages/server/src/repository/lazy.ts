import type { ThreadId, ThreadStatus } from '@airnauts/comments-core'
import type { AnchorPatch, ListQuery, NewComment, NewThread, Repository, Scope } from './types'

// One connected Repository per cacheKey, memoized across warm serverless
// invocations / HMR reloads via a single globalThis registry.
// The registry is intentionally unbounded; cacheKey is expected to be
// low-cardinality (e.g. one entry per database URL per process).
const globalForRepos = globalThis as unknown as {
  __commentsRepos?: Map<string, Promise<Repository>>
}

function registry(): Map<string, Promise<Repository>> {
  globalForRepos.__commentsRepos ??= new Map<string, Promise<Repository>>()
  return globalForRepos.__commentsRepos
}

/**
 * Wraps an async `connect` in a `Repository` that builds synchronously (so a
 * server can be constructed at module load without awaiting) and connects on the
 * first method call. The connected repository is memoized under `cacheKey`; a
 * failed connect clears the entry so the next call retries.
 *
 * `cacheKey` must uniquely identify the connection configuration. Two calls
 * with the same key but different `connect` functions share the first-connected
 * instance — the second `connect` is never invoked.
 */
export function lazyRepository(
  connect: () => Promise<Repository>,
  opts: { cacheKey: string },
): Repository {
  const { cacheKey } = opts
  const get = (): Promise<Repository> => {
    const repos = registry()
    let pending = repos.get(cacheKey)
    if (!pending) {
      pending = connect().catch((err: unknown) => {
        repos.delete(cacheKey) // allow a retry on the next call
        return Promise.reject(err)
      })
      repos.set(cacheKey, pending)
    }
    return pending
  }
  return {
    createThread: (input: NewThread) => get().then((r) => r.createThread(input)),
    getThread: (scope: Scope, id: ThreadId) => get().then((r) => r.getThread(scope, id)),
    listThreads: (query: ListQuery) => get().then((r) => r.listThreads(query)),
    addComment: (scope: Scope, threadId: ThreadId, comment: NewComment) =>
      get().then((r) => r.addComment(scope, threadId, comment)),
    setStatus: (scope: Scope, threadId: ThreadId, status: ThreadStatus, now: string) =>
      get().then((r) => r.setStatus(scope, threadId, status, now)),
    updateAnchor: (scope: Scope, threadId: ThreadId, patch: AnchorPatch, now: string) =>
      get().then((r) => r.updateAnchor(scope, threadId, patch, now)),
  }
}
