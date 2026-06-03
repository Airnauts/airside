# @airnauts/comments-notifier-slack

Slack notifier for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool)
server. Posts a message to a Slack channel whenever a reviewer creates a thread or replies.

## Setup

1. In Slack, create (or pick) an app and enable **Incoming Webhooks**.
2. **Add New Webhook to Workspace**, choose the channel, and copy the
   `https://hooks.slack.com/services/…` URL. The channel is baked into the URL —
   there is no separate channel name or bot token.

## Usage

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { slackNotifier } from '@airnauts/comments-notifier-slack'

createCommentsServer({
  repository,
  storage,
  notifiers: [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })],
})
```

A notification failure never breaks the comment write. The webhook request is
bounded by a 3-second timeout.
