# @airnauts/airside-integration-react

## 0.9.1

### Patch Changes

- 44068eb: Docs: README updated to match the current public API — added API reference, peer dependencies, requirements, and related-packages sections.
  - @airnauts/airside-client@0.9.1

## 0.9.0

### Minor Changes

- d6b196e: New package: `<AirsideLayer/>`, the React mount for embedding the Airside commenting widget in any React host. It calls `airside.init()` on mount, tears down on unmount, and ships a `'use client'` banner so it can be rendered directly in an RSC tree.

### Patch Changes

- Updated dependencies [d6b196e]
  - @airnauts/airside-client@0.9.0
