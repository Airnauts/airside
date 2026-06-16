import { afterEach, describe, expect, it } from 'vitest'
import { consumeThreadParam, packageName } from './index'
import { FOCUS_STORAGE_KEY } from './panel/navigate'

describe('@airnauts/comments-client', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@airnauts/comments-client')
  })

  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object')
  })
})

describe('consumeThreadParam', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('stashes an openDetail handoff and strips the param', () => {
    window.history.replaceState({}, '', '/page?x=1&airside-thread=t5')
    consumeThreadParam('airside-thread')
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBe(
      JSON.stringify({ id: 't5', openDetail: true }),
    )
    expect(window.location.search).toBe('?x=1')
  })

  it('does nothing when the param is absent', () => {
    window.history.replaceState({}, '', '/page?x=1')
    consumeThreadParam('airside-thread')
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
    expect(window.location.search).toBe('?x=1')
  })
})
