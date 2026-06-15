import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The slice of a Node request this bridge reads. `IncomingMessage` satisfies it;
 * so do framework wrappers like Next's `NextApiRequest`.
 */
export type NodeRequestLike = Pick<IncomingMessage, 'method' | 'headers' | 'on'>

/** Read the full request body, or `undefined` for bodiless methods. */
export function readBody(req: NodeRequestLike): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Bridge a Node request to a Web `Request` at the **given** url. The caller owns
 * URL construction because it is mount-context-specific: the dev server mounts at
 * root and uses `req.url`; a Next catch-all strips its mount prefix first.
 */
export async function nodeRequestToWeb(req: NodeRequestLike, url: URL): Promise<Request> {
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

/** Write a Web `Response` back onto a Node `ServerResponse`. */
export async function webToNode(res: Response, nodeRes: ServerResponse): Promise<void> {
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
