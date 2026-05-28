export type QuoteContext = { quote: string; prefix: string; suffix: string }
export type QuoteOffsets = { start: number; end: number }

/**
 * Build a normalized copy of `s` along with a map from normalized index → original index.
 * Normalization collapses runs of whitespace to a single space and trims; leading
 * whitespace that gets dropped is mapped through so callers can recover original offsets.
 */
function normalizeWithMap(s: string): { normalized: string; toOriginal: number[] } {
  const toOriginal: number[] = []
  let out = ''
  let prevSpace = true // collapse leading whitespace
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string
    const isWs = /\s/.test(ch)
    if (isWs) {
      if (prevSpace) continue
      out += ' '
      toOriginal.push(i)
      prevSpace = true
    } else {
      out += ch
      toOriginal.push(i)
      prevSpace = false
    }
  }
  // trim trailing space
  if (out.endsWith(' ')) {
    out = out.slice(0, -1)
    toOriginal.pop()
  }
  return { normalized: out, toOriginal }
}

function normalizeNeedle(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function originalRange(
  toOriginal: number[],
  normStart: number,
  normLen: number,
  haystackLen: number,
): QuoteOffsets {
  const start = toOriginal[normStart] ?? haystackLen
  // The end offset in the original is the index *after* the last matched normalized char.
  const lastIdx = normStart + normLen - 1
  const lastOriginal = toOriginal[lastIdx] ?? haystackLen - 1
  return { start, end: lastOriginal + 1 }
}

function indexOfUnique(haystack: string, needle: string): number | null {
  if (needle.length === 0) return null
  const first = haystack.indexOf(needle)
  if (first < 0) return null
  if (haystack.indexOf(needle, first + 1) >= 0) return null
  return first
}

export function locateQuote(haystack: string, ctx: QuoteContext): QuoteOffsets | null {
  if (ctx.quote.length === 0) return null
  const { normalized, toOriginal } = normalizeWithMap(haystack)
  const nQuote = normalizeNeedle(ctx.quote)
  const nPrefix = normalizeNeedle(ctx.prefix)
  const nSuffix = normalizeNeedle(ctx.suffix)
  if (nQuote.length === 0) return null

  // Strategy 1: exact prefix+quote+suffix.
  if (nPrefix || nSuffix) {
    const composite = `${nPrefix}${nPrefix ? ' ' : ''}${nQuote}${nSuffix ? ' ' : ''}${nSuffix}`
    const idx = indexOfUnique(normalized, composite)
    if (idx !== null) {
      const offset = idx + nPrefix.length + (nPrefix ? 1 : 0)
      return originalRange(toOriginal, offset, nQuote.length, haystack.length)
    }
  }

  // Strategy 2: unique quote.
  const qIdx = indexOfUnique(normalized, nQuote)
  if (qIdx !== null) {
    return originalRange(toOriginal, qIdx, nQuote.length, haystack.length)
  }

  // Strategy 3: prefix+quote unique.
  if (nPrefix) {
    const composite = `${nPrefix} ${nQuote}`
    const idx = indexOfUnique(normalized, composite)
    if (idx !== null) {
      return originalRange(toOriginal, idx + nPrefix.length + 1, nQuote.length, haystack.length)
    }
  }

  // Strategy 4: quote+suffix unique.
  if (nSuffix) {
    const composite = `${nQuote} ${nSuffix}`
    const idx = indexOfUnique(normalized, composite)
    if (idx !== null) {
      return originalRange(toOriginal, idx, nQuote.length, haystack.length)
    }
  }

  return null
}
