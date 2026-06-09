---
"@airnauts/comments-notifier-email": minor
---

New package: email notifications. `emailNotifier({ transport, from })` emails the people already
active in a thread when someone replies — the other comment authors, excluding the replier. A
brand-new thread sends nothing until it has a reply; there is no recipient list to configure.
Ships SMTP (`/smtp`, via the optional `nodemailer` peer, with a connection `timeout` cap) and
Resend (`/resend`, fetch-based) transports, and exports an `EmailTransport` port so you can plug in
any provider.
