import { describe, expect, it } from 'vitest'
import { AirsideLayer } from './client'

describe('@airnauts/airside-integration-next/client', () => {
  it('re-exports AirsideLayer', () => {
    expect(typeof AirsideLayer).toBe('function')
  })
})
