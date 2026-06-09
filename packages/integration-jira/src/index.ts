import type { ServerExtension } from '@airnauts/comments-server'
import type { JiraConfig } from './client'
import { makeCreateJiraIssueFromThread } from './create-issue'

export type { JiraConfig } from './client'

/** Options for {@link jiraIssues}: a {@link JiraConfig} plus optional labels. */
export type JiraIssuesOptions = JiraConfig & { labels?: string[] }

function hasExternalLink(
  thread: { externalLinks?: { provider: string }[] },
  provider: string,
): boolean {
  return (thread.externalLinks ?? []).some((l) => l.provider === provider)
}

/**
 * Build the Jira server extension(s): one `thread-action` that creates a Jira
 * issue from a thread. Required config (`siteUrl`, `email`, `apiToken`,
 * `projectKey`) is validated at construction so misconfiguration fails fast.
 * The action hides itself once the thread already carries a Jira link.
 */
export function jiraIssues(opts: JiraIssuesOptions): ServerExtension[] {
  for (const k of ['siteUrl', 'email', 'apiToken', 'projectKey'] as const) {
    if (!opts[k]) throw new Error(`jiraIssues: missing required config '${k}'`)
  }
  const run = makeCreateJiraIssueFromThread(opts, opts.labels)
  return [
    {
      kind: 'thread-action',
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      presentation: { style: 'primary' },
      visibleWhen: ({ thread }) => !hasExternalLink(thread, 'jira'),
      run,
    },
  ]
}
