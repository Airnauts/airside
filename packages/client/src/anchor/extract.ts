import type { Signals } from '@comments/core'

const MAX_TEXT_SNIPPET = 120
const MAX_ANCESTOR_TRAIL = 8
const MAX_STABLE_ATTRS = 12

function ancestorLabel(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.getAttribute('id')
  if (id) return `${tag}#${id}`
  const testid = el.getAttribute('data-testid')
  if (testid) return `${tag}[data-testid=${testid}]`
  return tag
}

function buildAncestorTrail(el: Element): string[] {
  const trail: string[] = []
  let cursor: Element | null = el.parentElement
  while (cursor && cursor !== el.ownerDocument?.documentElement) {
    trail.push(ancestorLabel(cursor))
    if (trail.length >= MAX_ANCESTOR_TRAIL) break
    cursor = cursor.parentElement
  }
  return trail
}

function buildStableAttrs(el: Element): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  const id = el.getAttribute('id')
  if (id) out.id = id
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith('data-')) continue
    if (Object.keys(out).length >= MAX_STABLE_ATTRS) break
    out[attr.name] = attr.value
  }
  return Object.keys(out).length === 0 ? undefined : out
}

export function extractSignals(el: Element): Signals {
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role') ?? undefined
  const rawText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const textSnippet = rawText.length > 0 ? rawText.slice(0, MAX_TEXT_SNIPPET) : undefined
  const classes = Array.from(el.classList)
  const siblingIndex = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0
  const ancestorTrail = buildAncestorTrail(el)
  const stableAttrs = buildStableAttrs(el)
  const signals: Signals = { tag, classes, siblingIndex, ancestorTrail }
  if (role !== undefined) signals.role = role
  if (textSnippet !== undefined) signals.textSnippet = textSnippet
  if (stableAttrs !== undefined) signals.stableAttrs = stableAttrs
  return signals
}
