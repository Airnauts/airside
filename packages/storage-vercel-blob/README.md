# @airnauts/comments-storage-vercel-blob

Vercel Blob attachment-storage adapter for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-storage-vercel-blob
```

## Usage

```ts
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

const storage = vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN! })
```

The token is passed explicitly — the adapter never reads `process.env` itself. Pass
an optional `prefix` (e.g. `'staging/'`) to namespace keys. The `VercelBlobStorage`
class is also exported if you prefer `new VercelBlobStorage(opts)`.

Pass `storage` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
