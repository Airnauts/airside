---
"@airnauts/comments-storage-fs": minor
"@airnauts/comments-storage-vercel-blob": minor
"@airnauts/comments-adapter-memory": minor
"@airnauts/comments-notifier-slack": minor
"@airnauts/comments-notifier-email": minor
"@airnauts/comments-integration-jira": minor
---

Unify the adapter and extension factory names onto a single `create…`/`…Extension`
convention. Storage factories are now `createFileSystemStorage` and
`createVercelBlobStorage`; the in-memory repository factory is `createMemoryRepository`;
and the notification/integration extension factories are `slackExtension`,
`emailExtension`, and `jiraExtension` (with matching `SlackExtensionOptions`,
`EmailExtensionOptions`, and `JiraExtensionOptions` types).

The previous names (`fileSystemStorage`, `vercelBlobStorage`, `memoryRepository`,
`slackNotifications`, `emailNotifications`, `jiraIssues`, and the old `*NotifierOptions` /
`JiraIssuesOptions` types) remain exported as deprecated aliases for one release — update
imports to the new names before the next minor.
