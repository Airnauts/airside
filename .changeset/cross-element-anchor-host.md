---
'@airnauts/airside-client': patch
---

Comments on text selections that span an element boundary (for example a selection that starts inside a `<code>` and ends in the text after it) now anchor to the nearest distinctive container instead of a generic bare block, so they survive a host re-render rather than silently jumping to another paragraph or showing the "anchor lost" card.
