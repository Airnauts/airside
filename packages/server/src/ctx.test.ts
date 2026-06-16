import type { ThreadId } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { defaultIds, makeCtx } from './ctx'

describe('ctx', () => {
  it('makeCtx wires projectId/env and defaults now/ids', () => {
    const ctx = makeCtx({ projectId: 'proj_a', env: 'prod' })
    expect(ctx.projectId).toBe('proj_a')
    expect(ctx.env).toBe('prod')
    expect(ctx.now()).toBeInstanceOf(Date)
    expect(ctx.ids.thread()).toMatch(/^t_/)
  })

  it('accepts overrides for now and ids (deterministic tests)', () => {
    const fixed = new Date('2026-05-28T12:00:00.000Z')
    const ctx = makeCtx({
      projectId: 'p',
      now: () => fixed,
      ids: { ...defaultIds(), thread: () => 't_fixed' as ThreadId },
    })
    expect(ctx.now()).toBe(fixed)
    expect(ctx.ids.thread()).toBe('t_fixed')
  })

  it('defaults threadParam to "airside-thread"', () => {
    const ctx = makeCtx({ projectId: 'p' })
    expect(ctx.threadParam).toBe('airside-thread')
  })

  it('accepts a custom threadParam', () => {
    const ctx = makeCtx({ projectId: 'p', threadParam: 'c-thread' })
    expect(ctx.threadParam).toBe('c-thread')
  })
})
