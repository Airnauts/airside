# @airnauts/comments-storage-fs

Filesystem attachment-storage adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server. Writes uploaded images to a local directory and returns either `file://` URLs or browser-served paths.

## Installation

```bash
pnpm add @airnauts/comments-storage-fs
```

## Quick start

```ts
import { fileSystemStorage } from '@airnauts/comments-storage-fs'

const storage = fileSystemStorage({
  rootDir: './uploads',
  baseUrl: '/uploads', // serve files via a static route
})
```

Pass `storage` to `createCommentsServer` from `@airnauts/comments-server` (or to `createCommentsRoute` from `@airnauts/comments-next`).

## API reference

### `fileSystemStorage(opts)`

```ts
fileSystemStorage({
  rootDir: string   // Absolute or relative path to write files into (required)
  baseUrl?: string  // Public URL prefix returned with each upload; defaults to file:// URLs
}): StorageAdapter
```

Files are written under `rootDir/<timestamp>/<random>-<safename>`. When `baseUrl` is set, `put` returns `${baseUrl}/<key>` so the browser can fetch the file from a static route; without it, it returns a `file://` absolute URL.

### `FileSystemStorage`

The underlying class, exported for subclassing or direct construction:

```ts
import { FileSystemStorage } from '@airnauts/comments-storage-fs'

const storage = new FileSystemStorage({ rootDir: './uploads', baseUrl: '/uploads' })
```

### `FileSystemStorageOptions`

```ts
type FileSystemStorageOptions = {
  rootDir: string
  baseUrl?: string
}
```

## Requirements

- Node.js ≥ 18 (uses `fs/promises`, `path`, `url`)

## Related packages

- **`@airnauts/comments-server`** — defines the `StorageAdapter` interface this adapter implements
- **`@airnauts/comments-storage-vercel-blob`** — Vercel Blob storage for production / serverless deployments

## License

MIT © Airnauts
