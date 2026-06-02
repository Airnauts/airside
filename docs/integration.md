# Integrate in minutes

Add the embeddable commenting tool to a Next.js App Router app. The worked example
lives in [`examples/nextjs-host`](../examples/nextjs-host) — every snippet below is
lifted from it.

## 1. Install

```bash
pnpm add @airnauts/comments-client @airnauts/comments-next @airnauts/comments-adapter-memory
```

## 2. Add the API route

Create `app/api/comments/[...path]/route.ts`:

```ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: { async put(blob) { return { url: `mem://${blob.name}`, key: blob.name, size: 0 } } },
  rateLimit: false,
})
```

`createCommentsRoute` builds the server and its four Next App Router handlers in one
call (it also returns `server` for server-side reads or tests). The handler strips
the mount prefix, so the server core does not need to know where it is mounted.

## 3. Mount the widget

In a client component rendered from your root layout:

```tsx
'use client'
import { CommentsLayer } from '@airnauts/comments-client/react'

export function CommentsMount() {
  return <CommentsLayer commentsKey="dev-key" endpoint="/api/comments" />
}
```

```tsx
// app/layout.tsx
import { CommentsMount } from './components/comments-mount'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CommentsMount />
      </body>
    </html>
  )
}
```

## 4. Activate

Open any page with `?comments-key=dev-key`. The widget stays completely inert
(never mounts, renders, or fetches) until the key in the URL matches `secretKey`.

## 5. Go to production

```bash
pnpm add @airnauts/comments-adapter-mongo @airnauts/comments-storage-vercel-blob
# (or @airnauts/comments-storage-fs for filesystem storage)
```

Every adapter ships a uniform factory, so swapping the two ephemeral pieces for real
infrastructure is config — no bespoke glue:

- **Persistence:** replace `memoryRepository()` with `mongoRepository({ uri })` from
  `@airnauts/comments-adapter-mongo`. It connects lazily on first use and memoizes the
  connection (warm serverless / HMR reuse); the database name comes from the URI.
- **Storage:** replace the stub with `vercelBlobStorage()` from
  `@airnauts/comments-storage-vercel-blob` (reads `BLOB_READ_WRITE_TOKEN`), or
  `fileSystemStorage({ rootDir, baseUrl })` from `@airnauts/comments-storage-fs`
  (`baseUrl` makes `put` return a browser-served path instead of a `file://` URL).
- **Origins:** set `allowedOrigins` to your real site origins.

```ts
// app/api/comments/[...path]/route.ts
import { join } from 'node:path'
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: process.env.COMMENTS_SECRET ?? 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : memoryRepository(),
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage()
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

See [`examples/nextjs-host/app/api/comments/[...path]/route.ts`](../examples/nextjs-host/app/api/comments/%5B...path%5D/route.ts)
for this env-switched build: in-memory locally, Mongo + Blob in production.
