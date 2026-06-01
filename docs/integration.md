# Integrate in minutes

Add the embeddable commenting tool to a Next.js App Router app. The worked example
lives in [`examples/nextjs-host`](../examples/nextjs-host) — every snippet below is
lifted from it.

## 1. Install

```bash
pnpm add @comments/client @comments/server
```

## 2. Add the API route

Create `app/api/comments/[...path]/route.ts`:

```ts
import { createNextHandler } from '@comments/server/next'
import { createCommentsServer, InMemoryRepository } from '@comments/server'

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

`createNextHandler` strips the mount prefix, so the server core does not need to
know where it is mounted.

## 3. Mount the widget

In a client component rendered from your root layout:

```tsx
'use client'
import { CommentsLayer } from '@comments/client/react'

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
pnpm add @comments/adapter-mongo @comments/storage-vercel-blob
# (or @comments/storage-fs for filesystem storage)
```

Swap the two ephemeral pieces for real infrastructure:

- **Persistence:** replace `InMemoryRepository` with `createMongoRepository({ db })`
  from `@comments/adapter-mongo`. Connect a `MongoClient`, call `ensureIndexes(db)`
  once at startup, then pass the `db` to `createMongoRepository`.
- **Storage:** replace the stub with `new VercelBlobStorage()` from
  `@comments/storage-vercel-blob` (reads `BLOB_READ_WRITE_TOKEN`), or
  `new FileSystemStorage({ rootDir })` from `@comments/storage-fs`.
- **Origins:** set `allowedOrigins` to your real site origins.

See [`examples/nextjs-host/lib/comments-server.ts`](../examples/nextjs-host/lib/comments-server.ts)
for an env-switched build that does in-memory locally and Mongo + Blob in production.
