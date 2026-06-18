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
# npm install @airnauts/airside-integration-react react
```

## Quick start

The built module ships a `'use client'` banner, so you can render it directly in a React Server Component tree:

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-react'

export function App() {
  return <AirsideLayer airsideKey={process.env.NEXT_PUBLIC_AIRSIDE_KEY!} endpoint="/api/airside" />
}
```

`init()`'s activation gate keeps the widget inert until the page is opened once with `?airside-key=…`, so `<AirsideLayer/>` can render unconditionally. The `key` prop name is reserved by React, so the secret is passed as `airsideKey`; every other `init()` option (`endpoint`, `pageKey`, `features`, …) is accepted as-is.

> **Next.js:** `@airnauts/airside-integration-next` re-exports `AirsideLayer` from `@airnauts/airside-integration-next/client`, so a Next app can install a single package for both the API route and the widget mount.

## API reference

### `AirsideLayer`

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-react'

<AirsideLayer airsideKey="..." endpoint="/api/airside" />
```

A React component that calls `airside.init()` on mount and `handle.destroy()` on unmount. Re-initialises only when `airsideKey`, `endpoint`, or `keyParam` change — not on every render.

Returns `null` (renders nothing into the DOM).

#### `AirsideLayerProps`

All props from [`InitOptions`](https://github.com/Airnauts/airside/blob/main/packages/client/README.md#initoptions) are accepted, except `key` (reserved by React) which is replaced by `airsideKey`:

| Prop | Type | Required | Description |
|---|---|---|---|
| `airsideKey` | `string` | ✓ | The secret key (`key` in `InitOptions`); sent as `x-airside-key` on every API request |
| `endpoint` | `string` | ✓ | Base URL of the comments API, e.g. `"/api/airside"` |
| `pageKey` | `(url: string) => string` | | Override the default `origin + pathname` page identity |
| `keyParam` | `string` | | URL param the activation gate reads (default `"airside-key"`) |
| `threadParam` | `string` | | URL param used for thread deep-links (default `"airside-thread"`) |
| `features.screenshots` | `boolean` | | Enable screenshot capture (default off) |
| `features.textAnchors` | `boolean` | | Enable text-selection anchoring (default off) |
| `provenance` | `Provenance` | | Optional deploy metadata attached to new threads (`commitSha`, `branch`, `deploymentId`) |

## Peer dependencies & requirements

| Peer | Required | Notes |
|---|---|---|
| `react` | `^19.0.0` | Host app's React; the widget bundles its own copy separately |

- Node.js ≥ 18 (for server-side rendering stubs; the widget itself only runs in the browser)

## Related packages

- **`@airnauts/airside-client`** — the widget engine this component wraps (`airside.init()`)
- **`@airnauts/airside-integration-next`** — Next.js integration that re-exports `AirsideLayer` from its `/client` subpath
- **`@airnauts/airside-server`** — the HTTP API the widget connects to

## License

MIT © [Airnauts](https://www.airnauts.com/)
