import type { ServerExtension } from '@airnauts/airside-server'
import type { GitHubConfig } from './client'
import { makeCreateGitHubIssueFromThread } from './create-issue'

export type { GitHubConfig } from './client'

/** Options for {@link githubExtension}: a {@link GitHubConfig} plus optional labels. */
export type GitHubExtensionOptions = GitHubConfig & { labels?: string[] }

function hasExternalLink(
  thread: { externalLinks?: { provider: string }[] },
  provider: string,
): boolean {
  return (thread.externalLinks ?? []).some((l) => l.provider === provider)
}

/**
 * Build the GitHub server extension(s): one `thread-action` that creates a
 * GitHub issue from a thread. Required config (`token`, `owner`, `repo`) is
 * validated at construction so misconfiguration fails fast. The action hides
 * itself once the thread already carries a GitHub link.
 */
export function githubExtension(opts: GitHubExtensionOptions): ServerExtension[] {
  for (const k of ['token', 'owner', 'repo'] as const) {
    if (!opts[k]) throw new Error(`githubExtension: missing required config '${k}'`)
  }
  const run = makeCreateGitHubIssueFromThread(opts, opts.labels)
  return [
    {
      kind: 'thread-action',
      id: 'github.createIssue',
      provider: 'github',
      label: 'Create GitHub issue',
      slot: 'thread-toolbar',
      presentation: { style: 'primary' },
      visibleWhen: ({ thread }) => !hasExternalLink(thread, 'github'),
      run,
    },
  ]
}
