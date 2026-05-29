/** Structural nth-of-type path from the nearest stable ancestor down to el. */
function structuralSelector(el: Element): string {
  const parts: string[] = []
  let cursor: Element | null = el
  const root = el.ownerDocument?.documentElement
  const body = el.ownerDocument?.body
  // Stop at <html> and <body> so the path stays short (no leading `body` segment).
  while (cursor && cursor !== root && cursor !== body && cursor.parentElement) {
    // Explicit annotation: `cursor` is reassigned below from a value derived from this copy,
    // so without it TS infers a circular `any` (TS7022). `parent` reads from the narrowed
    // `cursor.parentElement` (non-null by the loop condition) rather than the copy.
    const node: Element = cursor
    const parent: Element = cursor.parentElement
    const tag = node.tagName.toLowerCase()
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName)
    const part = sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})`
    parts.unshift(part)
    // Stop climbing once anchored to an id'd ancestor — keeps the path short and robust.
    if (parent.id) {
      parts.unshift(`#${CSS.escape(parent.id)}`)
      return parts.join(' > ')
    }
    cursor = parent
  }
  return parts.join(' > ')
}

/** Stable, preferentially-unique selector: #id, then [data-testid], then tag.class.class. */
function stableSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`
  const testid = el.getAttribute('data-testid')
  if (testid) return `[data-testid="${CSS.escape(testid)}"]`
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).map((c) => `.${CSS.escape(c)}`)
  return `${tag}${classes.join('')}`
}

/** Dual selectors per architecture §7: [structural nth-of-type path, class path]. */
export function buildSelectors(el: Element): [string, string] {
  return [structuralSelector(el), stableSelector(el)]
}

/** Resolve a selector to a single unique Element; null on zero or multiple hits. */
export function resolveUnique(selector: string, root: ParentNode): Element | null {
  let matches: NodeListOf<Element>
  try {
    matches = root.querySelectorAll(selector)
  } catch {
    return null // malformed selector (e.g. stale escaped value) → treat as miss
  }
  // matches.item(0) is Element | null (matches[0] would be Element | undefined under noUncheckedIndexedAccess).
  return matches.length === 1 ? matches.item(0) : null
}
