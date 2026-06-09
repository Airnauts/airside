import type { NotificationEvent } from '@airnauts/comments-server'

export type EmailFormat = { subject: string; html: string; text: string }
export type FormatEmailOptions = { subjectPrefix?: string }

/** Escape the five characters that are significant in HTML text/attribute context. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Fold CR/LF to a single space. The subject is built from a host-provided
 * pageTitle, so collapsing newlines here guards against header injection
 * independent of the transport.
 */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

/** Render a NotificationEvent as a subject + HTML + plain-text multipart body. */
export function formatEmail(event: NotificationEvent, opts: FormatEmailOptions = {}): EmailFormat {
  const heading = event.type === 'comment.added' ? 'New reply' : 'New comment'
  const where = event.pageTitle ?? event.pageUrl
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  // Image-only comments are allowed (empty text + an attachment).
  const body = event.text.trim() === '' ? '(image comment)' : event.text
  const subject = singleLine(`${opts.subjectPrefix ?? ''}${heading} on ${where}`)

  const text = `${heading} by ${who}\n\n${body}\n\nView thread: ${event.threadUrl}`

  // A minimal HTML document (not bare fragments) so clients like Outlook render
  // predictably. User-controlled values are escaped.
  const html = [
    '<!doctype html>',
    '<html><body>',
    `<p><strong>${escapeHtml(heading)}</strong> on ${escapeHtml(where)}</p>`,
    `<p>${escapeHtml(who)} wrote:</p>`,
    `<blockquote>${escapeHtml(body).replace(/\n/g, '<br>')}</blockquote>`,
    `<p><a href="${escapeHtml(event.threadUrl)}">View thread</a></p>`,
    '</body></html>',
  ].join('\n')

  return { subject, html, text }
}
