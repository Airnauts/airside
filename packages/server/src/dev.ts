import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { nodeRequestToWeb, webToNode } from './node'

export type DevServerHandle = {
  listen: () => Promise<{ port: number }>
  close: () => Promise<void>
}

type WebHandler = (req: Request) => Promise<Response>

export function createDevServer(
  handler: WebHandler,
  opts: { port?: number } = {},
): DevServerHandle {
  let server: Server | null = null
  return {
    async listen() {
      const httpServer = createServer(async (req, res) => {
        try {
          // The dev server mounts at root, so req.url is already operation-relative.
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
          const webRes = await handler(await nodeRequestToWeb(req, url))
          await webToNode(webRes, res)
        } catch (_err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'dev-server-error' } }))
        }
      })
      server = httpServer
      return new Promise<{ port: number }>((resolve, reject) => {
        httpServer.on('error', reject)
        httpServer.listen(opts.port ?? 4321, '127.0.0.1', () => {
          resolve({ port: (httpServer.address() as AddressInfo).port })
        })
      })
    },
    async close() {
      const httpServer = server
      if (!httpServer) return
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
      server = null
    },
  }
}
