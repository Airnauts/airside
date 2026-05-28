export type RateLimitConfig = {
  writesPerMin: number
  readsPerMin: number
}

export type CheckResult = { ok: true } | { ok: false; retryAfterSec: number }

export interface RateLimiter {
  check(bucket: string): Promise<CheckResult>
}

const WINDOW_MS = 60_000

type Slot = { windowStart: number; count: number }

export class InMemoryRateLimiter implements RateLimiter {
  private slots = new Map<string, Slot>()

  constructor(
    private readonly cfg: RateLimitConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async check(bucket: string): Promise<CheckResult> {
    const limit = bucket.endsWith(':read') ? this.cfg.readsPerMin : this.cfg.writesPerMin
    const t = this.now()
    const slot = this.slots.get(bucket)
    if (!slot || t - slot.windowStart >= WINDOW_MS) {
      this.slots.set(bucket, { windowStart: t, count: 1 })
      return { ok: true }
    }
    if (slot.count < limit) {
      slot.count += 1
      return { ok: true }
    }
    const retryAfterSec = Math.max(1, Math.ceil((slot.windowStart + WINDOW_MS - t) / 1000))
    return { ok: false, retryAfterSec }
  }
}
