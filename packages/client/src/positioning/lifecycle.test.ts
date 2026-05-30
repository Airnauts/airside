import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installObserverSpies } from '../../test/test-helpers/dom'
import { observeReposition } from './lifecycle'

// rAF runs synchronously in these tests so coalesced callbacks fire deterministically.
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('observeReposition', () => {
  it('calls onReposition on scroll and resize', () => {
    const spies = installObserverSpies()
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(onReposition).toHaveBeenCalledTimes(2)
    stop()
    spies.restore()
  })

  it('calls onMutation when the MutationObserver fires', () => {
    const spies = installObserverSpies()
    const onReposition = vi.fn()
    const onMutation = vi.fn()
    const stop = observeReposition({
      targets: [],
      onReposition,
      onMutation,
      onRouteChange: vi.fn(),
    })
    // No records (empty array) is treated as a host-page signal (back-compat) and fires.
    spies.fireMutation()
    expect(onMutation).toHaveBeenCalled()
    expect(onReposition).not.toHaveBeenCalled()
    stop()
    spies.restore()
  })

  it('ignores mutations that originate inside the widget root (prevents the re-render loop)', () => {
    document.body.innerHTML = '<div data-comments-root><span id="own">x</span></div>'
    const spies = installObserverSpies()
    const onMutation = vi.fn()
    const stop = observeReposition({
      targets: [],
      onMutation,
      onReposition: vi.fn(),
      onRouteChange: vi.fn(),
    })
    const ownTarget = document.querySelector('#own') as Element
    // A widget-internal mutation (e.g. Radix popover attribute flip) must NOT trigger rematch.
    spies.fireMutation([{ target: ownTarget } as unknown as MutationRecord])
    expect(onMutation).not.toHaveBeenCalled()
    stop()
    spies.restore()
    document.body.innerHTML = ''
  })

  it('still reacts to host-page mutations outside the widget root', () => {
    document.body.innerHTML =
      '<main><p id="host">host</p></main><div data-comments-root><span id="own">x</span></div>'
    const spies = installObserverSpies()
    const onMutation = vi.fn()
    const stop = observeReposition({
      targets: [],
      onMutation,
      onReposition: vi.fn(),
      onRouteChange: vi.fn(),
    })
    const hostTarget = document.querySelector('#host') as Element
    spies.fireMutation([{ target: hostTarget } as unknown as MutationRecord])
    expect(onMutation).toHaveBeenCalled()
    stop()
    spies.restore()
    document.body.innerHTML = ''
  })

  it('calls onRouteChange on pushState and popstate', () => {
    const onRouteChange = vi.fn()
    const stop = observeReposition({ targets: [], onReposition: vi.fn(), onRouteChange })
    history.pushState({}, '', '/next')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onRouteChange).toHaveBeenCalledTimes(2)
    stop()
  })

  it('detaches all listeners on stop', () => {
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    stop()
    window.dispatchEvent(new Event('scroll'))
    expect(onReposition).not.toHaveBeenCalled()
  })
})
