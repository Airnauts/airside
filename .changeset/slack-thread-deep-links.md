---
"@airnauts/comments-notifier-slack": minor
---

Slack notifications now link straight to the specific thread (the same `?comments-thread=<id>` deep-link as the widget's "Copy link"), so clicking through opens the focused comment instead of just the page. Add `threadParam` to `slackNotifier` if your host page uses a custom thread query param.
