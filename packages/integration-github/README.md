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

# @airnauts/airside-extension-github

GitHub Issues thread-action extension for the [Airside](https://github.com/Airnauts/airside) server. Adds a **"Create GitHub issue"** button to each comment thread; clicking it opens a GitHub issue pre-filled with the thread content and stores the issue link back on the thread.

## Installation

```bash
pnpm add @airnauts/airside-extension-github
```

## Quick start

```ts
import { createAirsideServer } from '@airnauts/airside-server'
import { githubExtension } from '@airnauts/airside-extension-github'

createAirsideServer({
  repository,
  storage,
  secretKey: process.env.AIRSIDE_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  extensions: githubExtension({
    token: process.env.AIRSIDE_GITHUB_TOKEN!,
    owner: 'your-org',
    repo: 'your-repo',
  }),
})
```

The action appears in the thread toolbar. Once a GitHub issue has been created for a thread, the button hides itself — so repeated presses create only one issue. The issue URL is stored as an `externalLink` on the thread and shown in the UI.

## Authentication

Authenticate with a **fine-grained personal access token** (PAT) scoped to the single target repository with **Issues: write** — least privilege for v1. The token is sent as `authorization: Bearer <token>`.

That same `Bearer` header also accepts a **GitHub App installation token** a host mints itself, so moving to App-based auth later is a host concern with **no configuration change** here (ADR-0044).

## API reference

### `githubExtension(opts)`

```ts
githubExtension({
  token: string     // GitHub token (fine-grained PAT or App installation token) (required)
  owner: string     // Repository owner / org, e.g. "acme" (required)
  repo: string      // Repository name, e.g. "web" (required)
  baseUrl?: string  // API base URL (default "https://api.github.com"; set for GitHub Enterprise Server)
  labels?: string[] // Labels applied to every created issue
}): ServerExtension[]
```

All three required fields (`token`, `owner`, `repo`) are validated at construction time — a missing value throws immediately so misconfiguration fails fast.

### `GitHubConfig`

```ts
type GitHubConfig = {
  token: string
  owner: string
  repo: string
  baseUrl?: string
}
```

### `GitHubExtensionOptions`

`GitHubConfig` plus an optional `labels?: string[]` array.

## Configuration / env vars

| Env var | Description |
|---|---|
| `AIRSIDE_GITHUB_TOKEN` | GitHub token (fine-grained PAT, Issues: write). Deliberately **not** `GITHUB_TOKEN`, which GitHub Actions auto-injects scoped to the CI repo. |
| `AIRSIDE_GITHUB_OWNER` | Repository owner / org, e.g. `acme` |
| `AIRSIDE_GITHUB_REPO` | Repository name, e.g. `web` |

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)
- A GitHub repository with Issues enabled (GitHub.com or Enterprise Server)

## Related packages

- **`@airnauts/airside-server`** — defines `ServerExtension` and `ThreadActionExtension`
- **`@airnauts/airside-extension-jira`** — Jira Cloud thread-action extension
- **`@airnauts/airside-extension-slack`** — Slack notification extension
- **`@airnauts/airside-extension-email`** — email notification extension

## License

MIT © Airnauts
