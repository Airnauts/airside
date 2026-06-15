# @airnauts/comments-client

Embeddable commenting widget and React wrapper for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool).

## Install

```bash
pnpm add @airnauts/comments-client
```

## React usage

```tsx
'use client'
import { CommentsLayer } from '@airnauts/comments-client/react'

export function CommentsMount() {
  return <CommentsLayer commentsKey="dev-key" endpoint="/api/comments" />
}
```

The widget stays inert until the page URL carries a matching `?comments-key=…`.
The vanilla `@airnauts/comments-client` entry bundles its own React; the `/react`
entry uses the host app's React (declared as an optional peer dependency).

## Vanilla usage

```ts
import { comments } from '@airnauts/comments-client'

await comments.init({
  key: 'your-secret-key',
  endpoint: '/api/comments',
})
```

`init()` returns a `CommentsHandle` with a `destroy()` method. If the activation
key is absent from both the URL and `localStorage`, `init()` is a no-op.

### `InitOptions`

| Option | Type | Description |
|---|---|---|
| `key` | `string` | Secret key sent as `x-comments-key` header |
| `endpoint` | `string` | Base URL of the comments API |
| `pageKey` | `(url: string) => string` | Override the default `origin + pathname` page identity |
| `keyParam` | `string` | URL param the activation gate reads (default `comments-key`) |
| `threadParam` | `string` | URL param used for thread deep-links (default `comments-thread`) |
| `features.screenshots` | `boolean` | Enable screenshot capture (default off) |
| `features.textAnchors` | `boolean` | Enable text-selection anchoring (default off) |
| `provenance` | `Provenance` | Optional deploy metadata attached to new threads |

See the [integration guide](https://github.com/Airnauts/commenting-tool/blob/main/docs/integration.md).

## License

MIT © Airnauts
