import type { ThreadActionContext, ThreadActionResult } from '@airnauts/airside-server'
import { buildAdfDescription, buildSummary } from './adf'
import { createJiraClient, type JiraConfig } from './client'

/**
 * Build the `run` handler for the create-Jira-issue thread action. Bound to a
 * single {@link JiraConfig} (and optional labels) so the underlying client is
 * created once at construction.
 */
export function makeCreateJiraIssueFromThread(cfg: JiraConfig, labels?: string[]) {
  const client = createJiraClient(cfg)
  return async function createJiraIssueFromThread(
    ctx: ThreadActionContext,
  ): Promise<ThreadActionResult> {
    const issue = await client.createIssue({
      summary: buildSummary(ctx.thread),
      description: buildAdfDescription(ctx.thread),
      labels,
    })
    // Recovery aid for the create-succeeds/persist-fails edge case: if the
    // server fails to persist the externalLink, the key/url survives in logs.
    console.log(
      `[comments-jira] created issue ${issue.key} (${issue.url}) for thread ${ctx.thread.id}`,
    )
    return {
      externalLink: {
        provider: 'jira',
        externalId: issue.id,
        key: issue.key,
        label: `Jira ${issue.key}`,
        url: issue.url,
        createdAt: new Date().toISOString(),
      },
    }
  }
}
