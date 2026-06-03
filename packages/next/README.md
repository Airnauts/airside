# @airnauts/comments-next

Next.js App Router integration for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool). Builds the
server and its catch-all route handlers in one `createCommentsRoute(...)` call.

## Install

```bash
pnpm add @airnauts/comments-next @airnauts/comments-adapter-memory @airnauts/comments-storage-vercel-blob
```

## Usage

```ts
// app/api/comments/[...path]/route.ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN! }),
})
```

Swap in any persistence adapter (e.g. `@airnauts/comments-adapter-mongo`) and storage
adapter (`@airnauts/comments-storage-vercel-blob` or `@airnauts/comments-storage-fs`).
Set `disabled: true` to mount handlers that return `404` (e.g. to gate by environment);
`createCommentsRoute` also returns `server` for server-side reads and tests. See the
[integration guide](https://github.com/Airnauts/commenting-tool/blob/main/docs/integration.md).

## License

MIT © Airnauts
