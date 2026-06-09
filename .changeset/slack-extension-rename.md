---
"@airnauts/comments-notifier-slack": minor
---

`slackNotifier(...)` has been renamed to `slackNotifications(...)` and now returns a notification
extension. Wire it through the server's `extensions` option:
`createCommentsServer({ extensions: [...slackNotifications({ webhookUrl })] })`.
