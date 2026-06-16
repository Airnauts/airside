---
"@airnauts/airside-integration-react": minor
---

New package: `<AirsideLayer/>`, the React mount for embedding the Airside commenting widget in any React host. It calls `airside.init()` on mount, tears down on unmount, and ships a `'use client'` banner so it can be rendered directly in an RSC tree.
