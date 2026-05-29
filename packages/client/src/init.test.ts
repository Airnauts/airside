import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init } from './index'

describe('comments.init', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })
  afterEach(() => {
    history.replaceState({}, '', '/')
  })

  it('is a no-op when the key param is absent', async () => {
    history.replaceState({}, '', '/?nothing=1')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).toBeNull()
    handle.destroy() // must not throw
  })

  it('mounts when the key param matches', async () => {
    history.replaceState({}, '', '/?comments-key=secret')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).not.toBeNull()
    handle.destroy()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })

  it('does not mount when the key param differs', async () => {
    history.replaceState({}, '', '/?comments-key=wrong')
    await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
