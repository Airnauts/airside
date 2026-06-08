import type { NotificationEvent, Notifier } from '@airnauts/comments-server'

export type SlackNotifierOptions = {
  /** Slack Incoming Webhook URL. The target channel is baked into this URL. */
  webhookUrl: string
  /**
   * Query param the widget reads to focus a thread on load (the client's
   * `threadParam`). Must match the host page's config so the deep-link opens
   * the right thread. Defaults to `comments-thread`.
   */
  threadParam?: string
}

/** Default deep-link param — mirrors the client's `DEFAULT_THREAD_PARAM`. */
const DEFAULT_THREAD_PARAM = 'comments-thread'

/** Abort the webhook request after this many ms so a hung endpoint can't stall a write. */
const TIMEOUT_MS = 3000

export function slackNotifier(opts: SlackNotifierOptions): Notifier {
  return {
    name: 'slack',
    async notify(event: NotificationEvent): Promise<void> {
      const res = await fetch(opts.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formatSlackMessage(event, { threadParam: opts.threadParam })),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        // Never include the webhook URL — it is a credential that ends up in logs.
        throw new Error(`slack webhook responded ${res.status}`)
      }
    },
  }
}

export type SlackMessage = {
  text: string
  blocks: unknown[]
}

export type FormatOptions = {
  /** Override the deep-link query param (defaults to `comments-thread`). */
  threadParam?: string
}

/**
 * Build the thread deep-link Slack should point at — the same URL the widget's
 * "Copy link" action produces (`pageUrl?comments-thread=<id>`), so the reader
 * lands on the focused thread rather than the bare page.
 */
function threadLink(event: NotificationEvent, param: string): string {
  const url = new URL(event.pageUrl)
  url.searchParams.set(param, event.threadId)
  return url.toString()
}

/** Render a NotificationEvent as a Slack Block Kit message (with a plain-text fallback). */
export function formatSlackMessage(
  event: NotificationEvent,
  opts: FormatOptions = {},
): SlackMessage {
  const heading = event.type === 'comment.added' ? 'New reply' : 'New comment'
  const where = event.pageTitle ?? event.pageUrl
  const link = threadLink(event, opts.threadParam ?? DEFAULT_THREAD_PARAM)
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  // Image-only comments are allowed (empty text + an attachment), so fall back to
  // a label rather than rendering an empty quote / dangling "by … :".
  const body = event.text.trim() === '' ? '(image comment)' : event.text
  const quoted = body.replace(/\n/g, '\n>')

  return {
    // Plain-text fallback for notifications / accessibility.
    text: `${heading} by ${who}: ${body}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:speech_balloon: *${heading}* · <${link}|${where}>`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${quoted}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${who} · <${link}|Open thread>` }],
      },
    ],
  }
}
