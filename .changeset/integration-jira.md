---
"@airnauts/comments-integration-jira": minor
---

New package: create Jira issues from comment threads. `jiraIssues({ siteUrl, email, apiToken,
projectKey, issueType?, labels? })` returns a server extension that adds a "Create Jira issue"
thread action. Running it opens a Jira Cloud issue whose summary and description (Atlassian Document
Format) are built from the thread — page, status, every comment, attachments and deployment
provenance — then persists a Jira `externalLink` back on the thread. The action hides itself once a
thread already has a Jira link, and required config is validated at construction so misconfiguration
fails fast.
