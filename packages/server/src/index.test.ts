import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/server', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/server')
  })
})
