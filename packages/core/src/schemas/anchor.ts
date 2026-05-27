import { z } from 'zod'

export const ANCHOR_SCHEMA_VERSION = 1

const Selectors = z.tuple([z.string(), z.string()])

export const Signals = z
  .object({
    tag: z.string(),
    role: z.string().optional(),
    textSnippet: z.string().max(120).optional(),
    classes: z.array(z.string()),
    siblingIndex: z.number().int().nonnegative(),
    ancestorTrail: z.array(z.string()),
  })
  .meta({ id: 'Signals' })
export type Signals = z.infer<typeof Signals>

const SelectionEndpoint = z.object({
  selectors: Selectors,
  textNodeIndex: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
})

export const Selection = z
  .object({
    start: SelectionEndpoint,
    end: SelectionEndpoint,
    quote: z.string(),
    prefix: z.string(),
    suffix: z.string(),
  })
  .meta({ id: 'Selection' })
export type Selection = z.infer<typeof Selection>

export const Anchor = z
  .object({
    // Positive int (not z.literal(ANCHOR_SCHEMA_VERSION)) so anchors written under a future
    // schema version still parse (forward-compatible reads); ANCHOR_SCHEMA_VERSION is the write-time default.
    schemaVersion: z.number().int().positive(),
    selectors: Selectors,
    signals: Signals,
    offset: z.object({ fx: z.number().min(0).max(1), fy: z.number().min(0).max(1) }),
    selection: Selection.optional(),
  })
  .meta({ id: 'Anchor' })
export type Anchor = z.infer<typeof Anchor>
