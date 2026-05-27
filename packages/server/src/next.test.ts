import { describe, expect, it } from 'vitest'
import { packageName } from './next'

describe('@comments/server/next', () => {
  it('exposes its subpath package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/server/next')
  })
})
