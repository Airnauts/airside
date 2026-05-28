import type { ScoreResult } from './score'
import { DEFAULT_THRESHOLDS, type Thresholds } from './weights'

export type Decision<T> =
  | { kind: 'anchored'; winner: T; score: ScoreResult }
  | {
      kind: 'orphaned'
      reason: 'noCandidates' | 'belowAccept' | 'ambiguous'
    }

export function decide<T>(
  scored: Array<{ ref: T; score: ScoreResult }>,
  opts?: Partial<Thresholds>,
): Decision<T> {
  const accept = opts?.accept ?? DEFAULT_THRESHOLDS.accept
  const margin = opts?.margin ?? DEFAULT_THRESHOLDS.margin
  const survivors = scored
    .filter((s) => s.score.excluded !== 'tagMismatch')
    .sort((a, b) => b.score.total - a.score.total)
  const best = survivors[0]
  if (!best) return { kind: 'orphaned', reason: 'noCandidates' }
  if (best.score.total < accept) return { kind: 'orphaned', reason: 'belowAccept' }
  const second = survivors[1]
  if (second && best.score.total - second.score.total < margin) {
    return { kind: 'orphaned', reason: 'ambiguous' }
  }
  return { kind: 'anchored', winner: best.ref, score: best.score }
}
