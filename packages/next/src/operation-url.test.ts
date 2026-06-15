import { describe, expect, it } from 'vitest'
import { operationUrl } from './operation-url'

describe('operationUrl', () => {
  it('joins array segments under the origin', () => {
    expect(operationUrl(['threads', 'abc'], '', 'http://h').href).toBe('http://h/threads/abc')
  })
  it('wraps a single string segment', () => {
    expect(operationUrl('threads', '', 'http://h').href).toBe('http://h/threads')
  })
  it('maps empty/undefined segments to root', () => {
    expect(operationUrl(undefined, '', 'http://h').href).toBe('http://h/')
    expect(operationUrl([], '', 'http://h').href).toBe('http://h/')
  })
  it('preserves the search string', () => {
    expect(operationUrl(['threads'], '?status=open', 'http://h').href).toBe('http://h/threads?status=open')
  })
})
