---
"@airnauts/comments-server": minor
"@airnauts/comments-notifier-slack": minor
---

Add Slack notifications. The server now accepts `notifiers: [...]`, a generic outbound
channel seam, and the new `@airnauts/comments-notifier-slack` package posts a message to a
Slack channel (via an Incoming Webhook) whenever a reviewer creates a thread or replies —
showing who commented, the text, and a link to the page. Notification failures never break
a comment write.
