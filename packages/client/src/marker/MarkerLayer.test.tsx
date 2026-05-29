import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import { MarkerLayer } from './MarkerLayer'

function client() {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads: [], nextCursor: null }),
    createThread: vi.fn().mockResolvedValue({ id: 'new1' }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

const props = (c: ReturnType<typeof client>) => ({
  client: c as never,
  pageKey: 'k',
  pageUrl: 'https://x.test/p',
  identity: { email: 'a@b.c', name: 'A' },
  onNeedIdentity: (resume: (i: { email: string; name: string }) => void) => resume({ email: 'a@b.c', name: 'A' }),
})

describe('MarkerLayer place mode', () => {
  it('enters place mode on + Comment, captures the clicked element, creates a thread', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    const target = document.querySelector('#t') as Element
    fireEvent.click(target, { clientX: 40, clientY: 8 })
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    const body = c.createThread.mock.calls[0][0]
    expect(body.anchor.selectors[1]).toBe('#t')
    expect(body.anchor.offset.fx).toBeCloseTo(0.5)
  })

  it('ESC cancels place mode (a subsequent click does not capture)', async () => {
    document.body.innerHTML = '<main><p id="t">x</p></main>'
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(c.createThread).not.toHaveBeenCalled()
  })
})
