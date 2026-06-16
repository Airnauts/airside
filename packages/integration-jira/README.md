<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
  <h1 align="center">
Embeddable Commenting Tool
</h1>
</p>

# @airnauts/airside-extension-jira

Jira Cloud thread-action extension for the [Airside](https://github.com/Airnauts/airside) server. Adds a **"Create Jira issue"** button to each comment thread; clicking it creates a Jira Cloud issue pre-filled with the thread content and stores the issue link back on the thread.

## Installation

```bash
pnpm add @airnauts/airside-extension-jira
```

## Quick start

```ts
import { createAirsideServer } from '@airnauts/airside-server'
import { jiraExtension } from '@airnauts/airside-extension-jira'

createAirsideServer({
  repository,
  storage,
  secretKey: process.env.AIRSIDE_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  extensions: jiraExtension({
    siteUrl: 'https://your-org.atlassian.net',
    email: process.env.JIRA_EMAIL!,
    apiToken: process.env.JIRA_API_TOKEN!,
    projectKey: 'PROJ',
  }),
})
```

The action appears in the thread toolbar. Once a Jira issue has been created for a thread, the button hides itself — so repeated presses create only one issue. The Jira issue URL is stored as an `externalLink` on the thread and shown in the UI.

## API reference

### `jiraExtension(opts)`

```ts
jiraExtension({
  siteUrl: string      // Jira Cloud base URL, e.g. "https://acme.atlassian.net" (required)
  email: string        // Atlassian account email used for Basic Auth (required)
  apiToken: string     // API token from id.atlassian.com (required)
  projectKey: string   // Project key, e.g. "PROJ" (required)
  issueType?: string   // Issue type name (default "Task")
  labels?: string[]    // Labels applied to every created issue
}): ServerExtension[]
```

All four required fields (`siteUrl`, `email`, `apiToken`, `projectKey`) are validated at construction time — a missing value throws immediately so misconfiguration fails fast.

### `JiraConfig`

```ts
type JiraConfig = {
  siteUrl: string
  email: string
  apiToken: string
  projectKey: string
  issueType?: string
}
```

### `JiraExtensionOptions`

`JiraConfig` plus an optional `labels?: string[]` array.

## Configuration / env vars

| Env var | Description |
|---|---|
| `JIRA_SITE_URL` | Jira Cloud base URL, e.g. `https://acme.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_API_TOKEN` | API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `JIRA_PROJECT_KEY` | Project key, e.g. `PROJ` |

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)
- Jira Cloud (Atlassian REST API v3)

## Related packages

- **`@airnauts/airside-server`** — defines `ServerExtension` and `ThreadActionExtension`
- **`@airnauts/airside-extension-slack`** — Slack notification extension
- **`@airnauts/airside-extension-email`** — email notification extension

## License

MIT © Airnauts
