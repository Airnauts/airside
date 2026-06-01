# @airnauts/comments-storage-vercel-blob

Vercel Blob attachment-storage adapter for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-storage-vercel-blob
```

## Usage

```ts
import { VercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

const storage = new VercelBlobStorage() // reads BLOB_READ_WRITE_TOKEN
```

Pass `storage` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
