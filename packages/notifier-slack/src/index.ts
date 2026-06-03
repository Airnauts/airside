import type { NotificationEvent, Notifier } from '@airnauts/comments-server'

export type SlackNotifierOptions = {
  /** Slack Incoming Webhook URL. The target channel is baked into this URL. */
  webhookUrl: string
}

/** Abort the webhook request after this many ms so a hung endpoint can't stall a write. */
const TIMEOUT_MS = 3000

export function slackNotifier(opts: SlackNotifierOptions): Notifier {
  return {
    name: 'slack',
    async notify(event: NotificationEvent): Promise<void> {
      const res = await fetch(opts.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formatSlackMessage(event)),
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

/** Render a NotificationEvent as a Slack Block Kit message (with a plain-text fallback). */
export function formatSlackMessage(event: NotificationEvent): SlackMessage {
  const heading = event.type === 'comment.added' ? 'New reply' : 'New comment'
  const where = event.pageTitle ?? event.pageUrl
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  const quoted = event.text.replace(/\n/g, '\n>')

  return {
    // Plain-text fallback for notifications / accessibility.
    text: `${heading} by ${who}: ${event.text}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:speech_balloon: *${heading}* · <${event.pageUrl}|${where}>`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${quoted}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${who} · <${event.pageUrl}|Open page>` }],
      },
    ],
  }
}
