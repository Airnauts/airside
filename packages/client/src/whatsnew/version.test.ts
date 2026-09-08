import { describe, expect, it } from 'vitest'
import type { Highlight } from './highlights'
import { compareVersions, entriesNewerThan, latestVersion } from './version'

const entry = (version: string): Highlight => ({
  version,
  date: '2026-07-03',
  title: `Release ${version}`,
  items: [`item for ${version}`],
})

// Newest first, matching the HIGHLIGHTS ordering invariant.
const LIST: Highlight[] = [entry('0.10.0'), entry('0.9.1'), entry('0.9.0')]

describe('compareVersions', () => {
  it('orders plain semver segments', () => {
    expect(compareVersions('0.9.0', '0.9.1')).toBeLessThan(0)
    expect(compareVersions('0.9.1', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.9.1', '0.9.1')).toBe(0)
  })

  it('compares segments numerically, not lexically (0.9.1 < 0.10.0)', () => {
    expect(compareVersions('0.9.1', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0)
  })
})

describe('entriesNewerThan', () => {
  it('returns [] for a null last-seen (silent-seed path belongs to the provider)', () => {
    expect(entriesNewerThan(null, LIST)).toEqual([])
  })

  it('returns every newer entry, newest first, for an older last-seen', () => {
    expect(entriesNewerThan('0.9.0', LIST)).toEqual([entry('0.10.0'), entry('0.9.1')])
  })

  it('returns [] when last-seen equals the latest', () => {
    expect(entriesNewerThan('0.10.0', LIST)).toEqual([])
  })

  it('returns [] when last-seen is newer than every entry', () => {
    expect(entriesNewerThan('0.11.0', LIST)).toEqual([])
  })
})

describe('latestVersion', () => {
  it('is the first (newest) entry version', () => {
    expect(latestVersion(LIST)).toBe('0.10.0')
  })

  it('is null on an empty list', () => {
    expect(latestVersion([])).toBeNull()
  })
})
