import { describe, expect, it } from 'vitest'
import { packageName } from './react'

describe('@comments/client/react', () => {
  it('exposes its subpath package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/client/react')
  })
})
