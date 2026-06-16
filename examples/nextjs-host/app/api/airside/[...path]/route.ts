import { join } from 'node:path'
import { createMemoryRepository } from '@airnauts/airside-adapter-memory'
import { mongoRepository } from '@airnauts/airside-adapter-mongo'
import { emailExtension } from '@airnauts/airside-extension-email'
import { resendTransport } from '@airnauts/airside-extension-email/resend'
import { jiraExtension } from '@airnauts/airside-extension-jira'
import { slackExtension } from '@airnauts/airside-extension-slack'
import { createAirsideAppRoute } from '@airnauts/airside-next'
import { createFileSystemStorage } from '@airnauts/airside-storage-fs'
import { createVercelBlobStorage } from '@airnauts/airside-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createAirsideAppRoute({
  secretKey: 'dev-key', // demo only — replace with a real secret in production
  projectId: 'nextjs-host',
  allowedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3100',
    'http://127.0.0.1:3100',
  ],
  // Mongo when MONGODB_URI is set, else ephemeral in-memory.
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : createMemoryRepository(),
  // Vercel Blob when its token is present, else local public/uploads.
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? createVercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })
    : createFileSystemStorage({
        rootDir: join(process.cwd(), 'public', 'uploads'),
        baseUrl: '/uploads',
      }),
  extensions: [
    // Email notifications via Resend when RESEND_API_KEY is set, else none.
    // Recipients are derived server-side (the thread's other participants), so
    // an email only goes out on a reply — never on a brand-new thread. With the
    // sandbox sender onboarding@resend.dev, Resend only delivers to your own
    // Resend signup address, so comment first as that address to receive one.
    ...(process.env.RESEND_API_KEY
      ? emailExtension({
          transport: resendTransport({ apiKey: process.env.RESEND_API_KEY }),
          from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
        })
      : []),
    // Slack notifications when AIRSIDE_SLACK_WEBHOOK_URL is set, else none.
    ...(process.env.AIRSIDE_SLACK_WEBHOOK_URL
      ? slackExtension({ webhookUrl: process.env.AIRSIDE_SLACK_WEBHOOK_URL })
      : []),
    // "Create Jira issue" thread action when JIRA_API_TOKEN is set, else none.
    // The other fields are required too; jiraExtension throws fast if any is blank.
    ...(process.env.JIRA_API_TOKEN
      ? jiraExtension({
          siteUrl: process.env.JIRA_SITE_URL ?? '',
          email: process.env.JIRA_EMAIL ?? '',
          apiToken: process.env.JIRA_API_TOKEN,
          projectKey: process.env.JIRA_PROJECT_KEY ?? '',
        })
      : []),
  ],
  rateLimit: false,
})
