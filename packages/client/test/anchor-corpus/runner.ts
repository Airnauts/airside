import type { Decision } from '@comments/core'
import { decide, locateQuote, scoreCandidate } from '@comments/core'
import { extractSignals } from '../../src/anchor/extract'
import { findCandidates } from '../../src/anchor/rematch'

export { findCandidates } from '../../src/anchor/rematch'

import type { AnchorFixture } from './types'

export function parseBody(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return doc.body
}

// Produces the selector returned as winnerSelector by runFixture.
// Fixtures' expected.targetInAfter must match this form exactly: prefers id, then data-testid,
// then bare tag (if only-of-type within parent), else nth-of-type. The selector is not globally
// unique — fixture HTML should be authored so this form is unambiguous within the after-DOM.
function cssSelectorFor(el: Element): string {
  if (el.id) return `#${el.id}`
  const testid = el.getAttribute('data-testid')
  if (testid) return `[data-testid="${testid}"]`
  // last-resort: tag + nth-of-type within parent
  const parent = el.parentElement
  if (!parent) return el.tagName.toLowerCase()
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName)
  if (sameTag.length === 1) return el.tagName.toLowerCase()
  const idx = sameTag.indexOf(el) + 1
  return `${el.tagName.toLowerCase()}:nth-of-type(${idx})`
}

export type FixtureResult =
  | { kind: 'anchored'; winnerSelector: string; selectionLost?: boolean }
  | { kind: 'orphaned'; reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }

export function runFixture(fx: AnchorFixture): FixtureResult {
  const beforeBody = parseBody(fx.beforeHtml)
  const target = beforeBody.querySelector(fx.targetInBefore)
  if (!target) throw new Error(`fixture ${fx.name}: targetInBefore not found in beforeHtml`)
  const stored = extractSignals(target)

  const afterBody = parseBody(fx.afterHtml)
  const candidates = findCandidates(afterBody, stored)
  const scored = candidates.map((el) => ({
    ref: el,
    score: scoreCandidate(stored, extractSignals(el)),
  }))
  const decision: Decision<Element> = decide(scored)

  if (decision.kind === 'orphaned') {
    return { kind: 'orphaned', reason: decision.reason }
  }

  let selectionLost: boolean | undefined
  if (fx.selection) {
    const haystack = decision.winner.textContent ?? ''
    selectionLost = locateQuote(haystack, fx.selection) === null
  }
  return {
    kind: 'anchored',
    winnerSelector: cssSelectorFor(decision.winner),
    ...(selectionLost !== undefined ? { selectionLost } : {}),
  }
}
