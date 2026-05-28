import { describe, expect, it } from 'vitest'
import type { Signals } from '../schemas/anchor'
import { scoreCandidate } from './score'
import { DEFAULT_WEIGHTS } from './weights'

const base: Signals = {
  tag: 'button',
  classes: [],
  siblingIndex: 0,
  ancestorTrail: [],
}

describe('scoreCandidate — tag exclusion', () => {
  it('returns total=0 and excluded=tagMismatch when tags differ', () => {
    const r = scoreCandidate(base, { ...base, tag: 'div' })
    expect(r.excluded).toBe('tagMismatch')
    expect(r.total).toBe(0)
    expect(r.components.role).toBe(0)
  })
  it('compares tags case-insensitively', () => {
    const r = scoreCandidate({ ...base, tag: 'BUTTON' }, { ...base, tag: 'button' })
    expect(r.excluded).toBe(false)
  })
})

describe('scoreCandidate — role component', () => {
  it('returns 1 when roles match', () => {
    const r = scoreCandidate({ ...base, role: 'button' }, { ...base, role: 'button' })
    expect(r.components.role).toBe(1)
  })
  it('returns 0 when roles differ', () => {
    const r = scoreCandidate({ ...base, role: 'button' }, { ...base, role: 'link' })
    expect(r.components.role).toBe(0)
  })
  it('returns 0 when both roles are missing', () => {
    const r = scoreCandidate(base, base)
    expect(r.components.role).toBe(0)
  })
})

describe('scoreCandidate — classes component', () => {
  it('returns 1 when class sets are identical', () => {
    const r = scoreCandidate(
      { ...base, classes: ['btn', 'primary'] },
      { ...base, classes: ['primary', 'btn'] },
    )
    expect(r.components.classes).toBe(1)
  })
  it('returns 0 when class sets are disjoint', () => {
    const r = scoreCandidate({ ...base, classes: ['btn'] }, { ...base, classes: ['link'] })
    expect(r.components.classes).toBe(0)
  })
  it('returns Jaccard fraction for partial overlap', () => {
    const r = scoreCandidate({ ...base, classes: ['a', 'b'] }, { ...base, classes: ['b', 'c'] })
    // intersection {b} = 1, union {a,b,c} = 3 → 1/3
    expect(r.components.classes).toBeCloseTo(1 / 3, 10)
  })
  it('returns 0 when both sets are empty', () => {
    const r = scoreCandidate(base, base)
    expect(r.components.classes).toBe(0)
  })
})

describe('scoreCandidate — sibling component', () => {
  it('returns 1 when indices match', () => {
    const r = scoreCandidate({ ...base, siblingIndex: 3 }, { ...base, siblingIndex: 3 })
    expect(r.components.sibling).toBe(1)
  })
  it('returns 0.5 when off by one', () => {
    const r = scoreCandidate({ ...base, siblingIndex: 3 }, { ...base, siblingIndex: 4 })
    expect(r.components.sibling).toBe(0.5)
  })
  it('decays with distance', () => {
    const r = scoreCandidate({ ...base, siblingIndex: 0 }, { ...base, siblingIndex: 9 })
    expect(r.components.sibling).toBeCloseTo(1 / 10, 10)
  })
})

describe('scoreCandidate — ancestor component', () => {
  it('returns 1 when trails are identical (order-insensitive)', () => {
    const r = scoreCandidate(
      { ...base, ancestorTrail: ['main', 'section#hero'] },
      { ...base, ancestorTrail: ['section#hero', 'main'] },
    )
    expect(r.components.ancestor).toBe(1)
  })
  it('returns Jaccard for partial trail overlap', () => {
    const r = scoreCandidate(
      { ...base, ancestorTrail: ['main', 'section'] },
      { ...base, ancestorTrail: ['main', 'article'] },
    )
    // {main} / {main,section,article} = 1/3
    expect(r.components.ancestor).toBeCloseTo(1 / 3, 10)
  })
  it('returns 0 when both trails are empty', () => {
    const r = scoreCandidate(base, base)
    expect(r.components.ancestor).toBe(0)
  })
})

describe('scoreCandidate — text component', () => {
  it('returns 1 for identical snippets', () => {
    const r = scoreCandidate(
      { ...base, textSnippet: 'Sign in' },
      { ...base, textSnippet: 'Sign in' },
    )
    expect(r.components.text).toBe(1)
  })
  it('returns 0 for disjoint bigram sets', () => {
    const r = scoreCandidate({ ...base, textSnippet: 'ab' }, { ...base, textSnippet: 'xy' })
    expect(r.components.text).toBe(0)
  })
  it('returns 0 when both snippets are missing', () => {
    const r = scoreCandidate(base, base)
    expect(r.components.text).toBe(0)
  })
  it('returns a Dice value strictly between 0 and 1 for similar but different text', () => {
    const r = scoreCandidate(
      { ...base, textSnippet: 'Sign in' },
      { ...base, textSnippet: 'Sign up' },
    )
    expect(r.components.text).toBeGreaterThan(0)
    expect(r.components.text).toBeLessThan(1)
  })
  it('handles short strings without crashing (pads to length ≥ 2)', () => {
    const r = scoreCandidate({ ...base, textSnippet: 'a' }, { ...base, textSnippet: 'a' })
    expect(r.components.text).toBe(1)
  })
})

describe('scoreCandidate — stableAttrs component', () => {
  it('returns 1 when all stored stableAttrs match exactly', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { id: 'header', 'data-testid': 'cta' } },
      { ...base, stableAttrs: { id: 'header', 'data-testid': 'cta' } },
    )
    expect(r.components.stableAttrs).toBe(1)
  })
  it('returns 0 when stored has no stableAttrs', () => {
    const r = scoreCandidate(base, { ...base, stableAttrs: { id: 'x' } })
    expect(r.components.stableAttrs).toBe(0)
  })
  it('normalizes by stored priority budget: id-only match when both id+data-testid stored → 0.5 / (0.5+0.3) = 0.625', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { id: 'header', 'data-testid': 'cta' } },
      { ...base, stableAttrs: { id: 'header' } },
    )
    expect(r.components.stableAttrs).toBeCloseTo(0.625, 10)
  })
  it('normalizes: data-testid-only match when both id+data-testid stored → 0.3 / 0.8 = 0.375', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { id: 'header', 'data-testid': 'cta' } },
      { ...base, stableAttrs: { 'data-testid': 'cta' } },
    )
    expect(r.components.stableAttrs).toBeCloseTo(0.375, 10)
  })
  it('shares the data-* budget evenly: stored {data-a, data-b}, only data-a matches → 0.5', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { 'data-a': '1', 'data-b': '2' } },
      { ...base, stableAttrs: { 'data-a': '1' } },
    )
    // priorities: data-a = data-b = 0.2/2 = 0.1; max = 0.2; raw = 0.1; normalized = 0.5
    expect(r.components.stableAttrs).toBeCloseTo(0.5, 10)
  })
  it('full match returns 1.0 regardless of which mix of attrs is stored', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { 'data-x': 'v' } },
      { ...base, stableAttrs: { 'data-x': 'v' } },
    )
    expect(r.components.stableAttrs).toBe(1)
  })
  it('returns 0 when values differ', () => {
    const r = scoreCandidate(
      { ...base, stableAttrs: { id: 'header' } },
      { ...base, stableAttrs: { id: 'footer' } },
    )
    expect(r.components.stableAttrs).toBe(0)
  })
})

describe('scoreCandidate — weighted total', () => {
  it('total equals Σ(weight × component)', () => {
    const stored: Signals = {
      tag: 'div',
      role: 'main',
      textSnippet: 'hello',
      classes: ['x'],
      siblingIndex: 0,
      ancestorTrail: ['body'],
      stableAttrs: { id: 'one' },
    }
    const r = scoreCandidate(stored, stored)
    // identical → every component is 1 → total is the sum of all weights (= 1.0)
    expect(r.components).toEqual({
      stableAttrs: 1,
      text: 1,
      classes: 1,
      role: 1,
      sibling: 1,
      ancestor: 1,
    })
    const expected =
      DEFAULT_WEIGHTS.stableAttrs +
      DEFAULT_WEIGHTS.text +
      DEFAULT_WEIGHTS.classes +
      DEFAULT_WEIGHTS.role +
      DEFAULT_WEIGHTS.sibling +
      DEFAULT_WEIGHTS.ancestor
    expect(r.total).toBeCloseTo(expected, 10)
  })
})
