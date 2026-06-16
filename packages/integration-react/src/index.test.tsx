import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AirsideLayer, packageName } from './index'

describe('@airnauts/airside-integration-react', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    history.replaceState({}, '', '/?airside-key=secret')
  })
  afterEach(() => history.replaceState({}, '', '/'))

  it('exposes its package name', () => {
    expect(packageName).toBe('@airnauts/airside-integration-react')
  })

  it('mounts the widget on render and removes it on unmount', async () => {
    const { unmount } = render(<AirsideLayer airsideKey="secret" endpoint="http://x" />)
    // init() is async; wait for the mount to land.
    await waitFor(() => expect(document.querySelector('[data-airside-root]')).not.toBeNull())
    unmount()
    expect(document.querySelector('[data-airside-root]')).toBeNull()
  })
})
