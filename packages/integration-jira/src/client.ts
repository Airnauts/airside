import { IntegrationError } from '@airnauts/comments-server'
import type { AdfDoc } from './adf'

/** Connection + project settings for a Jira Cloud site. */
export type JiraConfig = {
  siteUrl: string
  email: string
  apiToken: string
  projectKey: string
  issueType?: string
}

/** Input for creating a Jira issue. `description` is an ADF document. */
export type CreateIssueInput = {
  summary: string
  description: AdfDoc
  labels?: string[]
}

/** Reference to a created Jira issue. */
export type JiraIssueRef = {
  id: string
  key: string
  url: string
}

/** A minimal client for the Jira Cloud REST v3 create-issue endpoint. */
export type JiraClient = {
  createIssue(input: CreateIssueInput): Promise<JiraIssueRef>
}

const PROVIDER = 'jira'
const REQUEST_TIMEOUT_MS = 5000

/**
 * Build a Jira Cloud client bound to {@link JiraConfig}. Every failure — a
 * non-2xx response or a network/abort error — surfaces as an
 * {@link IntegrationError} so the host maps it to a 502. The API token never
 * appears in any error message.
 */
export function createJiraClient(cfg: JiraConfig): JiraClient {
  const base = cfg.siteUrl.replace(/\/+$/, '')
  const authorization = `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`

  async function createIssue(input: CreateIssueInput): Promise<JiraIssueRef> {
    const fields: Record<string, unknown> = {
      project: { key: cfg.projectKey },
      issuetype: { name: cfg.issueType ?? 'Task' },
      summary: input.summary,
      description: input.description,
    }
    if (input.labels !== undefined) fields.labels = input.labels

    try {
      const res = await fetch(`${base}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        throw new IntegrationError(`jira: create issue failed (${res.status})`, PROVIDER)
      }

      const { id, key } = (await res.json()) as { id: string; key: string }
      return { id, key, url: `${base}/browse/${key}` }
    } catch (err) {
      // Re-throw a status-mapped IntegrationError as-is; only wrap raw failures.
      if (err instanceof IntegrationError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new IntegrationError(`jira: request failed: ${msg}`, PROVIDER)
    }
  }

  return { createIssue }
}
