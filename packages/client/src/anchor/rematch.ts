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
