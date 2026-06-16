import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AirsideServer } from '@airnauts/airside-server'
import { nodeRequestToWeb, webToNode } from '@airnauts/airside-server/node'
import { operationUrl } from './operation-url'

/**
 * The Node API-route request shape this handler reads. `IncomingMessage` plus the
 * catch-all `query` and the optional parsed `body`. Next's `NextApiRequest` is
 * structurally assignable, so no `next` dependency is needed.
 */
export type NodePagesRequest = IncomingMessage & {
  query?: { path?: string[] | string }
  body?: unknown
}
export type NodePagesHandler = (req: NodePagesRequest, res: ServerResponse) => Promise<void>

/**
 * Pages Router glue for `pages/api/airside/[...path].ts`:
 *   export const config = { api: { bodyParser: false } }
 *   export default createNextPagesHandler(server)
 *
 * `config.api.bodyParser` MUST be false: Next reads it statically from the route
 * module, so the helper cannot set it, and the comments API parses the raw body
 * itself. The guard below fails loud if it is left on.
 */
export function createNextPagesHandler(server: AirsideServer): NodePagesHandler {
  return async (req, res) => {
    if (req.body !== undefined) {
      throw new Error(
        "@airnauts/airside-next: Next's body parser consumed the request body. Add " +
          '`export const config = { api: { bodyParser: false } }` to the route module.',
      )
    }
    const host = req.headers.host ?? 'localhost'
    const search = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    const url = operationUrl(req.query?.path, search, `http://${host}`)
    const webRes = await server.handle(await nodeRequestToWeb(req, url))
    await webToNode(webRes, res)
  }
}
