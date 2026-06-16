import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init } from './index'

describe('airside.init', () => {
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
    expect(document.querySelector('[data-airside-root]')).toBeNull()
    handle.destroy() // must not throw
  })

  it('mounts when the key param matches', async () => {
    history.replaceState({}, '', '/?airside-key=secret')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-airside-root]')).not.toBeNull()
    handle.destroy()
    expect(document.querySelector('[data-airside-root]')).toBeNull()
  })

  it('does not mount when the key param differs', async () => {
    history.replaceState({}, '', '/?airside-key=wrong')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-airside-root]')).toBeNull()
    handle.destroy()
  })

  it('persists the key and strips the param after activating via URL', async () => {
    history.replaceState({}, '', '/?airside-key=secret')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(localStorage.getItem('airside:key')).toBe(JSON.stringify('secret'))
    expect(window.location.search).toBe('')
    handle.destroy()
  })

  it('preserves other params and the hash when stripping', async () => {
    history.replaceState({}, '', '/?airside-key=secret&foo=1#section')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(window.location.search).toBe('?foo=1')
    expect(window.location.hash).toBe('#section')
    handle.destroy()
  })

  it('mounts from a stored key when the param is absent', async () => {
    localStorage.setItem('airside:key', JSON.stringify('secret'))
    history.replaceState({}, '', '/')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-airside-root]')).not.toBeNull()
    handle.destroy()
  })

  it('does not mount from a stale stored key', async () => {
    localStorage.setItem('airside:key', JSON.stringify('old-key'))
    history.replaceState({}, '', '/')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-airside-root]')).toBeNull()
    handle.destroy()
  })
})
