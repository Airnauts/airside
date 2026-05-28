import { KEY_HEADER_NAME } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { AuthInvalidKeyError, OriginNotAllowedError } from './errors'
import { checkKey, checkOrigin } from './security'

describe('security', () => {
  it('checkOrigin passes when origin is allowed', () => {
    const req = new Request('http://x/', { headers: { origin: 'https://app.example.com' } })
    expect(() => checkOrigin(req, ['https://app.example.com'])).not.toThrow()
  })

  it('checkOrigin throws OriginNotAllowedError when origin is not in the list', () => {
    const req = new Request('http://x/', { headers: { origin: 'https://attacker.example' } })
    expect(() => checkOrigin(req, ['https://app.example.com'])).toThrowError(OriginNotAllowedError)
  })

  it('checkOrigin throws when Origin header is missing (browser widget only)', () => {
    const req = new Request('http://x/')
    expect(() => checkOrigin(req, ['https://app.example.com'])).toThrowError(OriginNotAllowedError)
  })

  it('checkKey passes when the header matches', () => {
    const req = new Request('http://x/', { headers: { [KEY_HEADER_NAME]: 'sk_test' } })
    expect(() => checkKey(req, 'sk_test')).not.toThrow()
  })

  it('checkKey throws AuthInvalidKeyError when missing or wrong', () => {
    const missing = new Request('http://x/')
    expect(() => checkKey(missing, 'sk_test')).toThrowError(AuthInvalidKeyError)
    const wrong = new Request('http://x/', { headers: { [KEY_HEADER_NAME]: 'nope' } })
    expect(() => checkKey(wrong, 'sk_test')).toThrowError(AuthInvalidKeyError)
  })
})
