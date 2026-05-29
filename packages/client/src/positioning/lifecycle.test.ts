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

  it('calls onReposition when the MutationObserver fires', () => {
    const spies = installObserverSpies()
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    spies.fireMutation()
    expect(onReposition).toHaveBeenCalled()
    stop()
    spies.restore()
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
