import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/storage-fs', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/storage-fs')
  })
})
