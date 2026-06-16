# @airnauts/airside-extension-jira

## 0.9.0

### Patch Changes

- 2b39e6c: Docs: README now lists all four required env vars (`JIRA_SITE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`).
  - @airnauts/airside-core@0.9.0
  - @airnauts/airside-server@0.9.0

## 0.8.2

### Patch Changes

- @airnauts/airside-core@0.8.2
- @airnauts/airside-server@0.8.2

## 0.8.1

### Patch Changes

- 4404855: Add the Airside logo and "Embeddable Commenting Tool" tagline as a centered, dark/light-aware header to the package README.
- Updated dependencies [4404855]
  - @airnauts/airside-core@0.8.1
  - @airnauts/airside-server@0.8.1

## 0.8.0

### Minor Changes

- Rebrand: the package family is now published as `@airnauts/airside-*` (Airside). This is a breaking change — update your imports and: the React prop `airsideKey` (was `commentsKey`), URL params `?airside-key` / `?airside-thread`, the `x-airside-key` request header, `AIRSIDE_*` env vars, and (if you target the widget DOM) the `air:` CSS class prefix and `data-airside-*` attributes. The Slack/email/Jira integrations are now `@airnauts/airside-extension-{slack,email,jira}`. The former `@airnauts/comments-*` packages are deprecated with a pointer to their replacements.

### Patch Changes

- Updated dependencies
- Updated dependencies [402b2c4]
  - @airnauts/airside-core@0.8.0
  - @airnauts/airside-server@0.8.0

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
