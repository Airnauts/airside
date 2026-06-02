import { type Operation, operations } from '@airnauts/comments-core'
import { buildCorsHeaders, isPreflight, preflightResponse } from './cors'
import type { Ctx, IdFactory } from './ctx'
import { defaultIds, makeCtx } from './ctx'
import { RateLimitedError, toResponse } from './errors'
import { InMemoryRateLimiter, type RateLimitConfig, type RateLimiter } from './rate-limit'
import type { Repository } from './repository/types'
import { compileRoutes, dispatch, type UseCaseMap } from './router'
import { checkKey, checkOrigin } from './security'
import type { StorageAdapter } from './storage/types'
import { addComment } from './use-cases/add-comment'
// Use-cases
import { createThread } from './use-cases/create-thread'
import { getThread } from './use-cases/get-thread'
import { listThreads } from './use-cases/list-threads'
import { refreshAnchor } from './use-cases/refresh-anchor'
import { setThreadStatus } from './use-cases/set-thread-status'
import { uploadAttachment } from './use-cases/upload-attachment'

export type CreateCommentsServerOptions = {
  secretKey: string
  projectId: string
  env?: string
  allowedOrigins: string[]
  repository: Repository
  storage: StorageAdapter
  /** false to disable; defaults to { writesPerMin: 60, readsPerMin: 600 }. */
  rateLimit?: RateLimitConfig | false
  /** Override the rate limiter implementation entirely. */
  rateLimiter?: RateLimiter
  /** Override clock for tests. */
  now?: () => Date
  /** Override id factory for tests. */
  ids?: IdFactory
  /** Per-upload max bytes. Default 5 MB. */
  uploads?: { maxBytes?: number }
  /** Read the client IP from a request. Defaults to first hop of x-forwarded-for. */
  extractIp?: (req: Request) => string
}

export type CommentsServer = {
  handle: (req: Request) => Promise<Response>
}

function defaultExtractIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

function addCorsHeaders(
  res: Response,
  origin: string | null,
  allowedOrigins: readonly string[],
): Response {
  const headers = new Headers(res.headers)
  buildCorsHeaders(origin, allowedOrigins).forEach((value, key) => {
    headers.set(key, value)
  })
  return new Response(res.body, { status: res.status, headers })
}

/**
 * Boot-time guard: every Operation in the table must have a callable handler in `useCases`.
 * Uses `typeof === 'function'` (not `in`) so explicit `undefined`/`null` entries also fail loudly.
 */
export function assertUseCasesCoverOperations(
  useCases: UseCaseMap,
  ops: readonly Operation[],
): void {
  for (const op of ops) {
    if (typeof useCases[op.operationId] !== 'function') {
      throw new Error(`createCommentsServer: missing use-case for '${op.operationId}'`)
    }
  }
}

export function createCommentsServer(opts: CreateCommentsServerOptions): CommentsServer {
  const ids = opts.ids ?? defaultIds()
  const now = opts.now ?? (() => new Date())
  const ctxBase: Ctx = makeCtx({ projectId: opts.projectId, env: opts.env, now, ids })
  const rateLimiter: RateLimiter | null =
    opts.rateLimit === false
      ? null
      : (opts.rateLimiter ??
        new InMemoryRateLimiter(opts.rateLimit ?? { writesPerMin: 60, readsPerMin: 600 }))
  const extractIp = opts.extractIp ?? defaultExtractIp

  const useCases: UseCaseMap = {
    createThread: (input) => createThread(input as never, { repo: opts.repository }),
    listThreads: (input) => listThreads(input as never, { repo: opts.repository }),
    getThread: (input) => getThread(input as never, { repo: opts.repository }),
    addComment: (input) => addComment(input as never, { repo: opts.repository }),
    setThreadStatus: (input) => setThreadStatus(input as never, { repo: opts.repository }),
    refreshAnchor: (input) => refreshAnchor(input as never, { repo: opts.repository }),
    uploadAttachment: (input) =>
      uploadAttachment(input as never, {
        storage: opts.storage,
        repo: opts.repository,
        ids,
        maxBytes: opts.uploads?.maxBytes,
      }),
  }

  // Boot-time sanity: every operationId has a handler.
  assertUseCasesCoverOperations(useCases, operations)

  const routes = compileRoutes(operations)

  async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin')
    try {
      if (isPreflight(req)) {
        return preflightResponse(origin, opts.allowedOrigins)
      }
      checkOrigin(req, opts.allowedOrigins)
      checkKey(req, opts.secretKey)
      if (rateLimiter) {
        const kind = req.method === 'GET' ? 'read' : 'write'
        const ip = extractIp(req)
        const result = await rateLimiter.check(`${opts.projectId}:${ip}:${kind}`)
        if (!result.ok) throw new RateLimitedError(result.retryAfterSec)
      }
      const res = await dispatch(routes, useCases, ctxBase, req)
      return addCorsHeaders(res, origin, opts.allowedOrigins)
    } catch (err) {
      const res = toResponse(err)
      return addCorsHeaders(res, origin, opts.allowedOrigins)
    }
  }

  return { handle }
}
