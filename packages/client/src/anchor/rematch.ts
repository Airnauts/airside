import type { Anchor, Signals } from '@airnauts/comments-core'
import {
  DEFAULT_THRESHOLDS,
  decide,
  locateQuote,
  type ScoreComponents,
  scoreCandidate,
} from '@airnauts/comments-core'
import { extractSignals } from './extract'
import { buildSelectors, resolveUnique } from './selectors'

// Label format emitted by extractSignals.ancestorLabel: 'tag', 'tag#id', or 'tag[data-testid=v]'.
// These forms are mutually exclusive; id takes priority so the combined form is never produced.
function parseAncestorLabel(label: string): { tag: string; id?: string; testid?: string } {
  const hash = label.indexOf('#')
  if (hash >= 0) return { tag: label.slice(0, hash), id: label.slice(hash + 1) }
  const bracket = label.indexOf('[data-testid=')
  if (bracket >= 0) {
    return {
      tag: label.slice(0, bracket),
      testid: label.slice(bracket + '[data-testid='.length, -1),
    }
  }
  return { tag: label }
}

function findAncestorMatch(root: ParentNode, label: string): Element | null {
  const parsed = parseAncestorLabel(label)
  const candidates = Array.from(root.querySelectorAll(parsed.tag))
  for (const el of candidates) {
    if (parsed.id && el.id === parsed.id) return el
    if (parsed.testid && el.getAttribute('data-testid') === parsed.testid) return el
    if (!parsed.id && !parsed.testid) return el
  }
  return null
}

/** Scope candidates to the nearest surviving ancestor-landmark; fall back to all of the stored tag. */
export function findCandidates(
  root: ParentNode,
  stored: { tag: string; ancestorTrail: string[] },
): Element[] {
  // Walk nearest-first through the stored trail; the first surviving ancestor wins.
  for (const label of stored.ancestorTrail) {
    const ancestor = findAncestorMatch(root, label)
    if (ancestor) {
      return Array.from(ancestor.querySelectorAll(stored.tag))
    }
  }
  // Fall back to all elements of the stored tag.
  return Array.from(root.querySelectorAll(stored.tag))
}

export type Healed = { selectors: [string, string]; signals: Signals }

/** Why an anchor was lost, with the scores that led there — for console diagnostics. */
export type OrphanDiagnostics = {
  candidateCount: number
  thresholds: { accept: number; margin: number }
  stored: { tag: string; selectors: readonly string[] }
  // Top candidates by score, highest first (capped at 3). Empty when noCandidates.
  top: Array<{ total: number; components: ScoreComponents; excluded: false | 'tagMismatch' }>
}

export type RematchResult =
  | { kind: 'anchored'; el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | {
      kind: 'orphaned'
      reason: 'noCandidates' | 'belowAccept' | 'ambiguous'
      diagnostics: OrphanDiagnostics
    }

/** Cheap agreement check for the fast path: same tag and every stored stableAttr present + equal. */
export function signalsAgree(stored: Signals, el: Element): boolean {
  if (stored.tag.toLowerCase() !== el.tagName.toLowerCase()) return false
  for (const [k, v] of Object.entries(stored.stableAttrs ?? {})) {
    const actual = k === 'id' ? el.id : el.getAttribute(k)
    if (actual !== v) return false
  }
  return true
}

function healedFrom(el: Element): Healed {
  return { selectors: buildSelectors(el), signals: extractSignals(el) }
}

function finishMatch(el: Element, anchor: Anchor, healed?: Healed): RematchResult {
  if (!anchor.selection) return { kind: 'anchored', el, healed }
  const offsets = locateQuote(el.textContent ?? '', anchor.selection)
  if (!offsets) return { kind: 'selectionLost', el, healed }
  const range = rangeForOffsets(el, offsets.start, offsets.end)
  return range ? { kind: 'anchored', el, range, healed } : { kind: 'selectionLost', el, healed }
}

/** Map character offsets within el.textContent to a DOM Range across its text nodes. */
function rangeForOffsets(el: Element, start: number, end: number): Range | null {
  const doc = el.ownerDocument
  if (!doc) return null
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  let pos = 0
  let started = false
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.length
    if (!started && pos + len >= start) {
      range.setStart(node, start - pos)
      started = true
    }
    if (started && pos + len >= end) {
      range.setEnd(node, end - pos)
      return range
    }
    pos += len
    node = walker.nextNode() as Text | null
  }
  return started ? range : null
}

export function rematch(anchor: Anchor, root: ParentNode): RematchResult {
  // 1. Fast path: a unique selector hit whose signals agree -> anchored, no scoring, no heal.
  for (const selector of anchor.selectors) {
    const hit = resolveUnique(selector, root)
    if (hit && signalsAgree(anchor.signals, hit)) {
      return finishMatch(hit, anchor)
    }
  }
  // 2. Scored search scoped to the nearest surviving ancestor-landmark.
  const candidates = findCandidates(root, anchor.signals)
  const scored = candidates.map((el) => ({
    ref: el,
    score: scoreCandidate(anchor.signals, extractSignals(el)),
  }))
  const decision = decide(scored)
  if (decision.kind === 'orphaned') {
    const top = [...scored]
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 3)
      .map((s) => ({
        total: s.score.total,
        components: s.score.components,
        excluded: s.score.excluded,
      }))
    return {
      kind: 'orphaned',
      reason: decision.reason,
      diagnostics: {
        candidateCount: scored.length,
        thresholds: { accept: DEFAULT_THRESHOLDS.accept, margin: DEFAULT_THRESHOLDS.margin },
        stored: { tag: anchor.signals.tag, selectors: anchor.selectors },
        top,
      },
    }
  }
  // 3. Matched via scoring -> fingerprint drifted -> emit a heal payload.
  return finishMatch(decision.winner, anchor, healedFrom(decision.winner))
}
