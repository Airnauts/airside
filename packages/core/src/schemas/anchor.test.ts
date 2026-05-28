import { describe, expect, it } from 'vitest'
import { ANCHOR_SCHEMA_VERSION, Anchor, Signals } from './anchor'

const validSignals = {
  tag: 'button',
  classes: ['flex', 'btn'],
  siblingIndex: 2,
  ancestorTrail: ['main', 'section'],
}

const validAnchor = {
  schemaVersion: ANCHOR_SCHEMA_VERSION,
  selectors: ['body>div:nth-of-type(9)>div', 'body>div.flex>div.flex'] as [string, string],
  signals: validSignals,
  offset: { fx: 0.36, fy: 0.39 },
}

describe('Anchor schema', () => {
  it('parses a valid element anchor', () => {
    expect(Anchor.parse(validAnchor).offset.fx).toBe(0.36)
  })
  it('parses an anchor with an optional selection', () => {
    const withSelection = {
      ...validAnchor,
      offset: { fx: 0, fy: 0 },
      selection: {
        start: { selectors: ['a', 'a.x'] as [string, string], textNodeIndex: 0, offset: 0 },
        end: { selectors: ['a', 'a.x'] as [string, string], textNodeIndex: 0, offset: 6 },
        quote: 'METRIC',
        prefix: '',
        suffix: '',
      },
    }
    expect(Anchor.parse(withSelection).selection?.quote).toBe('METRIC')
  })
  it('rejects an offset outside 0..1', () => {
    expect(() => Anchor.parse({ ...validAnchor, offset: { fx: 1.5, fy: 0 } })).toThrow()
  })
  it('rejects a negative offset', () => {
    expect(() => Anchor.parse({ ...validAnchor, offset: { fx: -0.1, fy: 0 } })).toThrow()
  })
  it('rejects missing signals', () => {
    expect(() => Signals.parse({ tag: 'div' })).toThrow()
  })
  it('rejects a textSnippet over 120 chars', () => {
    expect(() => Signals.parse({ ...validSignals, textSnippet: 'a'.repeat(121) })).toThrow()
  })
  it('rejects a negative siblingIndex', () => {
    expect(() => Signals.parse({ ...validSignals, siblingIndex: -1 })).toThrow()
  })
  it('parses Signals with optional stableAttrs', () => {
    const s = Signals.parse({
      ...validSignals,
      stableAttrs: { id: 'header', 'data-testid': 'cta' },
    })
    expect(s.stableAttrs?.id).toBe('header')
    expect(s.stableAttrs?.['data-testid']).toBe('cta')
  })
  it('tolerates Signals without stableAttrs (backward compatible)', () => {
    const s = Signals.parse(validSignals)
    expect(s.stableAttrs).toBeUndefined()
  })
  it('rejects stableAttrs whose values are not strings', () => {
    expect(() => Signals.parse({ ...validSignals, stableAttrs: { id: 123 } })).toThrow()
  })
})
