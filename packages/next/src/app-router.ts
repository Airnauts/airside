import type { AirsideServer } from '@airnauts/airside-server'
import { operationUrl } from './operation-url'

/**
 * Next App Router catch-all context. Typed as a Promise to satisfy Next 15's
 * route-handler type validation; the handler still `await`s `params`, so a
 * synchronous Next 14 params object works at runtime.
 */
type NextRouteContext = { params: Promise<{ path?: string[] }> }
type NextHandler = (req: Request, ctx: NextRouteContext) => Promise<Response>

/**
 * App Router glue for `app/api/airside/[...path]/route.ts`:
 *   export const { GET, POST, PATCH, DELETE, OPTIONS } = createNextHandler(server)
 *
 * Next strips the mount prefix and hands us the remaining segments in
 * `params.path`; we rebuild the operation-relative URL the dispatcher expects,
 * so the server core stays unaware of where it is mounted (no basePath).
 */
export function createNextHandler(server: AirsideServer): {
  GET: NextHandler
  POST: NextHandler
  PATCH: NextHandler
  DELETE: NextHandler
  OPTIONS: NextHandler
} {
  const handler: NextHandler = async (req, ctx) => {
    const { path } = await ctx.params // awaiting a non-Promise is a no-op (Next 14 safe)
    const url = new URL(req.url)
    const mapped = operationUrl(path, url.search, url.origin)
    return server.handle(new Request(mapped, req)) // copies method/headers/body
  }
  return { GET: handler, POST: handler, PATCH: handler, DELETE: handler, OPTIONS: handler }
}
