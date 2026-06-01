# @airnauts/comments-server

Server runtime for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool): HTTP router, use-cases,
CORS/security, and framework adapters.

## Install

```bash
pnpm add @airnauts/comments-server
```

## Next.js usage

```ts
import { createNextHandler } from '@airnauts/comments-server/next'
import { createCommentsServer, InMemoryRepository } from '@airnauts/comments-server'

const server = createCommentsServer({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: new InMemoryRepository(),
  storage: { async put(blob) { return { url: `mem://${blob.name}`, key: blob.name, size: 0 } } },
  rateLimit: false,
})

export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
```

Pair with a persistence adapter (`@airnauts/comments-adapter-mongo`) and a storage
adapter (`@airnauts/comments-storage-vercel-blob` or `@airnauts/comments-storage-fs`)
for production. See the [integration guide](https://github.com/Airnauts/commenting-tool/blob/main/docs/integration.md).

## License

MIT © Airnauts
