import type { ThreadActionContext, ThreadActionResult } from '@airnauts/airside-server'
import { createGitHubClient, type GitHubConfig } from './client'
import { buildIssueTitle, buildMarkdownDescription } from './markdown'

/**
 * Build the `run` handler for the create-GitHub-issue thread action. Bound to a
 * single {@link GitHubConfig} (and optional labels) so the underlying client is
 * created once at construction.
 */
export function makeCreateGitHubIssueFromThread(cfg: GitHubConfig, labels?: string[]) {
  const client = createGitHubClient(cfg)
  return async function createGitHubIssueFromThread(
    ctx: ThreadActionContext,
  ): Promise<ThreadActionResult> {
    const issue = await client.createIssue({
      title: buildIssueTitle(ctx.thread),
      body: buildMarkdownDescription(ctx.thread),
      labels,
    })
    // Recovery aid for the create-succeeds/persist-fails edge case: if the
    // server fails to persist the externalLink, the key/url survives in logs.
    console.log(
      `[airside-github] created issue ${issue.key} (${issue.url}) for thread ${ctx.thread.id}`,
    )
    return {
      externalLink: {
        provider: 'github',
        externalId: issue.externalId,
        key: issue.key,
        label: `GitHub ${issue.key}`,
        url: issue.url,
        createdAt: new Date().toISOString(),
      },
    }
  }
}
