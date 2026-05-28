import { describe, expect, it } from 'vitest'
import { decide } from './decide'
import type { ScoreResult } from './score'

const mkScore = (total: number, excluded: ScoreResult['excluded'] = false): ScoreResult => ({
  total,
  components: {
    stableAttrs: 0,
    text: 0,
    classes: 0,
    role: 0,
    sibling: 0,
    ancestor: 0,
  },
  excluded,
})

describe('decide', () => {
  it('orphans with noCandidates when input is empty', () => {
    const r = decide([])
    expect(r).toEqual({ kind: 'orphaned', reason: 'noCandidates' })
  })
  it('orphans with noCandidates when every candidate is tag-excluded', () => {
    const r = decide([{ ref: 'a', score: mkScore(0, 'tagMismatch') }])
    expect(r).toEqual({ kind: 'orphaned', reason: 'noCandidates' })
  })
  it('orphans with belowAccept when best total < default 0.60', () => {
    const r = decide([{ ref: 'a', score: mkScore(0.5) }])
    expect(r).toEqual({ kind: 'orphaned', reason: 'belowAccept' })
  })
  it('anchors when a single candidate clears accept', () => {
    const r = decide([{ ref: 'a', score: mkScore(0.7) }])
    expect(r.kind).toBe('anchored')
    if (r.kind === 'anchored') {
      expect(r.winner).toBe('a')
      expect(r.score.total).toBe(0.7)
    }
  })
  it('orphans with ambiguous when best beats second by less than default 0.10', () => {
    const r = decide([
      { ref: 'a', score: mkScore(0.7) },
      { ref: 'b', score: mkScore(0.65) },
    ])
    expect(r).toEqual({ kind: 'orphaned', reason: 'ambiguous' })
  })
  it('orphans with ambiguous on an exact tie at the top', () => {
    const r = decide([
      { ref: 'a', score: mkScore(0.7) },
      { ref: 'b', score: mkScore(0.7) },
    ])
    expect(r).toEqual({ kind: 'orphaned', reason: 'ambiguous' })
  })
  it('anchors the best when margin is met', () => {
    const r = decide([
      { ref: 'a', score: mkScore(0.8) },
      { ref: 'b', score: mkScore(0.65) },
    ])
    expect(r.kind).toBe('anchored')
    if (r.kind === 'anchored') expect(r.winner).toBe('a')
  })
  it('returns belowAccept (not ambiguous) when even the best is below accept', () => {
    const r = decide([
      { ref: 'a', score: mkScore(0.5) },
      { ref: 'b', score: mkScore(0.49) },
    ])
    expect(r).toEqual({ kind: 'orphaned', reason: 'belowAccept' })
  })
  it('accepts custom thresholds', () => {
    const r = decide([{ ref: 'a', score: mkScore(0.55) }], { accept: 0.5, margin: 0.1 })
    expect(r.kind).toBe('anchored')
  })
})
