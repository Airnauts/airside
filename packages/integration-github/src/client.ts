import { IntegrationError } from '@airnauts/airside-server'

/** Connection + repository settings for the GitHub Issues REST API. */
export type GitHubConfig = {
  token: string
  owner: string
  repo: string
  /** Default `https://api.github.com`; set for GitHub Enterprise Server. */
  baseUrl?: string
}

/** Input for creating a GitHub issue. `body` is Markdown. */
export type CreateIssueInput = {
  title: string
  body: string
  labels?: string[]
}

/** Reference to a created GitHub issue. */
export type GitHubIssueRef = {
  externalId: string
  key: string
  url: string
}

/** A minimal client for the GitHub REST create-issue endpoint. */
export type GitHubClient = {
  createIssue(input: CreateIssueInput): Promise<GitHubIssueRef>
}

const PROVIDER = 'github'
const REQUEST_TIMEOUT_MS = 5000
const DEFAULT_BASE_URL = 'https://api.github.com'
const API_VERSION = '2022-11-28'

/**
 * Build a GitHub client bound to {@link GitHubConfig}. Every failure — a non-2xx
 * response or a network/abort error — surfaces as an {@link IntegrationError} so
 * the host maps it to a 502. The token never appears in any error message.
 *
 * Authenticates with `authorization: Bearer <token>`, which accepts a
 * fine-grained PAT today and a GitHub App installation token later with no
 * config-surface change (ADR-0044).
 */
export function createGitHubClient(cfg: GitHubConfig): GitHubClient {
  const base = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

  async function createIssue(input: CreateIssueInput): Promise<GitHubIssueRef> {
    const payload: Record<string, unknown> = { title: input.title, body: input.body }
    if (input.labels !== undefined) payload.labels = input.labels

    try {
      const res = await fetch(`${base}/repos/${cfg.owner}/${cfg.repo}/issues`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        throw new IntegrationError(`github: create issue failed (${res.status})`, PROVIDER)
      }

      const issue = (await res.json()) as { id: number; number: number; html_url: string }
      return {
        externalId: String(issue.id),
        key: `#${issue.number}`,
        url: issue.html_url,
      }
    } catch (err) {
      // Re-throw a status-mapped IntegrationError as-is; only wrap raw failures.
      if (err instanceof IntegrationError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new IntegrationError(`github: request failed: ${msg}`, PROVIDER)
    }
  }

  return { createIssue }
}
