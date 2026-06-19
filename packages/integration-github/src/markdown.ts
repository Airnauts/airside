import type { Thread } from '@airnauts/airside-core'

/**
 * Markdown builders for GitHub issue bodies — the Markdown analog of the Jira
 * extension's ADF builders. Pure functions over the core {@link Thread} shape;
 * they read every field defensively because callers may pass partially-populated
 * threads.
 *
 * Lives locally in this package for now (YAGNI). Hoisting it into a shared
 * workspace alongside the Linear target is explicitly that issue's work (#47).
 */

const TITLE_PREFIX = '[Page feedback] '
const TITLE_MAX = 255

/**
 * Build a GitHub issue title: the prefix followed by the first comment's text,
 * hard-truncated so the total length never exceeds {@link TITLE_MAX}. Only the
 * comment portion is trimmed, so the prefix always survives.
 */
export function buildIssueTitle(thread: Thread): string {
  const first = (thread.comments ?? [])[0]
  const body = first?.text ?? ''
  const budget = TITLE_MAX - TITLE_PREFIX.length
  return TITLE_PREFIX + body.slice(0, Math.max(0, budget))
}

/**
 * Build the Markdown used as the GitHub issue body: page title + URL, thread
 * id/status/anchor metadata, each comment (author, timestamp, text, editedAt,
 * attachment links) and deployment provenance when present.
 */
export function buildMarkdownDescription(thread: Thread): string {
  const lines: string[] = []

  // Page heading + link.
  const pageTitle = thread.pageTitle ?? thread.pageUrl
  lines.push(`## ${pageTitle}`, '', `[${thread.pageUrl}](${thread.pageUrl})`, '')

  // Thread metadata.
  lines.push(
    `- Thread: ${thread.id}`,
    `- Status: ${thread.status}`,
    `- Anchor: ${thread.anchorState}`,
    '',
  )

  // Comments.
  lines.push('### Comments', '')
  const comments = thread.comments ?? []
  for (const comment of comments) {
    const author = comment.author ?? { email: '' }
    const who = author.name ?? author.email ?? 'Unknown'
    const when = comment.editedAt
      ? `${comment.createdAt} (edited ${comment.editedAt})`
      : comment.createdAt
    lines.push(`**${who} · ${when}**`, '', comment.text ?? '', '')

    const attachments = comment.attachments ?? []
    if (attachments.length > 0) {
      for (const a of attachments) lines.push(`- [${a.name ?? a.url}](${a.url})`)
      lines.push('')
    }
  }

  // Provenance.
  const provenance = thread.provenance
  if (provenance && (provenance.branch || provenance.commitSha || provenance.deploymentId)) {
    lines.push('### Provenance', '')
    if (provenance.branch) lines.push(`- Branch: ${provenance.branch}`)
    if (provenance.commitSha) lines.push(`- Commit: ${provenance.commitSha}`)
    if (provenance.deploymentId) lines.push(`- Deployment: ${provenance.deploymentId}`)
    lines.push('')
  }

  return lines.join('\n')
}
