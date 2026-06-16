<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
</p>

# @airnauts/airside-storage-vercel-blob

Vercel Blob attachment-storage adapter for the [Airside](https://github.com/Airnauts/airside) server. Uploads images to Vercel Blob and returns public CDN URLs.

## Installation

```bash
pnpm add @airnauts/airside-storage-vercel-blob
```

## Quick start

```ts
import { createVercelBlobStorage } from '@airnauts/airside-storage-vercel-blob'

const storage = createVercelBlobStorage({
  token: process.env.BLOB_READ_WRITE_TOKEN!,
})
```

Pass `storage` to `createAirsideServer` from `@airnauts/airside-server` (or to `createAirsideAppRoute` / `createAirsidePagesRoute` from `@airnauts/airside-integration-next`).

## API reference

### `createVercelBlobStorage(opts)`

```ts
createVercelBlobStorage({
  token: string    // Vercel Blob read-write token (required; never read from process.env automatically)
  prefix?: string  // Optional key prefix, e.g. "staging/" (trailing slash added automatically)
}): StorageAdapter
```

Each upload calls `@vercel/blob`'s `put` with `access: "public"` and `addRandomSuffix: true`.

### `VercelBlobStorage`

The underlying class, exported for direct construction:

```ts
import { VercelBlobStorage } from '@airnauts/airside-storage-vercel-blob'

const storage = new VercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN! })
```

### `VercelBlobStorageOptions`

```ts
type VercelBlobStorageOptions = {
  token: string
  prefix?: string
}
```

## Configuration / env vars

| Env var | Description |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token — copy from the Vercel dashboard Storage tab |

The token is passed explicitly to `createVercelBlobStorage({ token })` — the adapter never reads `process.env` automatically.

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)
- A Vercel project with a Blob store attached

## Related packages

- **`@airnauts/airside-server`** — defines the `StorageAdapter` interface
- **`@airnauts/airside-storage-fs`** — filesystem alternative for local development

## License

MIT © Airnauts
