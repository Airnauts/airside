import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from './mount'

describe('mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('renders the portal and toast containers inside the root and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-airside-root]') as HTMLElement
    // The self-mutation-filter invariant: both portal containers live under the widget root.
    expect(host.querySelector('[data-portal-container]')).not.toBeNull()
    expect(host.querySelector('[data-toasts-container]')).not.toBeNull()
    // So the tripwire stays silent in the healthy case.
    expect(warn).not.toHaveBeenCalled()

    handle.destroy()
    warn.mockRestore()
  })

  it('injects a single host root with the compiled stylesheet and tears down cleanly', () => {
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-airside-root]')
    expect(host).not.toBeNull()
    const style = host?.querySelector('[data-airside-style]')
    // Prefixed Tailwind output is present (proves the CSS pipeline ran).
    expect(style?.textContent).toContain('air')
    // The widget rendered its logged-out entry point (the Log In button) inside the host.
    expect(host?.querySelector('[data-testid="comments-login"]')).not.toBeNull()

    handle.destroy()
    expect(document.querySelector('[data-airside-root]')).toBeNull()
  })
})
