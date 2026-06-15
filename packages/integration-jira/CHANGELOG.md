# @airnauts/comments-integration-jira

## 0.7.0

### Minor Changes

- d8990ae: Unify the adapter and extension factory names onto a single `create…`/`…Extension`
  convention. Storage factories are now `createFileSystemStorage` and
  `createVercelBlobStorage`; the in-memory repository factory is `createMemoryRepository`;
  and the notification/integration extension factories are `slackExtension`,
  `emailExtension`, and `jiraExtension` (with matching `SlackExtensionOptions`,
  `EmailExtensionOptions`, and `JiraExtensionOptions` types).

  The previous names (`fileSystemStorage`, `vercelBlobStorage`, `memoryRepository`,
  `slackNotifications`, `emailNotifications`, `jiraIssues`, and the old `*NotifierOptions` /
  `JiraIssuesOptions` types) remain exported as deprecated aliases for one release — update
  imports to the new names before the next minor.

### Patch Changes

- @airnauts/comments-server@0.7.0
- @airnauts/comments-core@0.7.0

## 0.6.0

### Minor Changes

- 1c016c3: New package: create Jira issues from comment threads. `jiraIssues({ siteUrl, email, apiToken,
projectKey, issueType?, labels? })` returns a server extension that adds a "Create Jira issue"
  thread action. Running it opens a Jira Cloud issue whose summary and description (Atlassian Document
  Format) are built from the thread — page, status, every comment, attachments and deployment
  provenance — then persists a Jira `externalLink` back on the thread. The action hides itself once a
  thread already has a Jira link, and required config is validated at construction so misconfiguration
  fails fast.

### Patch Changes

- e9cc0e9: Docs: README updated to match the current public API.
- Updated dependencies [3f4bcb1]
- Updated dependencies [bf41997]
- Updated dependencies [79fe6ba]
- Updated dependencies [54bbab0]
- Updated dependencies [cbf6378]
- Updated dependencies [e9cc0e9]
- Updated dependencies [bf41997]
- Updated dependencies [0292473]
- Updated dependencies [79fe6ba]
- Updated dependencies [3f4bcb1]
  - @airnauts/comments-core@0.6.0
  - @airnauts/comments-server@0.6.0
