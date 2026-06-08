import { describe, expect, it } from 'vitest'
// `pnpm test` runs `build:css` first, regenerating this module from widget.css.
import { widgetCss } from './widget-css.generated'

// Regression guard for ADR-0025. The widget embeds into the host's light DOM, and
// most hosts ship an UN-layered reset/Preflight (every Tailwind v3 app, Normalize,
// reset.css, …). A normal un-layered author rule beats any normal *layered* author
// rule regardless of specificity, so if our utilities are wrapped in
// `@layer utilities` the host's `button { … }` / `*,::before,::after { … }` reset
// silently strips our borders, radii, and padding. They must stay un-layered.
describe('widget.css cascade-layer policy (ADR-0025)', () => {
  it('emits utilities (so the build actually produced them)', () => {
    expect(widgetCss).toContain('.cmnt\\:rounded-full')
  })

  it('does NOT wrap utilities in @layer utilities', () => {
    expect(widgetCss).not.toMatch(/@layer\s+utilities/i)
  })

  it('keeps theme vars and scoped resets layered (below the un-layered utilities)', () => {
    expect(widgetCss).toMatch(/@layer\s+theme/i)
    expect(widgetCss).toMatch(/@layer\s+base/i)
  })
})

// The widget embeds into the host's light DOM, where `rem` ALWAYS resolves against the
// host's <html> font-size. A host that scales its root font-size responsively (e.g.
// `html { font-size: clamp(0.8rem, 1vw, 1rem); }`) would stretch every rem-based token —
// drifting the pin internals and ballooning the chrome. We override the theme tokens to
// px in widget.css so the widget is independent of the host root font-size. This guard
// fails if any `rem` survives into the generated CSS (e.g. a new utility pulling in an
// un-overridden rem token) — add the missing token to the `@theme` block in widget.css.
describe('host-font-size independence', () => {
  it('emits NO rem units (tokens are pinned to px)', () => {
    expect(widgetCss).not.toMatch(/rem/)
  })
})
