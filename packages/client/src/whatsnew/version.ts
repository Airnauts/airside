// packages/client/src/whatsnew/version.ts

import { HIGHLIGHTS, type Highlight } from './highlights'

/**
 * Numeric-tuple semver compare: split on `.`, compare segments as numbers, so `0.10.0`
 * orders after `0.9.1`. Returns negative when `a < b`, positive when `a > b`, `0` when equal.
 * We never ship pre-release tags, so no tag handling is needed.
 */
export function compareVersions(a: string, b: string): number {
  const as = a.split('.').map(Number)
  const bs = b.split('.').map(Number)
  const length = Math.max(as.length, bs.length)
  for (let i = 0; i < length; i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** The highlights (newest-first) strictly newer than `lastSeen`. Returns `[]` when `lastSeen`
 *  is `null` — the never-seeded case is handled by the provider's silent-seed path, never by
 *  showing every historical entry. */
export function entriesNewerThan(
  lastSeen: string | null,
  list: Highlight[] = HIGHLIGHTS,
): Highlight[] {
  if (lastSeen === null) return []
  return list.filter((entry) => compareVersions(entry.version, lastSeen) > 0)
}

/** The latest announced version — the first (newest) entry's version, or `null` on an
 *  empty list (which the highlights invariant test forbids in practice). */
export function latestVersion(list: Highlight[] = HIGHLIGHTS): string | null {
  return list[0]?.version ?? null
}
