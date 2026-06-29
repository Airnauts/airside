import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from './errors'
import { operations } from './operations'
import { EventsQuery, ThreadActionParam } from './requests'

const EXPECTED_IDS = [
  'createThread',
  'listThreads',
  'getThread',
  'addComment',
  'setThreadStatus',
  'refreshAnchor',
  'uploadAttachment',
  'runThreadAction',
  'streamEvents',
]

describe('operation table', () => {
  it('contains exactly the frozen data operations', () => {
    expect(operations.map((o) => o.operationId).sort()).toEqual([...EXPECTED_IDS].sort())
  })
  it('has a unique method+path per operation', () => {
    const keys = operations.map((o) => `${o.method} ${o.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('only references known error codes', () => {
    for (const op of operations) {
      for (const code of op.errors) {
        expect(ERROR_CODES).toContain(code)
      }
    }
  })
  it('declares a success status + schema for every operation', () => {
    for (const op of operations) {
      expect(op.success.status).toBeGreaterThanOrEqual(200)
      expect(op.success.schema).toBeDefined()
    }
  })
})

describe('runThreadAction operation', () => {
  it('is registered with the generic action path', () => {
    const op = operations.find((o) => o.operationId === 'runThreadAction')
    expect(op).toBeDefined()
    expect(op?.method).toBe('POST')
    expect(op?.path).toBe('/threads/:id/actions/:actionId')
    expect(op?.errors).toEqual(expect.arrayContaining(['NOT_FOUND', 'CONFLICT']))
  })

  it('ThreadActionParam parses id and actionId', () => {
    expect(ThreadActionParam.parse({ id: 't1', actionId: 'jira.createIssue' })).toEqual({
      id: 't1',
      actionId: 'jira.createIssue',
    })
  })
})

describe('streamEvents operation', () => {
  const op = operations.find((o) => o.operationId === 'streamEvents')

  it('is a streaming GET on /events with the auth errors', () => {
    expect(op).toBeDefined()
    expect(op?.method).toBe('GET')
    expect(op?.path).toBe('/events')
    expect(op?.stream).toBe(true)
    expect(op?.errors).toEqual(
      expect.arrayContaining(['AUTH_INVALID_KEY', 'ORIGIN_NOT_ALLOWED', 'RATE_LIMITED']),
    )
  })

  it('accepts the query with a pageKey present (page-scoped subscribe)', () => {
    expect(EventsQuery.parse({ pageKey: '/docs' })).toEqual({ pageKey: '/docs' })
  })

  it('accepts the query with pageKey absent (all-pages subscribe)', () => {
    expect(EventsQuery.parse({})).toEqual({})
  })
})
