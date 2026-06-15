# @airnauts/comments-integration-jira

Jira Cloud thread-action extension for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool)
server. Adds a **"Create Jira issue"** button to each comment thread; clicking it opens a Jira
Cloud issue pre-filled with the thread content and stores the issue link back on the thread.

## Install

```bash
pnpm add @airnauts/comments-integration-jira
```

## Usage

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { jiraIssues } from '@airnauts/comments-integration-jira'

createCommentsServer({
  repository,
  storage,
  extensions: jiraIssues({
    siteUrl: 'https://your-org.atlassian.net',
    email: process.env.JIRA_EMAIL!,
    apiToken: process.env.JIRA_API_TOKEN!,
    projectKey: 'PROJ',
  }),
})
```

The action is shown in the thread toolbar and hides itself once the thread already carries a Jira
link — so repeated presses create only one issue. An `issueType` can be provided to override the
project default (defaults to `'Task'`). Pass an optional `labels` array to tag every created issue.

Required config is validated at construction time — a missing `siteUrl`, `email`, `apiToken`, or
`projectKey` throws immediately so misconfiguration fails fast.

## `JiraConfig`

| Field | Type | Description |
|---|---|---|
| `siteUrl` | `string` | Jira Cloud base URL, e.g. `https://acme.atlassian.net` |
| `email` | `string` | Atlassian account email (used for Basic Auth) |
| `apiToken` | `string` | API token from id.atlassian.com |
| `projectKey` | `string` | Project key, e.g. `PROJ` |
| `issueType` | `string?` | Issue type name (default `'Task'`) |

## License

MIT © Airnauts
