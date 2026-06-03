---
"@airnauts/comments-client": patch
---

Emit the widget's Tailwind utilities un-layered so a host's un-layered reset or Preflight can't override them. The widget embeds into the host's light DOM, and most hosts ship an un-layered reset (every Tailwind v3 app, Normalize, reset.css). Because un-layered author rules beat layered ones regardless of specificity, the previous `@layer utilities` wrapping let the host's `button { … }` / `*,::before,::after { … }` reset strip the widget's borders, radii, and padding — leaving buttons unstyled in hosts like a Tailwind v3 app. Utilities are now un-layered; their `cmnt:`-prefixed selectors win on specificity and still cannot leak onto the host page (ADR-0025).
