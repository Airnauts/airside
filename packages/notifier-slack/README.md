<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
</p>

# @airnauts/airside-extension-slack

Slack Incoming Webhook notification extension for the [Airside](https://github.com/Airnauts/airside) server. Posts a Block Kit message to a Slack channel whenever a reviewer creates a thread or adds a reply.

## Installation

```bash
pnpm add @airnauts/airside-extension-slack
```

## Quick start

1. In Slack, create (or pick) an app, enable **Incoming Webhooks**, and add a webhook to your channel. Copy the `https://hooks.slack.com/services/…` URL — the channel is baked into it.

2. Pass the result to `createAirsideServer`:

```ts
import { createAirsideServer } from '@airnauts/airside-server'
import { slackExtension } from '@airnauts/airside-extension-slack'

createAirsideServer({
  repository,
  storage,
  secretKey: process.env.AIRSIDE_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  extensions: slackExtension({
    webhookUrl: process.env.AIRSIDE_SLACK_WEBHOOK_URL!,
  }),
})
```

## API reference

### `slackExtension(opts)`

```ts
slackExtension({
  webhookUrl: string  // Slack Incoming Webhook URL (required)
}): NotificationExtension[]
```

Returns a `NotificationExtension[]` ready to pass to `extensions`. Notification failures are isolated — a hung or erroring webhook never breaks the comment write. Each webhook request is bounded by a 3-second timeout.

### `formatSlackMessage(event)`

```ts
import { formatSlackMessage } from '@airnauts/airside-extension-slack'

const message: SlackMessage = formatSlackMessage(event)
// { text: string; blocks: unknown[] }
```

Renders a `NotificationEvent` as a Slack Block Kit message with a plain-text fallback. Exported for testing or custom dispatch.

### Types

| Export | Description |
|---|---|
| `SlackExtensionOptions` | `{ webhookUrl: string }` |
| `SlackMessage` | `{ text: string; blocks: unknown[] }` |

## Configuration / env vars

| Env var | Description |
|---|---|
| `AIRSIDE_SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

## Requirements

- Node.js ≥ 18 (or any fetch-capable runtime)

## Related packages

- **`@airnauts/airside-server`** — defines `NotificationExtension` and `NotificationEvent`
- **`@airnauts/airside-extension-email`** — email notification alternative
- **`@airnauts/airside-extension-jira`** — Jira thread-action extension

## License

MIT © Airnauts
