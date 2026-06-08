# @airnauts/comments-notifier-slack

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
