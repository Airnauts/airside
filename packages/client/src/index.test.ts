import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@airnauts/comments-client', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@airnauts/comments-client')
  })

  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object')
  })
})
