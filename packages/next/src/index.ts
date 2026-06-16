import type { AirsideServer, CreateAirsideServerOptions } from '@airnauts/airside-server'
import { createAirsideServer } from '@airnauts/airside-server'
import { createNextHandler } from './app-router'
import { createNextPagesHandler, type NodePagesHandler } from './pages-router'

export { createNextHandler } from './app-router'
export type { NodePagesHandler, NodePagesRequest } from './pages-router'
export { createNextPagesHandler } from './pages-router'

type AppRouteHandlers = ReturnType<typeof createNextHandler>

/**
 * Build the commenting server and its Next **App Router** catch-all handlers in
 * one call. Mount as `app/api/comments/[...path]/route.ts`:
 *
 *   export const { GET, POST, PATCH, OPTIONS } = createAirsideAppRoute(config)
 *
 * Also returns `server` (absent when `disabled`) for server-side reads, extra
 * routes, or server access in tests.
 */
export function createAirsideAppRoute(
  config: CreateAirsideServerOptions & { disabled?: boolean },
): AppRouteHandlers & { server?: AirsideServer } {
  if (config.disabled) {
    const notFound = async () => new Response('Not Found', { status: 404 })
    return { GET: notFound, POST: notFound, PATCH: notFound, OPTIONS: notFound }
  }
  const server = createAirsideServer(config)
  return { ...createNextHandler(server), server }
}

/**
 * Build the commenting server and a single Next **Pages Router** API-route
 * handler. Mount as `pages/api/comments/[...path].ts`:
 *
 *   export const config = { api: { bodyParser: false } } // required — Next reads it statically
 *   export default createAirsidePagesRoute(config)
 *
 * The returned function carries `.server` (absent when `disabled`) for the same
 * uses as the App Router variant.
 */
export function createAirsidePagesRoute(
  config: CreateAirsideServerOptions & { disabled?: boolean },
): NodePagesHandler & { server?: AirsideServer } {
  if (config.disabled) {
    const notFound: NodePagesHandler = async (_req, res) => {
      res.statusCode = 404
      res.end()
    }
    return notFound
  }
  const server = createAirsideServer(config)
  const handler = createNextPagesHandler(server) as NodePagesHandler & { server?: AirsideServer }
  handler.server = server
  return handler
}
