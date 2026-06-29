---
'@airnauts/airside-client': patch
---

Anchoring now ignores non-content DOM when building and resolving element selectors, fixing comment pins that drifted to the wrong element (or were lost) on single-page-app hosts. The widget's own root (`[data-airside-root]`) and common host-injected overlay containers — Floating UI / Radix portals, `[hidden]` streaming placeholders, and framework chrome like `next-route-announcer` / `vercel-live-feedback` — are `<body>`-level siblings of the page content, so counting them in `nth-of-type` indices made the structural path point at the wrong place once they mounted, unmounted, or reordered (opening a dropdown, a client-side route change). Structural paths are now resolved by walking the DOM and skipping these nodes, so the index stays stable. Hosts can register additional overlay roots via `addAnchorIgnoreSelectors`.
