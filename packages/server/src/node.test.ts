import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { type NodeRequestLike, nodeRequestToWeb, readBody, webToNode } from './node'

function fakeReq(opts: {
  method?: string
  headers?: Record<string, string>
  body?: string
}): NodeRequestLike {
  const r = Readable.from(opts.body != null ? [Buffer.from(opts.body)] : []) as unknown as NodeRequestLike
  r.method = opts.method ?? 'GET'
  r.headers = opts.headers ?? {}
  return r
}

function fakeRes() {
  const headers: Record<string, string> = {}
  const out = {
    statusCode: 0,
    headers,
    body: undefined as Buffer | undefined,
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    end(b?: Buffer) {
      out.body = b
    },
  }
  return out
}

describe('nodeRequestToWeb', () => {
  it('builds a Request at the given url and copies headers', async () => {
    const out = await nodeRequestToWeb(fakeReq({ headers: { 'x-test': 'y' } }), new URL('http://h/threads?status=open'))
    expect(out.url).toBe('http://h/threads?status=open')
    expect(out.headers.get('x-test')).toBe('y')
    expect(out.method).toBe('GET')
  })

  it('streams a POST body through', async () => {
    const out = await nodeRequestToWeb(
      fakeReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' }),
      new URL('http://h/threads'),
    )
    expect(await out.json()).toEqual({ a: 1 })
  })

  it('omits the body for GET', async () => {
    const out = await nodeRequestToWeb(fakeReq({ method: 'GET' }), new URL('http://h/threads'))
    expect(out.body).toBeNull()
  })

  it('joins multi-value headers', async () => {
    const req = fakeReq({})
    ;(req.headers as Record<string, string | string[]>).accept = ['text/html', 'application/json']
    const out = await nodeRequestToWeb(req, new URL('http://h/threads'))
    expect(out.headers.get('accept')).toBe('text/html, application/json')
  })
})

describe('readBody', () => {
  it('returns undefined for HEAD', async () => {
    expect(await readBody(fakeReq({ method: 'HEAD' }))).toBeUndefined()
  })

  it('reads a DELETE body', async () => {
    expect(await readBody(fakeReq({ method: 'DELETE', body: 'x' }))).toEqual(Buffer.from('x'))
  })
})

describe('webToNode', () => {
  it('writes status, headers, and body to the node response', async () => {
    const res = fakeRes()
    await webToNode(new Response('hello', { status: 201, headers: { 'content-type': 'text/plain' } }), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(201)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body?.toString()).toBe('hello')
  })

  it('ends with no body for an empty response', async () => {
    const res = fakeRes()
    await webToNode(new Response(null, { status: 204 }), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(204)
    expect(res.body).toBeUndefined()
  })
})
