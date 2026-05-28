import { describe, expect, it, vi } from 'vitest'
import { InMemoryRateLimiter, type RateLimitConfig } from './rate-limit'

const cfg: RateLimitConfig = { writesPerMin: 2, readsPerMin: 3 }

describe('InMemoryRateLimiter', () => {
  it('allows up to the budget then 429s', async () => {
    const now = vi.fn(() => 1_000_000)
    const rl = new InMemoryRateLimiter(cfg, now)
    const bucket = 'proj:1.2.3.4:write'
    expect(await rl.check(bucket)).toEqual({ ok: true })
    expect(await rl.check(bucket)).toEqual({ ok: true })
    const out = await rl.check(bucket)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.retryAfterSec).toBeGreaterThan(0)
  })

  it('resets after the window rolls over', async () => {
    let t = 1_000_000
    const rl = new InMemoryRateLimiter(cfg, () => t)
    const b = 'k:ip:write'
    await rl.check(b)
    await rl.check(b)
    expect((await rl.check(b)).ok).toBe(false)
    t += 60_000
    expect((await rl.check(b)).ok).toBe(true)
  })

  it('separates read and write buckets', async () => {
    const rl = new InMemoryRateLimiter(cfg, () => 0)
    expect((await rl.check('k:ip:read')).ok).toBe(true)
    expect((await rl.check('k:ip:read')).ok).toBe(true)
    expect((await rl.check('k:ip:read')).ok).toBe(true)
    expect((await rl.check('k:ip:read')).ok).toBe(false)
    expect((await rl.check('k:ip:write')).ok).toBe(true)
  })
})
