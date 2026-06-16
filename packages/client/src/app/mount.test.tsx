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

  it('pins a fixed px font-size on the root so unsized text ignores the host root font-size', () => {
    // `all: revert` on the root would otherwise let it inherit the host <html>
    // font-size (e.g. a responsive `clamp(0.8rem, 1vw, 1rem)`). Every element with
    // no explicit `air:text-*` size — the identity modal's title/description —
    // inherits that, so it scaled with the host. The px-pinned theme tokens only
    // cover utilities that name a token; a fixed px base on the root re-anchors the
    // rest. Mirrors the font-family pin set in the same declaration.
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-airside-root]') as HTMLElement
    expect(host.style.fontSize).toMatch(/^\d+px$/)

    handle.destroy()
  })

  it('injects a single host root with the compiled stylesheet and tears down cleanly', () => {
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-airside-root]')
    expect(host).not.toBeNull()
    const style = host?.querySelector('[data-airside-style]')
    // Prefixed Tailwind output is present (proves the CSS pipeline ran).
    expect(style?.textContent).toContain('air')
    // The widget rendered its logged-out entry point (the Log In button) inside the host.
    expect(host?.querySelector('[data-testid="airside-login"]')).not.toBeNull()

    handle.destroy()
    expect(document.querySelector('[data-airside-root]')).toBeNull()
  })
})
