import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from './errors'
import { operations } from './operations'

const EXPECTED_IDS = [
  'createThread',
  'listThreads',
  'getThread',
  'addComment',
  'setThreadStatus',
  'refreshAnchor',
  'uploadAttachment',
]

describe('operation table', () => {
  it('contains exactly the seven frozen data operations', () => {
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
