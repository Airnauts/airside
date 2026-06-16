import { describe, expect, it } from 'vitest'
import { ERROR_CODES, ERROR_STATUS, ErrorResponse } from './errors'
import { KEY_HEADER_NAME } from './wire'

describe('error model', () => {
  it('every code has a mapped HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(typeof ERROR_STATUS[code]).toBe('number')
    }
    expect(ERROR_STATUS.VALIDATION_FAILED).toBe(400)
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429)
  })
  it('ErrorResponse parses the wire shape', () => {
    const e = { error: { code: 'NOT_FOUND', message: 'gone' } }
    expect(ErrorResponse.parse(e).error.code).toBe('NOT_FOUND')
  })
  it('ErrorResponse rejects an unknown code', () => {
    expect(() => ErrorResponse.parse({ error: { code: 'NOPE', message: 'x' } })).toThrow()
  })
})

describe('wire constants', () => {
  it('freezes the auth header name', () => {
    expect(KEY_HEADER_NAME).toBe('x-airside-key')
  })
})
