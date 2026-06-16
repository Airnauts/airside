# @airnauts/airside-storage-fs

Filesystem attachment-storage adapter for the [Airside](https://github.com/Airnauts/airside) server. Writes uploaded images to a local directory and returns either `file://` URLs or browser-served paths.

## Installation

```bash
pnpm add @airnauts/airside-storage-fs
```

## Quick start

```ts
import { createFileSystemStorage } from '@airnauts/airside-storage-fs'

const storage = createFileSystemStorage({
  rootDir: './uploads',
  baseUrl: '/uploads', // serve files via a static route
})
```

Pass `storage` to `createAirsideServer` from `@airnauts/airside-server` (or to `createAirsideAppRoute` / `createAirsidePagesRoute` from `@airnauts/airside-integration-next`).

## API reference

### `createFileSystemStorage(opts)`

```ts
createFileSystemStorage({
  rootDir: string   // Absolute or relative path to write files into (required)
  baseUrl?: string  // Public URL prefix returned with each upload; defaults to file:// URLs
}): StorageAdapter
```

Files are written under `rootDir/<timestamp>/<random>-<safename>`. When `baseUrl` is set, `put` returns `${baseUrl}/<key>` so the browser can fetch the file from a static route; without it, it returns a `file://` absolute URL.

### `FileSystemStorage`

The underlying class, exported for subclassing or direct construction:

```ts
import { FileSystemStorage } from '@airnauts/airside-storage-fs'

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

- **`@airnauts/airside-server`** — defines the `StorageAdapter` interface this adapter implements
- **`@airnauts/airside-storage-vercel-blob`** — Vercel Blob storage for production / serverless deployments

## License

MIT © Airnauts
