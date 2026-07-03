/**
 * Selectors for DOM that anchoring must treat as if it were not in the document — our own widget plus
 * common host-injected, non-content containers that appear, disappear, and reorder at the `<body>`
 * level (framework streaming placeholders, portal/overlay roots, preview/dev chrome). Counting any of
 * these in `nth-of-type` indices, or scanning them for candidates, makes pins drift to the wrong
 * element or get lost once they mount/unmount (e.g. opening a dropdown, a client-side route change).
 *
 * - `[data-airside-root]`   our widget root + everything under it (launcher, panel, portals, toasts),
 *                           which `mount()` guarantees live inside it.
 * - `[data-floating-ui-portal]`, `[data-radix-portal]`  Floating UI / Radix popovers, menus, tooltips.
 * - `[hidden]`              hidden subtrees (e.g. React streaming `<div hidden>` placeholders) — never
 *                           a visible target you'd pin a comment to.
 * - `next-route-announcer`, `vercel-live-feedback`  Next.js / Vercel injected chrome.
 *
 * Hosts can register their own overlay roots with `addAnchorIgnoreSelectors`.
 */
const ignoreSelectors: string[] = [
  '[data-airside-root]',
  '[data-floating-ui-portal]',
  '[data-radix-portal]',
  '[hidden]',
  'next-route-announcer',
  'vercel-live-feedback',
]

/** Register additional selectors for host containers anchoring should ignore (deduped, additive). */
export function addAnchorIgnoreSelectors(...selectors: string[]): void {
  for (const s of selectors) if (s && !ignoreSelectors.includes(s)) ignoreSelectors.push(s)
}

/** True when a node is, or lives inside, any ignored container — see `ignoreSelectors`. */
export function isIgnoredForAnchoring(node: Node | null | undefined): boolean {
  const el = node && node.nodeType === 1 ? (node as Element) : null
  if (!el) return false
  try {
    return el.closest(ignoreSelectors.join(',')) !== null
  } catch {
    return false // a malformed registered selector must never throw mid-anchor
  }
}

/** Same-tag siblings of `node`, ignoring non-content elements (kept consistent with resolution). */
function liveSameTagSiblings(parent: Element, node: Element): Element[] {
  return Array.from(parent.children).filter(
    (c) => c.tagName === node.tagName && !isIgnoredForAnchoring(c),
  )
}

/** Structural nth-of-type path from the nearest stable ancestor down to el (airside nodes ignored). */
export function structuralSelector(el: Element): string {
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
    // Index over non-airside same-tag siblings — `resolveStructural` counts the same way, so the two
    // stay in lockstep even when our root (or host portals) sit among the siblings.
    const sameTag = liveSameTagSiblings(parent, node)
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
export function stableSelector(el: Element): string {
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

/** Resolve a selector to a single unique Element; null on zero or multiple hits. Airside nodes are
 *  never counted, so a stray match inside our own widget can't block (or masquerade as) a host hit. */
export function resolveUnique(selector: string, root: ParentNode): Element | null {
  let matches: NodeListOf<Element>
  try {
    matches = root.querySelectorAll(selector)
  } catch {
    return null // malformed selector (e.g. stale escaped value) → treat as miss
  }
  const live = Array.from(matches).filter((el) => !isIgnoredForAnchoring(el))
  return live.length === 1 ? (live[0] ?? null) : null
}

/** Parse one structural-path segment: `tag` or `tag:nth-of-type(k)`. */
function parseSegment(seg: string): { tag: string; nth: number | null } {
  const m = seg.match(/^(.+):nth-of-type\((\d+)\)$/)
  if (m?.[1] && m[2]) return { tag: m[1].toLowerCase(), nth: Number(m[2]) }
  return { tag: seg.toLowerCase(), nth: null }
}

/** Resolve a single `>`-segment among `parent`'s non-airside children. */
function resolveSegment(parent: ParentNode, seg: string): Element | null {
  const { tag, nth } = parseSegment(seg)
  const sameTag = Array.from(parent.children).filter(
    (c) => !isIgnoredForAnchoring(c) && c.tagName.toLowerCase() === tag,
  )
  // A bare tag was only emitted when it was sole-of-type; treat re-appearance of a sibling as a miss.
  if (nth == null) return sameTag.length === 1 ? (sameTag[0] ?? null) : null
  return sameTag[nth - 1] ?? null
}

/**
 * Resolve a `structuralSelector` path while ignoring airside-owned nodes — the resolution counterpart
 * to the airside-aware index in `structuralSelector`. Native `:nth-of-type` counts every sibling
 * (including our root and host portals), so it can't be used here; we walk the `>`-chain ourselves,
 * filtering airside at each level. The path is rooted at `<body>` (or at a leading `#id` landmark).
 */
export function resolveStructural(selector: string, root: ParentNode): Element | null {
  if (!selector) return null
  const segments = selector.split(' > ')
  const first = segments[0]
  if (first === undefined) return null
  let cursor: Element | null
  let rest: string[]
  if (first.startsWith('#')) {
    try {
      cursor = root.querySelector(first)
    } catch {
      return null
    }
    rest = segments.slice(1)
  } else {
    // Body-rooted path: resolve the first segment among the body's (or the given root's) children.
    const ctx: ParentNode =
      root.nodeType === 9 ? ((root as Document).body ?? root) : (root as ParentNode)
    cursor = resolveSegment(ctx, first)
    rest = segments.slice(1)
  }
  for (const seg of rest) {
    if (!cursor) return null
    cursor = resolveSegment(cursor, seg)
  }
  return cursor
}
