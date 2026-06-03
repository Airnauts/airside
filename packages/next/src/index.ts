import type { CommentsServer, CreateCommentsServerOptions } from '@airnauts/comments-server'
import { createCommentsServer } from '@airnauts/comments-server'
import { createNextHandler } from '@airnauts/comments-server/next'

type NextRouteHandlers = ReturnType<typeof createNextHandler>

/**
 * Build the commenting server and its Next App Router catch-all handlers in one
 * call. Mount as `app/api/comments/[...path]/route.ts`:
 *
 *   export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute(config)
 *
 * Also returns `server` (absent when `disabled`) for hosts that need server-side
 * reads, extra routes, or server access in tests.
 */
export function createCommentsRoute(
  config: CreateCommentsServerOptions & { disabled?: boolean },
): NextRouteHandlers & { server?: CommentsServer } {
  if (config.disabled) {
    // `NextHandler` is not exported from the server package; an inline async
    // arrow returning a Response structurally satisfies the handler signature.
    const notFound = async () => new Response('Not Found', { status: 404 })
    return { GET: notFound, POST: notFound, PATCH: notFound, OPTIONS: notFound }
  }
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}
