import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type DevServerHandle = {
  listen: () => Promise<{ port: number }>
  close: () => Promise<void>
}

type WebHandler = (req: Request) => Promise<Response>

function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function nodeToWeb(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(', '))
    else if (typeof v === 'string') headers.set(k, v)
  }
  const body = await readBody(req)
  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  })
}

async function webToNode(res: Response, nodeRes: ServerResponse): Promise<void> {
  nodeRes.statusCode = res.status
  res.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value)
  })
  if (!res.body) {
    nodeRes.end()
    return
  }
  const buf = Buffer.from(await res.arrayBuffer())
  nodeRes.end(buf)
}

export function createDevServer(
  handler: WebHandler,
  opts: { port?: number } = {},
): DevServerHandle {
  let server: Server | null = null
  return {
    async listen() {
      const httpServer = createServer(async (req, res) => {
        try {
          const webReq = await nodeToWeb(req)
          const webRes = await handler(webReq)
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
          const addr = httpServer.address() as AddressInfo
          resolve({ port: addr.port })
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
