# @airnauts/airside-extension-slack

## 0.9.1

### Patch Changes

- @airnauts/airside-core@0.9.1
- @airnauts/airside-server@0.9.1

## 0.9.0

### Patch Changes

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

- bf41997: `slackNotifier(...)` has been renamed to `slackNotifications(...)` and now returns a notification
  extension. Wire it through the server's `extensions` option:
  `createCommentsServer({ extensions: [...slackNotifications({ webhookUrl })] })`.
- 3f4bcb1: The Slack notifier now uses the deep-link built by the server. The `threadParam` option has been
  removed from `slackNotifications(...)`; set `threadParam` on `createCommentsServer` instead if you
  have customized the widget's thread param.

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

## 0.5.1

### Patch Changes

- @airnauts/comments-core@0.5.1
- @airnauts/comments-server@0.5.1

## 0.5.0

### Minor Changes

- f8d56a7: Slack notifications now link straight to the specific thread (the same `?comments-thread=<id>` deep-link as the widget's "Copy link"), so clicking through opens the focused comment instead of just the page. Add `threadParam` to `slackNotifier` if your host page uses a custom thread query param.

### Patch Changes

- @airnauts/comments-core@0.5.0
- @airnauts/comments-server@0.5.0

## 0.4.0

### Minor Changes

- All `@airnauts/comments-*` packages now share a single, synchronized version line
  (starting at 0.4.0) and are released together. Adopters can pin one version across
  the whole set instead of reconciling per-package versions.

### Patch Changes

- Updated dependencies
  - @airnauts/comments-core@0.4.0
  - @airnauts/comments-server@0.4.0

## 0.1.0

### Minor Changes

- 5cf77fd: Add Slack notifications. The server now accepts `notifiers: [...]`, a generic outbound
  channel seam, and the new `@airnauts/comments-notifier-slack` package posts a message to a
  Slack channel (via an Incoming Webhook) whenever a reviewer creates a thread or replies —
  showing who commented, the text, and a link to the page. Notification failures never break
  a comment write.

### Patch Changes

- Updated dependencies [cd42711]
- Updated dependencies [ab680eb]
- Updated dependencies [5cf77fd]
  - @airnauts/comments-server@0.2.0
  - @airnauts/comments-core@0.2.0
