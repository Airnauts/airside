// packages/client/src/threads/controller.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createController } from './controller'
import type { Action } from './state'

function make(over: { isCached?: boolean } = {}) {
  const actions: Action[] = []
  const dispatch = (a: Action) => actions.push(a)
  const getThread = vi.fn().mockResolvedValue({ id: 't1', status: 'open', comments: [] })
  const setThreadStatus = vi.fn().mockResolvedValue({ id: 't1', status: 'resolved' })
  const controller = createController(dispatch, {
    client: { getThread, setThreadStatus } as never,
    isCached: () => over.isCached ?? false,
    isLoading: () => false,
  })
  return { actions, controller, getThread, setThreadStatus }
}

describe('controller.requestFocus', () => {
  it('dispatches REQUEST_FOCUS and lazily fetches detail when uncached', async () => {
    const { actions, controller, getThread } = make({ isCached: false })
    controller.requestFocus('t1')
    expect(actions[0]).toEqual({ type: 'REQUEST_FOCUS', id: 't1' })
    expect(getThread).toHaveBeenCalledWith('t1')
  })

  it('does not refetch when detail is cached', () => {
    const { controller, getThread } = make({ isCached: true })
    controller.requestFocus('t1')
    expect(getThread).not.toHaveBeenCalled()
  })
})

describe('controller status listener', () => {
  it('notifies the registered listener after setStatus persists', async () => {
    const { controller, setThreadStatus } = make()
    const listener = vi.fn()
    controller.registerStatusListener(listener)
    await controller.setStatus('t1', 'resolved')
    expect(setThreadStatus).toHaveBeenCalledWith('t1', { status: 'resolved' })
    expect(listener).toHaveBeenCalledWith('t1', 'resolved')
  })

  it('does not notify when setStatus fails', async () => {
    const actions: Action[] = []
    const setThreadStatus = vi.fn().mockRejectedValue(new Error('net'))
    const controller = createController((a) => actions.push(a), {
      client: { getThread: vi.fn(), setThreadStatus } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const listener = vi.fn()
    controller.registerStatusListener(listener)
    await controller.setStatus('t1', 'resolved')
    expect(listener).not.toHaveBeenCalled()
  })
})
