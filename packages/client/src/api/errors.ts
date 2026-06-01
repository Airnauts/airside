import type { ErrorCode } from '@airnauts/comments-core'

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode | 'UNKNOWN'
  readonly details?: unknown

  constructor(status: number, code: ErrorCode | 'UNKNOWN', message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
