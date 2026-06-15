---
"@airnauts/comments-client": patch
---

Internal restructure of the widget: identity now flows through a React context
instead of per-component props, and the composer/panel/marker surfaces are split
into smaller units. Also fixes unnecessary re-renders of comment surfaces whenever
the identity modal toggled. Widget behavior and the public `init` API are unchanged.
