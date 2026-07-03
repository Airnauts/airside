---
"@airnauts/airside-client": patch
---

Unify the widget's icons behind one internal icon set. The resolved-pin check, attachment
remove, overflow menu, attach button, external-link, and resolve/reopen/close controls now
render consistent, theme-aware inline-SVG icons instead of a mix of raw Unicode glyphs and
emoji. Server action icons (`presentation.icon`) resolve through a known-icon registry, so an
unrecognised name renders nothing rather than an arbitrary glyph.
