# @airnauts/airside-client

Embeddable commenting widget and React wrapper for [Airside](https://github.com/Airnauts/airside). Mounts a light-DOM, self-contained commenting overlay onto any web page — no iframe, no Shadow DOM.

## Installation

```bash
pnpm add @airnauts/airside-client
# React host apps also need the optional peer:
pnpm add react react-dom
```

## Quick start

### React (recommended for React apps)

```tsx
'use client'
import { AirsideLayer } from '@airnauts/airside-client/react'

export function AirsideMount() {
  return <AirsideLayer airsideKey="your-secret-key" endpoint="/api/airside" />
}
```

Render `<AirsideMount />` once in your root layout. The widget stays inert until the URL carries `?airside-key=your-secret-key`; after that, the key is persisted to `localStorage` so subsequent visits work without the param.

### Vanilla JS

```ts
import { airside } from '@airnauts/airside-client'

const handle = await airside.init({
  key: 'your-secret-key',
  endpoint: '/api/airside',
})

// Later, to tear down:
handle.destroy()
```

## API reference

### `init(options)` / `airside.init(options)`

```ts
import { init, airside } from '@airnauts/airside-client'

const handle: AirsideHandle = await airside.init(options)
```

`init` is a no-op (returns a handle whose `destroy` is also a no-op) when no valid key is found in either the URL or `localStorage`. It is async by contract; in the current build the app bundle is static (no dynamic import split at the gate).

#### `InitOptions`

| Option | Type | Description |
|---|---|---|
| `key` | `string` | Secret key sent as `x-airside-key` on every API request |
| `endpoint` | `string` | Base URL of the comments API (e.g. `"/api/airside"`) |
| `pageKey` | `(url: string) => string` | Override the default `origin + pathname` page identity |
| `keyParam` | `string` | URL param the activation gate reads (default `"airside-key"`) |
| `threadParam` | `string` | URL param used for thread deep-links (default `"airside-thread"`) |
| `features.screenshots` | `boolean` | Enable screenshot capture (default off) |
| `features.textAnchors` | `boolean` | Enable text-selection anchoring (default off) |
| `provenance` | `Provenance` | Optional deploy metadata attached to new threads (`commitSha`, `branch`, `deploymentId`) |

#### `AirsideHandle`

```ts
type AirsideHandle = { destroy(): void }
```

Call `destroy()` to unmount the widget and clean up all listeners.

### `consumeThreadParam(param)`

```ts
import { consumeThreadParam, DEFAULT_THREAD_PARAM } from '@airnauts/airside-client'

consumeThreadParam(DEFAULT_THREAD_PARAM)
```

Reads a `?airside-thread=<id>` deep-link param from the current URL, stores the thread ID in `sessionStorage` so the widget opens that thread's panel on load, then strips the param from the address bar. Call this before `init` if you need to handle deep-links in a vanilla (non-React) context; the React `<AirsideLayer>` handles it automatically.

### Constants

| Export | Value |
|---|---|
| `DEFAULT_KEY_PARAM` | `"airside-key"` |
| `DEFAULT_THREAD_PARAM` | `"airside-thread"` |

### Anchor utilities (advanced)

Low-level DOM capture functions used by the widget's anchoring engine; available if you need to build custom anchoring logic.

```ts
import { captureElement, extractSignals, buildSelectors } from '@airnauts/airside-client'
```

| Export | Description |
|---|---|
| `captureElement(el, point)` | Build a fingerprint `{ selectors, signals, offset }` from a DOM element and click point |
| `extractSignals(el)` | Extract the signals bag (tag, role, textSnippet, classes, siblingIndex, ancestorTrail) |
| `buildSelectors(el)` | Build the dual `[structuralPath, classPath]` selector tuple |
| `resolveUnique(selector, root?)` | Resolve a structural selector to a single element, or null if ambiguous |

## Subpath: `@airnauts/airside-client/react`

```tsx
import { AirsideLayer } from '@airnauts/airside-client/react'
```

Thin React wrapper that calls `airside.init()` in a `useEffect` and tears down on unmount.

#### `AirsideLayerProps`

All `InitOptions` fields except `key`, which becomes `airsideKey` (React reserves the `key` prop name):

```tsx
<AirsideLayer
  airsideKey="your-secret-key"
  endpoint="/api/airside"
  features={{ screenshots: true, textAnchors: true }}
  pageKey={(url) => new URL(url).origin + new URL(url).pathname}
/>
```

The effect re-runs only when `airsideKey`, `endpoint`, or `keyParam` change — not on every render.

## Peer dependencies & requirements

| Peer | Required | Notes |
|---|---|---|
| `react` | Optional (^19.0.0) | Only needed for `@airnauts/airside-client/react` |
| `react-dom` | Optional (^19.0.0) | Only needed for `@airnauts/airside-client/react` |

The main entry (`@airnauts/airside-client`) bundles its own React and does **not** require the host app to have React installed.

- Node.js ≥ 18 for server-side rendering stubs (the widget itself only runs in the browser)

## Related packages

- **`@airnauts/airside-server`** — the HTTP API the widget talks to
- **`@airnauts/airside-next`** — one-call Next.js App Router server integration
- **`@airnauts/airside-core`** — shared types (consumed transitively)

See the [integration guide](https://github.com/Airnauts/airside/blob/main/docs/integration.md) for a full walkthrough, with `examples/nextjs-host` as the worked example.

## License

MIT © Airnauts
