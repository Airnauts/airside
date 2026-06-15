# @airnauts/comments-notifier-slack

Slack Incoming Webhook notification extension for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server. Posts a Block Kit message to a Slack channel whenever a reviewer creates a thread or adds a reply.

## Installation

```bash
pnpm add @airnauts/comments-notifier-slack
```

## Quick start

1. In Slack, create (or pick) an app, enable **Incoming Webhooks**, and add a webhook to your channel. Copy the `https://hooks.slack.com/services/…` URL — the channel is baked into it.

2. Pass the result to `createCommentsServer`:

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { slackNotifications } from '@airnauts/comments-notifier-slack'

createCommentsServer({
  repository,
  storage,
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  extensions: slackNotifications({
    webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL!,
  }),
})
```

## API reference

### `slackNotifications(opts)`

```ts
slackNotifications({
  webhookUrl: string  // Slack Incoming Webhook URL (required)
}): NotificationExtension[]
```

Returns a `NotificationExtension[]` ready to pass to `extensions`. Notification failures are isolated — a hung or erroring webhook never breaks the comment write. Each webhook request is bounded by a 3-second timeout.

### `formatSlackMessage(event)`

```ts
import { formatSlackMessage } from '@airnauts/comments-notifier-slack'

const message: SlackMessage = formatSlackMessage(event)
// { text: string; blocks: unknown[] }
```

Renders a `NotificationEvent` as a Slack Block Kit message with a plain-text fallback. Exported for testing or custom dispatch.

### Types

| Export | Description |
|---|---|
| `SlackNotifierOptions` | `{ webhookUrl: string }` |
| `SlackMessage` | `{ text: string; blocks: unknown[] }` |

## Configuration / env vars

| Env var | Description |
|---|---|
| `COMMENTS_SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)

## Related packages

- **`@airnauts/comments-server`** — defines `NotificationExtension` and `NotificationEvent`
- **`@airnauts/comments-notifier-email`** — email notification alternative
- **`@airnauts/comments-integration-jira`** — Jira thread-action extension

## License

MIT © Airnauts
