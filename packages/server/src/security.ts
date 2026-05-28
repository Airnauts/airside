import { timingSafeEqual } from 'node:crypto'
import { KEY_HEADER_NAME } from '@comments/core'
import { AuthInvalidKeyError, OriginNotAllowedError } from './errors'

/** Throws `OriginNotAllowedError` if Origin is missing or not in `allowedOrigins`. Returns the validated origin so callers can echo it in CORS headers. */
export function checkOrigin(req: Request, allowedOrigins: readonly string[]): string {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new OriginNotAllowedError()
  }
  return origin
}

/** Throws `AuthInvalidKeyError` if the `x-comments-key` header is missing or doesn't match `secretKey` (constant-time compare). */
export function checkKey(req: Request, secretKey: string): void {
  const provided = req.headers.get(KEY_HEADER_NAME)
  if (!provided) throw new AuthInvalidKeyError()
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(secretKey, 'utf8')
  // NOTE: the length check leaks key length (timingSafeEqual throws on unequal
  // buffer sizes). Acceptable for v1; for stricter constant-time, compare HMACs.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthInvalidKeyError()
  }
}
