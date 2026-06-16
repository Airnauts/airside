import { describe, expect, it } from 'vitest'
import { DEFAULT_THREAD_PARAM, threadLink } from './deep-link'

describe('threadLink', () => {
  it('appends the default thread param', () => {
    expect(threadLink('https://example.com/about', 't_1')).toBe(
      'https://example.com/about?airside-thread=t_1',
    )
  })

  it('honours a custom param', () => {
    expect(threadLink('https://example.com/a', 't_2', 'c-thread')).toBe(
      'https://example.com/a?c-thread=t_2',
    )
  })

  it('preserves existing query params', () => {
    expect(threadLink('https://example.com/a?ref=1', 't_3')).toBe(
      'https://example.com/a?ref=1&airside-thread=t_3',
    )
  })

  it('exposes the default param constant', () => {
    expect(DEFAULT_THREAD_PARAM).toBe('airside-thread')
  })
})
