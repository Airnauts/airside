import { describe, expect, it } from 'vitest'
import {
  buildCaptureContext,
  DEFAULT_KEY_PARAM,
  DEFAULT_THREAD_PARAM,
  resolvePageKey,
  threadLink,
} from './config'

describe('config', () => {
  it('exposes the default key param name', () => {
    expect(DEFAULT_KEY_PARAM).toBe('airside-key')
  })

  it('resolves pageKey via core normalization by default', () => {
    expect(resolvePageKey({ key: 'k', endpoint: 'e' }, 'https://x.com/a/?q=1#h')).toBe(
      resolvePageKey({ key: 'k', endpoint: 'e' }, 'https://x.com/a'),
    )
  })

  it('uses a custom pageKey function when provided', () => {
    const opts = { key: 'k', endpoint: 'e', pageKey: () => 'fixed' }
    expect(resolvePageKey(opts, 'https://x.com/anything')).toBe('fixed')
  })

  it('builds a schema-valid capture context from a window', () => {
    const win = {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 2,
      navigator: { userAgent: 'UA' },
    } as unknown as Window
    expect(buildCaptureContext(win)).toEqual({
      viewportW: 1280,
      viewportH: 720,
      devicePixelRatio: 2,
      userAgent: 'UA',
    })
  })
})

describe('threadLink', () => {
  it('appends the thread param to a page URL', () => {
    expect(threadLink('https://site.com/a?x=1', 't42')).toBe(
      'https://site.com/a?x=1&airside-thread=t42',
    )
    expect(DEFAULT_THREAD_PARAM).toBe('airside-thread')
  })
})
