import { timingSafeEqual } from 'node:crypto'
import { KEY_HEADER_NAME } from '@comments/core'
import { AuthInvalidKeyError, OriginNotAllowedError } from './errors'

export function checkOrigin(req: Request, allowedOrigins: readonly string[]): string {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new OriginNotAllowedError()
  }
  return origin
}

export function checkKey(req: Request, secretKey: string): void {
  const provided = req.headers.get(KEY_HEADER_NAME)
  if (!provided) throw new AuthInvalidKeyError()
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(secretKey, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthInvalidKeyError()
  }
}
