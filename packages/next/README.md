# @airnauts/comments-next

Next.js App Router integration for the Airnauts commenting tool. Build the server
and its catch-all route handlers in one call:

```ts
// app/api/comments/[...path]/route.ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage,
})
```
