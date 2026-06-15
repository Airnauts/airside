import { join } from 'node:path'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { jiraIssues } from '@airnauts/comments-integration-jira'
import { createCommentsRoute } from '@airnauts/comments-next'
import { slackNotifications } from '@airnauts/comments-notifier-slack'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
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
    : memoryRepository(),
  // Vercel Blob when its token is present, else local public/uploads.
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  extensions: [
    // Slack notifications when COMMENTS_SLACK_WEBHOOK_URL is set, else none.
    ...(process.env.COMMENTS_SLACK_WEBHOOK_URL
      ? slackNotifications({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL })
      : []),
    // "Create Jira issue" thread action when JIRA_API_TOKEN is set, else none.
    // The other fields are required too; jiraIssues throws fast if any is blank.
    ...(process.env.JIRA_API_TOKEN
      ? jiraIssues({
          siteUrl: process.env.JIRA_SITE_URL ?? '',
          email: process.env.JIRA_EMAIL ?? '',
          apiToken: process.env.JIRA_API_TOKEN,
          projectKey: process.env.JIRA_PROJECT_KEY ?? '',
        })
      : []),
  ],
  rateLimit: false,
})
