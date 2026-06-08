---
"@airnauts/comments-client": patch
---

Make the widget independent of the host page's root font-size. The widget's
spacing, text, and radius tokens are now pinned to fixed `px` instead of `rem`,
so hosts that scale their root font-size responsively (e.g.
`html { font-size: clamp(0.8rem, 1vw, 1rem); }`) no longer stretch the comment
pin internals or balloon the panel/popover chrome on larger screens.
