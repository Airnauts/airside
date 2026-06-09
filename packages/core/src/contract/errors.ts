import { z } from 'zod'

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTH_INVALID_KEY',
  'ORIGIN_NOT_ALLOWED',
  'NOT_FOUND',
  'CONFLICT',
  'UPLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'INTEGRATION_ERROR',
] as const

export const ErrorCode = z.enum(ERROR_CODES)
export type ErrorCode = z.infer<typeof ErrorCode>

export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' })
export type ErrorResponse = z.infer<typeof ErrorResponse>

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTH_INVALID_KEY: 401,
  ORIGIN_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  INTEGRATION_ERROR: 502,
}
