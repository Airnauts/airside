import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from './mount'

describe('mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('injects a single host root with the compiled stylesheet and tears down cleanly', () => {
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-comments-root]')
    expect(host).not.toBeNull()
    const style = host?.querySelector('[data-comments-style]')
    // Prefixed Tailwind output is present (proves the CSS pipeline ran).
    expect(style?.textContent).toContain('cmnt')
    // The place button rendered inside the host.
    expect(host?.querySelector('[data-comments-place]')).not.toBeNull()

    handle.destroy()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
