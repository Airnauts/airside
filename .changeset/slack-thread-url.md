---
"@airnauts/comments-notifier-slack": minor
---

The Slack notifier now uses the deep-link built by the server. The `threadParam` option has been
removed from `slackNotifier(...)`; set `threadParam` on `createCommentsServer` instead if you have
customized the widget's thread param.
