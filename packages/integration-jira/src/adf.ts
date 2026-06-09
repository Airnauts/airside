import type { Thread } from '@airnauts/comments-core'

/**
 * Atlassian Document Format (ADF) builders for Jira Cloud REST v3.
 *
 * These are pure functions over the core {@link Thread} shape. They read every
 * field defensively because callers may pass partially-populated threads.
 */

/** A loose ADF node. ADF is a recursive tree of typed nodes. */
export type AdfNode = { type: string; [k: string]: unknown }

/** The top-level ADF document. */
export type AdfDoc = { type: 'doc'; version: 1; content: AdfNode[] }

const SUMMARY_PREFIX = '[Page feedback] '
const SUMMARY_MAX = 255

/** A plain inline text node. */
function text(value: string): AdfNode {
  return { type: 'text', text: value }
}

/** An inline text node carrying a link mark. */
function link(label: string, href: string): AdfNode {
  return { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }
}

function heading(value: string, level: number): AdfNode {
  return { type: 'heading', attrs: { level }, content: [text(value)] }
}

function paragraph(content: AdfNode[]): AdfNode {
  return { type: 'paragraph', content }
}

function bulletList(items: AdfNode[][]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((content) => ({ type: 'listItem', content: [paragraph(content)] })),
  }
}

/**
 * Build a Jira issue summary: the prefix followed by the first comment's text,
 * hard-truncated so the total length never exceeds {@link SUMMARY_MAX}. Only
 * the comment portion is trimmed, so the prefix always survives.
 */
export function buildSummary(thread: Thread): string {
  const first = (thread.comments ?? [])[0]
  const body = first?.text ?? ''
  const budget = SUMMARY_MAX - SUMMARY_PREFIX.length
  return SUMMARY_PREFIX + body.slice(0, Math.max(0, budget))
}

/**
 * Build the ADF document used as the Jira issue description: page title + URL,
 * thread id/status/anchor metadata, each comment (author, timestamp, text,
 * editedAt, attachment links) and deployment provenance when present.
 */
export function buildAdfDescription(thread: Thread): AdfDoc {
  const content: AdfNode[] = []

  // Page heading + link.
  const pageTitle = thread.pageTitle ?? thread.pageUrl
  content.push(heading(pageTitle, 2))
  content.push(paragraph([link(thread.pageUrl, thread.pageUrl)]))

  // Thread metadata.
  content.push(
    bulletList([
      [text(`Thread: ${thread.id}`)],
      [text(`Status: ${thread.status}`)],
      [text(`Anchor: ${thread.anchorState}`)],
    ]),
  )

  // Comments.
  content.push(heading('Comments', 3))
  const comments = thread.comments ?? []
  for (const comment of comments) {
    const author = comment.author ?? { email: '' }
    const who = author.name ?? author.email ?? 'Unknown'
    const when = comment.editedAt
      ? `${comment.createdAt} (edited ${comment.editedAt})`
      : comment.createdAt
    content.push(paragraph([{ ...text(`${who} · ${when}`), marks: [{ type: 'strong' }] }]))
    content.push(paragraph([text(comment.text ?? '')]))

    const attachments = comment.attachments ?? []
    if (attachments.length > 0) {
      content.push(bulletList(attachments.map((a) => [link(a.name ?? a.url, a.url)])))
    }
  }

  // Provenance.
  const provenance = thread.provenance
  if (provenance && (provenance.branch || provenance.commitSha || provenance.deploymentId)) {
    content.push(heading('Provenance', 3))
    const items: AdfNode[][] = []
    if (provenance.branch) items.push([text(`Branch: ${provenance.branch}`)])
    if (provenance.commitSha) items.push([text(`Commit: ${provenance.commitSha}`)])
    if (provenance.deploymentId) items.push([text(`Deployment: ${provenance.deploymentId}`)])
    content.push(bulletList(items))
  }

  return { type: 'doc', version: 1, content }
}
