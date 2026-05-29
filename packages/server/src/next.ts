import type { CommentsServer } from './server'

/** Next App Router catch-all context. `params` is a Promise on Next 15 and a plain object on Next 14. */
type NextRouteContext = { params: Promise<{ path?: string[] }> | { path?: string[] } }
type NextHandler = (req: Request, ctx: NextRouteContext) => Promise<Response>

/**
 * App Router glue for `app/api/comments/[...path]/route.ts`:
 *   export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
 *
 * Next strips the mount prefix and hands us the remaining segments in
 * `params.path`; we rebuild the operation-relative URL the dispatcher expects,
 * so the server core stays unaware of where it is mounted (no basePath).
 */
export function createNextHandler(server: CommentsServer): {
  GET: NextHandler
  POST: NextHandler
  PATCH: NextHandler
  OPTIONS: NextHandler
} {
  const handler: NextHandler = async (req, ctx) => {
    const { path } = await ctx.params // awaiting a non-Promise is a no-op (Next 14 safe)
    const url = new URL(req.url)
    // Segments are URL-encode-stable for this API's character set (nanoid ids +
    // fixed route words), so the `new URL()` rebuild is a no-op for them.
    const mapped = new URL(`/${(path ?? []).join('/')}${url.search}`, url.origin)
    return server.handle(new Request(mapped, req)) // copies method/headers/body
  }
  return { GET: handler, POST: handler, PATCH: handler, OPTIONS: handler }
}
