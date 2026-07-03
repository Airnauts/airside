import { type Operation, operations } from '@airnauts/airside-core'
import { buildCorsHeaders, isPreflight, preflightResponse } from './cors'
import type { Ctx, IdFactory } from './ctx'
import { defaultIds, makeCtx } from './ctx'
import { RateLimitedError, toResponse } from './errors'
import { buildExtensionRegistry } from './extensions/registry'
import type { NotificationExtension, ServerExtension } from './extensions/types'
import type { Notifier } from './notify/types'
import { InMemoryRateLimiter, type RateLimitConfig, type RateLimiter } from './rate-limit'
import type { Repository } from './repository/types'
import { compileRoutes, dispatch, type UseCaseMap } from './router'
import { checkKey, checkOrigin } from './security'
import type { StorageAdapter } from './storage/types'
import { addComment } from './use-cases/add-comment'
// Use-cases
import { createThread } from './use-cases/create-thread'
import { deleteThread } from './use-cases/delete-thread'
import { getThread } from './use-cases/get-thread'
import { listThreads } from './use-cases/list-threads'
import { refreshAnchor } from './use-cases/refresh-anchor'
import { runThreadAction } from './use-cases/run-thread-action'
import { setThreadStatus } from './use-cases/set-thread-status'
import { uploadAttachment } from './use-cases/upload-attachment'

export type CreateAirsideServerOptions = {
  secretKey: string
  projectId: string
  env?: string
  allowedOrigins: string[]
  repository: Repository
  storage: StorageAdapter
  /** Server plugins: notifications + thread actions. Forward-looking API. */
  extensions?: ServerExtension[]
  /** @deprecated Use `extensions`. Wrapped into notification extensions. */
  notifiers?: Notifier[]
  /** Query param the widget reads to focus a thread; used to build notification deep-links. Defaults to "airside-thread". */
  threadParam?: string
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

export type AirsideServer = {
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

/** Wrap a legacy `Notifier` (`.notify`) as a `NotificationExtension` (`.onEvent`). */
function adaptNotifier(n: Notifier): NotificationExtension {
  return { kind: 'notification', name: n.name, onEvent: (e) => n.notify(e) }
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
      throw new Error(`createAirsideServer: missing use-case for '${op.operationId}'`)
    }
  }
}

export function createAirsideServer(opts: CreateAirsideServerOptions): AirsideServer {
  const ids = opts.ids ?? defaultIds()
  const now = opts.now ?? (() => new Date())
  const ctxBase: Ctx = makeCtx({
    projectId: opts.projectId,
    env: opts.env,
    threadParam: opts.threadParam,
    now,
    ids,
  })
  const rateLimiter: RateLimiter | null =
    opts.rateLimit === false
      ? null
      : (opts.rateLimiter ??
        new InMemoryRateLimiter(opts.rateLimit ?? { writesPerMin: 60, readsPerMin: 600 }))
  const extractIp = opts.extractIp ?? defaultExtractIp

  const registry = buildExtensionRegistry([
    ...(opts.extensions ?? []),
    ...(opts.notifiers ?? []).map(adaptNotifier),
  ])
  const notifications = [...registry.notifications]

  const useCases: UseCaseMap = {
    createThread: (input) =>
      createThread(input as never, { repo: opts.repository, notifications, registry }),
    listThreads: (input) => listThreads(input as never, { repo: opts.repository, registry }),
    getThread: (input) => getThread(input as never, { repo: opts.repository, registry }),
    addComment: (input) => addComment(input as never, { repo: opts.repository, notifications }),
    setThreadStatus: (input) =>
      setThreadStatus(input as never, { repo: opts.repository, registry }),
    deleteThread: (input) => deleteThread(input as never, { repo: opts.repository }),
    refreshAnchor: (input) => refreshAnchor(input as never, { repo: opts.repository, registry }),
    runThreadAction: (input) =>
      runThreadAction(input as never, { repo: opts.repository, registry }),
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
