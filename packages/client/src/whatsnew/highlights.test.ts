import { describe, expect, it } from 'vitest'
import { HIGHLIGHTS } from './highlights'
import { compareVersions } from './version'

// Invariant guard for the hand-curated content file: the provider derives the "latest
// announced version" from HIGHLIGHTS[0], so ordering and shape are load-bearing. There is
// deliberately no package.json equality check — the entry for a release is added before
// `pnpm version-packages` bumps versions, so they diverge transiently in normal dev.
describe('HIGHLIGHTS invariants', () => {
  it('is non-empty', () => {
    expect(HIGHLIGHTS.length).toBeGreaterThan(0)
  })

  it('has unique, strictly descending versions (newest first)', () => {
    for (let i = 1; i < HIGHLIGHTS.length; i++) {
      expect(
        compareVersions(HIGHLIGHTS[i - 1].version, HIGHLIGHTS[i].version),
        `${HIGHLIGHTS[i - 1].version} must be newer than ${HIGHLIGHTS[i].version}`,
      ).toBeGreaterThan(0)
    }
  })

  it('has well-formed entries', () => {
    for (const entry of HIGHLIGHTS) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.title.trim()).not.toBe('')
      expect(entry.items.length).toBeGreaterThan(0)
      for (const item of entry.items) {
        expect(typeof item).toBe('string')
        expect(item.trim()).not.toBe('')
      }
    }
  })
})
