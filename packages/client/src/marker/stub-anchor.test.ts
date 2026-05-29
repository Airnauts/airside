import { Anchor, ANCHOR_SCHEMA_VERSION } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { makeStubAnchor } from './stub-anchor'

describe('makeStubAnchor', () => {
  it('produces an anchor that parses against the core Anchor schema', () => {
    const parsed = Anchor.safeParse(makeStubAnchor())
    expect(parsed.success).toBe(true)
  })

  it('uses the current write-time schema version and no selection', () => {
    const a = makeStubAnchor()
    expect(a.schemaVersion).toBe(ANCHOR_SCHEMA_VERSION)
    expect(a.selection).toBeUndefined()
  })
})
