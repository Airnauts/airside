// packages/client/src/threads/controller.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createController } from './controller'
import type { Action } from './state'

function make(over: { isCached?: boolean } = {}) {
  const actions: Action[] = []
  const dispatch = (a: Action) => actions.push(a)
  const getThread = vi
    .fn()
    .mockResolvedValue({ id: 't1', status: 'open', comments: [], actions: [] })
  const setThreadStatus = vi.fn().mockResolvedValue({ id: 't1', status: 'resolved', actions: [] })
  const runThreadAction = vi.fn().mockResolvedValue({
    id: 't1',
    status: 'resolved',
    comments: [],
    actions: [],
    externalLinks: [
      {
        provider: 'jira',
        externalId: 'PROJ-1',
        label: 'PROJ-1',
        url: 'https://j/1',
        createdAt: 'x',
      },
    ],
  })
  const deleteThread = vi.fn().mockResolvedValue({ id: 't1' })
  const controller = createController(dispatch, {
    client: { getThread, setThreadStatus, runThreadAction, deleteThread } as never,
    isCached: () => over.isCached ?? false,
    isLoading: () => false,
  })
  return { actions, controller, getThread, setThreadStatus, runThreadAction, deleteThread }
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

describe('controller status events', () => {
  it('emits a status event after setStatus persists', async () => {
    const { controller, setThreadStatus } = make()
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    await controller.setStatus('t1', 'resolved')
    expect(setThreadStatus).toHaveBeenCalledWith('t1', { status: 'resolved' })
    expect(subscriber).toHaveBeenCalledWith({ type: 'status', id: 't1', status: 'resolved' })
  })

  it('does not emit a status event when setStatus fails', async () => {
    const actions: Action[] = []
    const setThreadStatus = vi.fn().mockRejectedValue(new Error('net'))
    const controller = createController((a) => actions.push(a), {
      client: { getThread: vi.fn(), setThreadStatus } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    await controller.setStatus('t1', 'resolved')
    expect(subscriber).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'status' }))
  })
})

describe('controller.subscribe', () => {
  it('fans an event out to every subscriber (Set, not last-writer-wins)', () => {
    const { controller } = make()
    const a = vi.fn()
    const b = vi.fn()
    controller.subscribe(a)
    controller.subscribe(b)
    controller.emit({ type: 'created' })
    expect(a).toHaveBeenCalledWith({ type: 'created' })
    expect(b).toHaveBeenCalledWith({ type: 'created' })
  })

  it('stops delivering to a subscriber after its unsubscribe is called', () => {
    const { controller } = make()
    const subscriber = vi.fn()
    const unsubscribe = controller.subscribe(subscriber)
    unsubscribe()
    controller.emit({ type: 'created' })
    expect(subscriber).not.toHaveBeenCalled()
  })

  it('does not throw when emitting with no subscribers', () => {
    const { controller } = make()
    expect(() => controller.emit({ type: 'created' })).not.toThrow()
  })
})

describe('controller.runAction', () => {
  it('marks the action in-flight then calls client.runThreadAction', async () => {
    const { actions, controller, runThreadAction } = make()
    await controller.runAction('t1', 'jira.createIssue')
    expect(actions[0]).toEqual({ type: 'ACTION_RUNNING', id: 't1', actionId: 'jira.createIssue' })
    expect(runThreadAction).toHaveBeenCalledWith('t1', 'jira.createIssue')
  })

  it('on success replaces the detail with the returned view, clears the flag, emits a status event, returns true', async () => {
    const { actions, controller, runThreadAction } = make()
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    const view = await runThreadAction.getMockImplementation()?.()
    const ok = await controller.runAction('t1', 'jira.createIssue')
    expect(ok).toBe(true)
    // DETAIL_LOADED carries the returned ThreadView (new actions + externalLinks)
    const loaded = actions.find((a) => a.type === 'DETAIL_LOADED')
    expect(loaded).toEqual({ type: 'DETAIL_LOADED', id: 't1', thread: view })
    // flag cleared after the request
    expect(actions.some((a) => a.type === 'ACTION_DONE' && a.id === 't1')).toBe(true)
    // status may have changed → panel reconciliation
    expect(subscriber).toHaveBeenCalledWith({ type: 'status', id: 't1', status: 'resolved' })
  })

  it('on failure clears the flag and returns false without leaving it running', async () => {
    const actions: Action[] = []
    const runThreadAction = vi.fn().mockRejectedValue(new Error('net'))
    const controller = createController((a) => actions.push(a), {
      client: { getThread: vi.fn(), setThreadStatus: vi.fn(), runThreadAction } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    const ok = await controller.runAction('t1', 'jira.createIssue')
    expect(ok).toBe(false)
    expect(actions.some((a) => a.type === 'ACTION_DONE' && a.id === 't1')).toBe(true)
    expect(actions.some((a) => a.type === 'DETAIL_LOADED')).toBe(false)
    expect(subscriber).not.toHaveBeenCalled()
  })
})

describe('controller.bumpCommentCount', () => {
  it('fans out to the store, the runtime cache, and a count event', () => {
    const { actions, controller } = make()
    const rt = {
      setStatus: vi.fn(),
      bumpCommentCount: vi.fn(),
      removeItem: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    const subscriber = vi.fn()
    controller.registerRuntime(rt)
    controller.subscribe(subscriber)
    controller.bumpCommentCount('t1', 1)
    expect(actions).toContainEqual({ type: 'BUMP_COMMENT_COUNT', id: 't1', delta: 1 })
    expect(rt.bumpCommentCount).toHaveBeenCalledWith('t1', 1)
    expect(subscriber).toHaveBeenCalledWith({ type: 'count', id: 't1', delta: 1 })
  })

  it('still updates the store when no runtime or subscriber is registered', () => {
    const { actions, controller } = make()
    controller.bumpCommentCount('t1', -1)
    expect(actions).toContainEqual({ type: 'BUMP_COMMENT_COUNT', id: 't1', delta: -1 })
  })
})

describe('controller created event', () => {
  it('delivers a created event to subscribers on emit', () => {
    const { controller } = make()
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    controller.emit({ type: 'created' })
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(subscriber).toHaveBeenCalledWith({ type: 'created' })
  })

  it('does not deliver after the subscriber unsubscribes', () => {
    const { controller } = make()
    const subscriber = vi.fn()
    const unsubscribe = controller.subscribe(subscriber)
    unsubscribe()
    controller.emit({ type: 'created' })
    expect(subscriber).not.toHaveBeenCalled()
  })
})

describe('controller.deleteThread', () => {
  const rt = () => ({
    setStatus: vi.fn(),
    bumpCommentCount: vi.fn(),
    removeItem: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  })

  it('optimistically removes from store + runtime, persists, and returns true', async () => {
    const { actions, controller, deleteThread } = make()
    const runtime = rt()
    controller.registerRuntime(runtime)
    const ok = await controller.deleteThread('t1')
    expect(ok).toBe(true)
    expect(actions).toContainEqual({ type: 'REMOVE_THREAD', id: 't1' })
    expect(runtime.removeItem).toHaveBeenCalledWith('t1')
    expect(deleteThread).toHaveBeenCalledWith('t1')
    // success path does not re-fetch
    expect(runtime.refresh).not.toHaveBeenCalled()
  })

  it('on API failure rolls back via runtime.refresh and returns false', async () => {
    const actions: Action[] = []
    const deleteThread = vi.fn().mockRejectedValue(new Error('net'))
    const controller = createController((a) => actions.push(a), {
      client: { getThread: vi.fn(), deleteThread } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const runtime = rt()
    controller.registerRuntime(runtime)
    const ok = await controller.deleteThread('t1')
    expect(ok).toBe(false)
    // still optimistically removed up front…
    expect(actions).toContainEqual({ type: 'REMOVE_THREAD', id: 't1' })
    expect(runtime.removeItem).toHaveBeenCalledWith('t1')
    // …then the rollback re-fetches the list (thread still exists server-side)
    expect(runtime.refresh).toHaveBeenCalled()
  })

  it('does not throw when no runtime is registered (success and failure)', async () => {
    const { controller } = make()
    await expect(controller.deleteThread('t1')).resolves.toBe(true)

    const failing = createController(() => {}, {
      client: {
        getThread: vi.fn(),
        deleteThread: vi.fn().mockRejectedValue(new Error('x')),
      } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    await expect(failing.deleteThread('t1')).resolves.toBe(false)
  })

  it('emits a deleted event after the delete persists', async () => {
    const { controller, deleteThread } = make()
    const subscriber = vi.fn()
    controller.subscribe(subscriber)
    const ok = await controller.deleteThread('t1')
    expect(ok).toBe(true)
    expect(deleteThread).toHaveBeenCalledWith('t1')
    expect(subscriber).toHaveBeenCalledWith({ type: 'deleted', id: 't1' })
  })

  it('does not emit a deleted event when the delete fails', async () => {
    const failing = createController(() => {}, {
      client: {
        getThread: vi.fn(),
        deleteThread: vi.fn().mockRejectedValue(new Error('net')),
      } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const subscriber = vi.fn()
    failing.subscribe(subscriber)
    const ok = await failing.deleteThread('t1')
    expect(ok).toBe(false)
    expect(subscriber).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'deleted' }))
  })
})
