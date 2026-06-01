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

See the [integration guide](https://github.com/Airnauts/commenting-tool/blob/main/docs/integration.md).

## License

MIT © Airnauts
