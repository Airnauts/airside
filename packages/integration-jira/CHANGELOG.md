# @airnauts/comments-integration-jira

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
