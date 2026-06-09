import { z } from 'zod'

export const Email = z.email().meta({ id: 'Email' })
export type Email = z.infer<typeof Email>

// A page URL restricted to http(s). Rejects javascript:, data:, etc. so any link
// built from it server-side (notification deep-links) cannot carry an active scheme.
// Left inline (no component id) so the wire contract still emits a plain URL string.
export const HttpUrl = z.url({ protocol: /^https?$/ })
export type HttpUrl = z.infer<typeof HttpUrl>

export const IsoTimestamp = z.iso.datetime().meta({ id: 'IsoTimestamp' })
export type IsoTimestamp = z.infer<typeof IsoTimestamp>

// Opaque pagination token — intentionally NOT registered as a named component
// (the spec treats the cursor as an opaque string; its codec lives server-side in M3).
export const Cursor = z.string().min(1)
export type Cursor = z.infer<typeof Cursor>
