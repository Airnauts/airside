import { describe, expect, it } from 'vitest'
import {
  AuthInvalidKeyError,
  ConflictError,
  DomainError,
  NotFoundError,
  OriginNotAllowedError,
  RateLimitedError,
  toResponse,
  UploadTooLargeError,
  ValidationError,
} from './errors'

describe('toResponse', () => {
  async function read(res: Response) {
    const body = await res.json()
    return { status: res.status, body }
  }

  it('maps ValidationError to 400 VALIDATION_FAILED with details', async () => {
    const err = new ValidationError('bad payload', { fields: { text: 'required' } })
    const { status, body } = await read(toResponse(err))
    expect(status).toBe(400)
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad payload',
        details: { fields: { text: 'required' } },
      },
    })
  })

  it('maps AuthInvalidKeyError to 401 AUTH_INVALID_KEY', async () => {
    const { status, body } = await read(toResponse(new AuthInvalidKeyError()))
    expect(status).toBe(401)
    expect(body.error.code).toBe('AUTH_INVALID_KEY')
  })

  it('maps OriginNotAllowedError to 403 ORIGIN_NOT_ALLOWED', async () => {
    const { status, body } = await read(toResponse(new OriginNotAllowedError()))
    expect(status).toBe(403)
    expect(body.error.code).toBe('ORIGIN_NOT_ALLOWED')
  })

  it('maps NotFoundError to 404 NOT_FOUND', async () => {
    const { status, body } = await read(toResponse(new NotFoundError('nope')))
    expect(status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('maps ConflictError to 409 CONFLICT', async () => {
    const { status, body } = await read(toResponse(new ConflictError('conflict')))
    expect(status).toBe(409)
    expect(body.error.code).toBe('CONFLICT')
  })

  it('maps UploadTooLargeError to 413 UPLOAD_TOO_LARGE', async () => {
    const { status, body } = await read(toResponse(new UploadTooLargeError('big')))
    expect(status).toBe(413)
    expect(body.error.code).toBe('UPLOAD_TOO_LARGE')
  })

  it('maps RateLimitedError to 429 with Retry-After header', async () => {
    const res = toResponse(new RateLimitedError(7))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('7')
    const body = await res.json()
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('maps unknown exceptions to 500 INTERNAL with no stack leak', async () => {
    const res = toResponse(new Error('boom — secret stack'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(body)).not.toContain('secret stack')
  })

  it('DomainError is the common base', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(DomainError)
    expect(new ValidationError('x')).toBeInstanceOf(DomainError)
  })
})
