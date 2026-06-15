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
import { createCommentsAppRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'

export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: { async put(blob) { return { url: `mem://${blob.name}`, key: blob.name, size: 0 } } },
  rateLimit: false,
})
```

`createCommentsAppRoute` builds the server and its four Next App Router handlers in one
call (it also returns `server` for server-side reads or tests). The handler strips
the mount prefix, so the server core does not need to know where it is mounted.

For the Pages Router, use `createCommentsPagesRoute` instead — see the root README for
the full example.

Pass `disabled: true` to keep the route mounted but dormant — every handler returns
`404` and no server is constructed (e.g. when a required backend env var is absent
in local dev or a preview deploy). `route.server` is `undefined` in that case.
`disabled` gates only the route, not the widget — gate the widget mount (step 3) on
the same condition, or it will load and then 404 against its own dormant API.

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
- **Storage:** replace the stub with `vercelBlobStorage({ token })` from
  `@airnauts/comments-storage-vercel-blob` (pass `BLOB_READ_WRITE_TOKEN` explicitly), or
  `fileSystemStorage({ rootDir, baseUrl })` from `@airnauts/comments-storage-fs`
  (`baseUrl` makes `put` return a browser-served path instead of a `file://` URL).
- **Origins:** set `allowedOrigins` to your real site origins.

```ts
// app/api/comments/[...path]/route.ts
import { join } from 'node:path'
import { createCommentsAppRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({
  secretKey: process.env.COMMENTS_SECRET ?? 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : memoryRepository(),
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

See [`examples/nextjs-host/app/api/comments/[...path]/route.ts`](../examples/nextjs-host/app/api/comments/%5B...path%5D/route.ts)
for this env-switched build: in-memory locally, Mongo + Blob in production.

## Extensions: notifications and thread actions

Server-side add-ons — outbound notifications and reviewer-triggered thread actions — are
all wired through one option: `extensions`. Each factory (`slackNotifications`,
`emailNotifications`, `jiraIssues`, …) returns an **array** of extensions, so spread them
into a single list:

```ts
createCommentsServer({
  repository,
  storage,
  extensions: [
    ...slackNotifications({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! }),
    ...jiraIssues({ siteUrl, email, apiToken, projectKey }),
  ],
})
```

> `extensions` is the forward-looking API. The older `notifiers: [...]` option still works
> as a **deprecated** alias for notification-only setups, but new code should use
> `extensions` (it covers both notifications and thread actions).

## Slack notifications

Send a Slack message whenever a reviewer creates a thread or replies — with the author,
the comment text, and a link to the page.

1. In Slack, create (or pick) an app and enable **Incoming Webhooks**.
2. **Add New Webhook to Workspace**, choose the channel, and copy the
   `https://hooks.slack.com/services/…` URL. The channel is baked into the URL — there is
   no separate channel name or bot token.
3. Set it as `COMMENTS_SLACK_WEBHOOK_URL` and wire the extension (note the spread — the
   factory returns an array):

```ts
import { slackNotifications } from '@airnauts/comments-notifier-slack'

createCommentsServer({
  repository,
  storage,
  extensions: [...slackNotifications({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })],
})
```

A notification failure never breaks the comment write, and the webhook request is bounded
by a 3-second timeout. The link points at the page; a recipient sees the comments only if
they already hold the activation key (it is remembered after the first `?comments-key=…`
activation).

## Jira issues

Let reviewers turn a comment thread into a Jira Cloud issue with one click. The package
registers a **"Create Jira issue"** thread action; running it opens an issue whose summary
and description are built from the thread (page, status, every comment, attachments and
deployment provenance) and persists a Jira link back on the thread.

1. In Jira, create an **Atlassian API token** at
   <https://id.atlassian.com/manage-profile/security/api-tokens>. Pair it with the email of
   the account it belongs to.
2. The token and email stay **server-side** — they are never sent to the browser. Keep them
   in env vars alongside your other secrets.
3. Wire the extension (again, spread the returned array):

```ts
import { jiraIssues } from '@airnauts/comments-integration-jira'

createCommentsServer({
  repository,
  storage,
  extensions: [
    ...jiraIssues({
      siteUrl: process.env.JIRA_SITE_URL!,     // e.g. https://your-org.atlassian.net
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      projectKey: process.env.JIRA_PROJECT_KEY!, // e.g. ENG
      issueType: 'Task',                         // optional, defaults to Task
      labels: ['from-comments'],                 // optional
    }),
  ],
})
```

Required config (`siteUrl`, `email`, `apiToken`, `projectKey`) is validated at construction,
so misconfiguration fails fast at startup. There is **one issue per thread**: the action
button is shown only while the thread has no Jira link yet, and once an issue is created the
button is replaced by a **"Jira &lt;KEY&gt;"** link (e.g. `Jira ENG-1234`) that opens the
issue.

> **Known v1 limitation.** Deduplication is per-thread but not transactional: if two
> reviewers click "Create Jira issue" on the same thread at the same time, both requests can
> pass the "no link yet" check and create two issues. In practice the button disappears as
> soon as the first request lands, so this only happens on a near-simultaneous double-create.
