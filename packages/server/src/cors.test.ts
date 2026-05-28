import { describe, expect, it } from 'vitest'
import { buildCorsHeaders, isPreflight, preflightResponse } from './cors'

describe('cors helpers', () => {
  it('isPreflight detects an OPTIONS with Access-Control-Request-Method', () => {
    const req = new Request('http://x/', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'POST', origin: 'https://app.example.com' },
    })
    expect(isPreflight(req)).toBe(true)
  })

  it('isPreflight is false for a bare OPTIONS', () => {
    const req = new Request('http://x/', { method: 'OPTIONS' })
    expect(isPreflight(req)).toBe(false)
  })

  it('buildCorsHeaders echoes only allowed origins and sets vary', () => {
    const allowed = ['https://app.example.com']
    const headers = buildCorsHeaders('https://app.example.com', allowed)
    expect(headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(headers.get('vary')).toBe('Origin')
    expect(headers.get('access-control-allow-headers')).toContain('x-comments-key')
    expect(headers.get('access-control-allow-methods')).toContain('PATCH')
  })

  it('buildCorsHeaders does not echo a disallowed origin', () => {
    const allowed = ['https://app.example.com']
    const headers = buildCorsHeaders('https://attacker.example', allowed)
    expect(headers.get('access-control-allow-origin')).toBeNull()
    expect(headers.get('vary')).toBe('Origin')
  })

  it('preflightResponse returns 204 with cache headers when origin is allowed', () => {
    const allowed = ['https://app.example.com']
    const res = preflightResponse('https://app.example.com', allowed)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-max-age')).toBe('600')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })

  it('preflightResponse returns 403 with no ACAO for a disallowed origin', () => {
    const res = preflightResponse('https://attacker.example', ['https://app.example.com'])
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})
