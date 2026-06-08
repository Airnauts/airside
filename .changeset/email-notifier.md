---
"@airnauts/comments-notifier-email": minor
---

New package: email notifications. `emailNotifier({ transport, to, from })` emails a fixed
recipient list on new comments and replies. Ships SMTP (`/smtp`, via the optional `nodemailer`
peer) and Resend (`/resend`, fetch-based) transports, and exports an `EmailTransport` port so you
can plug in any provider.
