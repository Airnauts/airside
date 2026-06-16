import { KEY_HEADER_NAME } from '@airnauts/airside-core'

const ALLOWED_METHODS = 'GET, POST, PATCH, OPTIONS'
const ALLOWED_HEADERS = `content-type, ${KEY_HEADER_NAME}`
const MAX_AGE_SECONDS = '600'

export function isPreflight(req: Request): boolean {
  return req.method === 'OPTIONS' && req.headers.has('access-control-request-method')
}

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[],
): Headers {
  const headers = new Headers()
  headers.set('vary', 'Origin')
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-headers', ALLOWED_HEADERS)
    headers.set('access-control-allow-methods', ALLOWED_METHODS)
  }
  return headers
}

export function preflightResponse(
  origin: string | null,
  allowedOrigins: readonly string[],
): Response {
  const headers = buildCorsHeaders(origin, allowedOrigins)
  if (!headers.has('access-control-allow-origin')) {
    return new Response(null, { status: 403, headers })
  }
  headers.set('access-control-max-age', MAX_AGE_SECONDS)
  headers.set('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
  return new Response(null, { status: 204, headers })
}
