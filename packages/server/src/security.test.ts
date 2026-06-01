import { KEY_HEADER_NAME } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { AuthInvalidKeyError, OriginNotAllowedError } from './errors'
import { checkKey, checkOrigin } from './security'

describe('security', () => {
  it('checkOrigin passes when origin is allowed and returns the validated origin', () => {
    const req = new Request('http://x/', { headers: { origin: 'https://app.example.com' } })
    expect(checkOrigin(req, ['https://app.example.com'])).toBe('https://app.example.com')
  })

  it('checkOrigin throws OriginNotAllowedError when origin is not in the list', () => {
    const req = new Request('http://x/', { headers: { origin: 'https://attacker.example' } })
    expect(() => checkOrigin(req, ['https://app.example.com'])).toThrowError(OriginNotAllowedError)
  })

  it('checkOrigin allows a missing Origin (same-origin GET / non-browser); returns null', () => {
    const req = new Request('http://x/')
    expect(checkOrigin(req, ['https://app.example.com'])).toBeNull()
  })

  it('checkKey passes when the header matches', () => {
    const req = new Request('http://x/', { headers: { [KEY_HEADER_NAME]: 'sk_test' } })
    expect(() => checkKey(req, 'sk_test')).not.toThrow()
  })

  it('checkKey throws AuthInvalidKeyError when missing, wrong-length, or same-length-wrong-value', () => {
    const missing = new Request('http://x/')
    expect(() => checkKey(missing, 'sk_test')).toThrowError(AuthInvalidKeyError)

    const wrongLength = new Request('http://x/', { headers: { [KEY_HEADER_NAME]: 'nope' } })
    expect(() => checkKey(wrongLength, 'sk_test')).toThrowError(AuthInvalidKeyError)

    const sameLength = new Request('http://x/', { headers: { [KEY_HEADER_NAME]: 'sk_xxxx' } })
    expect(() => checkKey(sameLength, 'sk_test')).toThrowError(AuthInvalidKeyError)
  })
})
