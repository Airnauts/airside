import type { Signals } from '../schemas/anchor'
import { DEFAULT_WEIGHTS, type WeightKey } from './weights'

export type ScoreComponents = Record<WeightKey, number>

export type ScoreResult = {
  total: number
  components: ScoreComponents
  excluded: false | 'tagMismatch'
}

const ZERO_COMPONENTS: ScoreComponents = {
  stableAttrs: 0,
  text: 0,
  classes: 0,
  role: 0,
  sibling: 0,
  ancestor: 0,
}

export function scoreCandidate(stored: Signals, candidate: Signals): ScoreResult {
  if (stored.tag.toLowerCase() !== candidate.tag.toLowerCase()) {
    return { total: 0, components: { ...ZERO_COMPONENTS }, excluded: 'tagMismatch' }
  }
  const components: ScoreComponents = {
    stableAttrs: scoreStableAttrs(stored.stableAttrs, candidate.stableAttrs),
    text: scoreText(stored.textSnippet, candidate.textSnippet),
    classes: scoreClasses(stored.classes, candidate.classes),
    role: scoreRole(stored.role, candidate.role),
    sibling: scoreSibling(stored.siblingIndex, candidate.siblingIndex),
    ancestor: scoreAncestor(stored.ancestorTrail, candidate.ancestorTrail),
  }
  const total =
    components.stableAttrs * DEFAULT_WEIGHTS.stableAttrs +
    components.text * DEFAULT_WEIGHTS.text +
    components.classes * DEFAULT_WEIGHTS.classes +
    components.role * DEFAULT_WEIGHTS.role +
    components.sibling * DEFAULT_WEIGHTS.sibling +
    components.ancestor * DEFAULT_WEIGHTS.ancestor
  return { total, components, excluded: false }
}

function priorityOf(key: string, otherCount: number): number {
  if (key === 'id') return 0.5
  if (key === 'data-testid') return 0.3
  if (key.startsWith('data-')) return otherCount > 0 ? 0.2 / otherCount : 0
  return 0
}

function scoreStableAttrs(
  stored: Record<string, string> | undefined,
  candidate: Record<string, string> | undefined,
): number {
  if (!stored) return 0
  const keys = Object.keys(stored)
  if (keys.length === 0) return 0
  const otherCount = keys.filter((k) => k.startsWith('data-') && k !== 'data-testid').length
  let max = 0
  let raw = 0
  for (const k of keys) {
    const p = priorityOf(k, otherCount)
    max += p
    const storedValue = stored[k]
    if (storedValue !== undefined && candidate?.[k] === storedValue) {
      raw += p
    }
  }
  return max === 0 ? 0 : raw / max
}
function scoreText(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0
  const aPad = a.length < 2 ? `${a} ` : a
  const bPad = b.length < 2 ? `${b} ` : b
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const ba = bigrams(aPad)
  const bb = bigrams(bPad)
  let inter = 0
  for (const [g, n] of ba) {
    const m = bb.get(g)
    if (m !== undefined) inter += Math.min(n, m)
  }
  const totalA = Array.from(ba.values()).reduce((s, n) => s + n, 0)
  const totalB = Array.from(bb.values()).reduce((s, n) => s + n, 0)
  return totalA + totalB === 0 ? 0 : (2 * inter) / (totalA + totalB)
}
function scoreClasses(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let inter = 0
  for (const x of setA) if (setB.has(x)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}
function scoreRole(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0
  return a === b ? 1 : 0
}
function scoreSibling(a: number, b: number): number {
  return 1 / (1 + Math.abs(a - b))
}
function scoreAncestor(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let inter = 0
  for (const x of setA) if (setB.has(x)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}
