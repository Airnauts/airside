import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'

/**
 * A minimal, schema-valid anchor for the M5 placeholder marker. It is NOT a real
 * fingerprint — real DOM capture (from `src/anchor/extract.ts`) is wired in M6.
 */
export function makeStubAnchor(): Anchor {
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: ['body', 'body'],
    signals: { tag: 'body', classes: [], siblingIndex: 0, ancestorTrail: [] },
    offset: { fx: 0.5, fy: 0.5 },
  }
}
