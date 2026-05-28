import { operations } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { NotFoundError } from './errors'
import { compileRoutes, dispatch, match, type UseCaseMap } from './router'

const routes = compileRoutes(operations)

const noopUseCases: UseCaseMap = Object.fromEntries(
  operations.map((op) => [
    op.operationId,
    async () => {
      if (op.operationId === 'listThreads') return { threads: [], nextCursor: null }
      // Return something minimal that matches the schema's surface for the success path —
      // the per-use-case tests fill these in for real. Here we only need the dispatcher.
      return undefined as never
    },
  ]),
) as UseCaseMap

describe('router', () => {
  it('matches a literal path', () => {
    const req = new Request('http://x/threads?pageKey=%2Fa', { method: 'GET' })
    const m = match(req, routes)
    expect(m?.op.operationId).toBe('listThreads')
  })

  it('matches a path with a parameter', () => {
    const req = new Request('http://x/threads/abc', { method: 'GET' })
    const m = match(req, routes)
    expect(m?.op.operationId).toBe('getThread')
    expect(m?.params).toEqual({ id: 'abc' })
  })

  it('returns null for an unknown path', () => {
    const req = new Request('http://x/nope', { method: 'GET' })
    expect(match(req, routes)).toBeNull()
  })

  it('dispatch throws NotFoundError for an unmatched route', async () => {
    const req = new Request('http://x/nope', { method: 'GET' })
    await expect(dispatch(routes, noopUseCases, {} as never, req)).rejects.toThrow(NotFoundError)
  })

  it('dispatch throws if any operationId has no handler', async () => {
    const incomplete: UseCaseMap = { ...noopUseCases }
    delete (incomplete as Record<string, unknown>).createThread
    await expect(
      dispatch(
        routes,
        incomplete,
        {} as never,
        new Request('http://x/threads', { method: 'POST' }),
      ),
    ).rejects.toThrow("no use-case registered for operationId 'createThread'")
  })

  it('dispatch parses ?pageKey=… and 200s for listThreads', async () => {
    const req = new Request('http://x/threads', {
      method: 'GET',
      headers: { origin: 'https://app.example.com' },
    })
    const res = await dispatch(routes, noopUseCases, {} as never, req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ threads: [], nextCursor: null })
  })
})
