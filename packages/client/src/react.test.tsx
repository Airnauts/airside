import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CommentsLayer, packageName } from './react'

describe('@comments/client/react', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    history.replaceState({}, '', '/?comments-key=secret')
  })
  afterEach(() => history.replaceState({}, '', '/'))

  it('exposes its subpath package name', () => {
    expect(packageName).toBe('@comments/client/react')
  })

  it('mounts the widget on render and removes it on unmount', async () => {
    const { unmount } = render(<CommentsLayer commentsKey="secret" endpoint="http://x" />)
    // init() is async; wait for the mount to land.
    await waitFor(() => expect(document.querySelector('[data-comments-root]')).not.toBeNull())
    unmount()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
