import { timingSafeEqual } from 'node:crypto'
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import { AuthInvalidKeyError, OriginNotAllowedError } from './errors'

/**
 * Rejects only a **present-and-disallowed** `Origin`. An absent `Origin`
 * (same-origin GET/HEAD per the Fetch spec, or a non-browser caller) is allowed —
 * the capability key (`checkKey`) is the real gate, and a present cross-origin
 * `Origin` not in `allowedOrigins` is still rejected (blocks unapproved embedding).
 * Returns the validated origin (or `null` when absent) so callers can echo it in
 * CORS headers. See ADR-0017.
 */
export function checkOrigin(req: Request, allowedOrigins: readonly string[]): string | null {
  const origin = req.headers.get('origin')
  if (origin && !allowedOrigins.includes(origin)) {
    throw new OriginNotAllowedError()
  }
  return origin
}

/** Throws `AuthInvalidKeyError` if the `x-airside-key` header is missing or doesn't match `secretKey` (constant-time compare). */
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
