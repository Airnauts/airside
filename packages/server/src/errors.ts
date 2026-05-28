import type { ErrorCode } from '@comments/core'
import { ERROR_STATUS } from '@comments/core'

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode
  details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.details = details
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const
}

export class AuthInvalidKeyError extends DomainError {
  readonly code = 'AUTH_INVALID_KEY' as const
  constructor(message = 'invalid or missing key') {
    super(message)
  }
}

export class OriginNotAllowedError extends DomainError {
  readonly code = 'ORIGIN_NOT_ALLOWED' as const
  constructor(message = 'origin not allowed') {
    super(message)
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const
}

export class UploadTooLargeError extends DomainError {
  readonly code = 'UPLOAD_TOO_LARGE' as const
}

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED' as const
  constructor(
    public readonly retryAfterSec: number,
    message = 'rate limited',
  ) {
    super(message)
  }
}

function jsonResponse(
  code: ErrorCode,
  message: string,
  details: unknown,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value)
    }
  }
  const body = JSON.stringify(
    details !== undefined ? { error: { code, message, details } } : { error: { code, message } },
  )
  return new Response(body, { status: ERROR_STATUS[code], headers })
}

export function toResponse(err: unknown): Response {
  if (err instanceof RateLimitedError) {
    return jsonResponse(err.code, err.message, err.details, {
      'retry-after': String(err.retryAfterSec),
    })
  }
  if (err instanceof DomainError) {
    return jsonResponse(err.code, err.message, err.details)
  }
  // Unknown / unexpected — no stack, no message leak.
  return jsonResponse('INTERNAL', 'internal error', undefined)
}
