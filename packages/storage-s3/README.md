<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
  <h1 align="center">
Embeddable Commenting Tool
</h1>
</p>

# @airnauts/airside-storage-s3

Amazon S3 (and any S3-compatible store — **Cloudflare R2**, MinIO, …) attachment-storage adapter for the [Airside](https://github.com/Airnauts/airside) server. Uploads images to a bucket and returns a stable, public URL.

## Installation

```bash
pnpm add @airnauts/airside-storage-s3
```

## Quick start

### Amazon S3

```ts
import { createS3Storage } from '@airnauts/airside-storage-s3'

const storage = createS3Storage({
  bucket: 'my-bucket',
  // Stable, public base for the returned URLs (a CloudFront/custom domain, or the
  // virtual-hosted S3 URL). The object is uploaded WITHOUT an ACL — serving it
  // publicly is your bucket-policy / CDN responsibility.
  publicBaseUrl: 'https://cdn.example.com',
  region: 'eu-west-1',
  // Omit `credentials` to use the AWS SDK default provider chain
  // (IAM instance/task role on Lambda/ECS/EC2).
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})
```

### Cloudflare R2

`createR2Storage` fills `region: 'auto'` and derives the R2 S3-API endpoint from your account ID:

```ts
import { createR2Storage } from '@airnauts/airside-storage-s3'

const storage = createR2Storage({
  accountId: process.env.R2_ACCOUNT_ID!, // -> https://<accountId>.r2.cloudflarestorage.com
  bucket: 'my-bucket',
  // R2 public bucket URL or a custom domain bound to the bucket.
  publicBaseUrl: 'https://pub-<hash>.r2.dev',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
```

Pass `storage` to `createAirsideServer` from `@airnauts/airside-server` (or to `createAirsideAppRoute` / `createAirsidePagesRoute` from `@airnauts/airside-integration-next`).

## API reference

### `createS3Storage(opts)`

```ts
createS3Storage({
  bucket: string            // target bucket (required)
  publicBaseUrl: string     // stable, public base for returned URLs (required; trailing slash trimmed)
  region?: string           // default "us-east-1"
  endpoint?: string         // S3-compatible endpoint (R2, MinIO)
  credentials?: { accessKeyId: string; secretAccessKey: string } // omit -> SDK default chain
  keyPrefix?: string        // optional key prefix, e.g. "staging/" (trailing slash added automatically)
  forcePathStyle?: boolean  // path-style addressing (MinIO / some endpoints)
  client?: S3ClientLike     // inject a client (testing/advanced); overrides build-from-config options
}): StorageAdapter
```

Each upload sends a `PutObjectCommand` (no ACL) and returns `{ key, url, size }` where `url` is `${publicBaseUrl}/${key}`.

### `createR2Storage(opts)`

Same as `createS3Storage`, minus `region`/`endpoint`, plus a required `accountId` (used to derive the R2 endpoint and pin `region: 'auto'`).

### `S3Storage`

The underlying class, exported for direct construction:

```ts
import { S3Storage } from '@airnauts/airside-storage-s3'

const storage = new S3Storage({ bucket: 'my-bucket', publicBaseUrl: 'https://cdn.example.com' })
```

## Configuration / env vars

The adapter reads no environment variables itself — values are passed explicitly. Typical sources:

| Env var | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credentials for `createS3Storage({ credentials })` (omit to use the SDK default provider chain — IAM role) |
| `R2_ACCOUNT_ID` | Cloudflare account ID for `createR2Storage({ accountId })` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3-API token credentials |

## Public access requirement

`put()` uploads **without an ACL** and returns `${publicBaseUrl}/${key}`. Airside persists and serves that exact URL in `<img src>`, so the bucket prefix **must be publicly readable** through `publicBaseUrl`. Configure one of:

- an **S3 bucket policy** (or a CloudFront distribution / custom domain) that serves the objects publicly, or
- a **Cloudflare R2 public bucket** (`*.r2.dev`) or a custom domain bound to the bucket.

A private bucket with no public route yields broken images. Presigned (expiring) URLs are intentionally **not** used — see ADR-0045.

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)
- A bucket on Amazon S3, Cloudflare R2, or another S3-compatible store

## Related packages

- **`@airnauts/airside-server`** — defines the `StorageAdapter` interface
- **`@airnauts/airside-storage-vercel-blob`** — Vercel Blob alternative
- **`@airnauts/airside-storage-fs`** — filesystem alternative for local development

## License

MIT © Airnauts
