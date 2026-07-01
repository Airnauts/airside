---
"@airnauts/airside-core": patch
"@airnauts/airside-server": patch
"@airnauts/airside-client": patch
"@airnauts/airside-adapter-memory": patch
"@airnauts/airside-adapter-mongo": patch
"@airnauts/airside-adapter-postgres": patch
---

Start page-level comments without placing a pin. A new "Comment on this page" button in the comments panel opens a composer for general feedback about the whole page; the thread is created without an on-page pin and lives in the panel. `anchor` is now optional when creating a thread, and such threads carry the new `anchorState: "unanchored"`.
