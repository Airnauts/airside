<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
  <h1 align="center">
Embeddable Commenting Tool
</h1>
</p>

# @airnauts/airside-integration-react

The `<AirsideLayer/>` React mount for [Airside](https://github.com/Airnauts/airside). Drop it anywhere in a React tree to embed the commenting widget; it calls `airside.init()` on mount and tears down on unmount. The widget bundles its own React, so this wrapper only needs the host's `react` as a peer.

## Installation

```bash
pnpm add @airnauts/airside-integration-react react
```

## Usage

The built module ships a `'use client'` banner, so you can render it directly in a React Server Component tree:

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-react'

export function App() {
  return <AirsideLayer airsideKey={process.env.NEXT_PUBLIC_AIRSIDE_KEY!} endpoint="/api/airside" />
}
```

`init()`'s activation gate keeps the widget inert until the page is opened once with `?airside-key=…`, so `<AirsideLayer/>` can render unconditionally. The `key` prop name is reserved by React, so the secret is passed as `airsideKey`; every other [`init()` option](https://github.com/Airnauts/airside/blob/main/packages/client/README.md) (`endpoint`, `pageKey`, `features`, …) is accepted as-is.

> **Next.js:** `@airnauts/airside-integration-next` re-exports `AirsideLayer` from `@airnauts/airside-integration-next/client`, so a Next app can install a single package for both the API route and the mount.
