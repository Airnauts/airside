# @airnauts/comments-notifier-email

## 0.6.0

### Minor Changes

- 3f4bcb1: New package: email notifications. `emailNotifications({ transport, from })` returns a notification
  extension — wire it via `createCommentsServer({ extensions: [...emailNotifications({ … })] })`. It
  emails the people already active in a thread when someone replies — the other comment authors,
  excluding the replier. A brand-new thread sends nothing until it has a reply; there is no recipient
  list to configure. Ships SMTP (`/smtp`, via the optional `nodemailer` peer, with a connection
  `timeout` cap) and Resend (`/resend`, fetch-based) transports, and exports an `EmailTransport` port
  so you can plug in any provider.

### Patch Changes

- e9cc0e9: Docs: README updated to match the current public API.
- Updated dependencies [3f4bcb1]
- Updated dependencies [bf41997]
- Updated dependencies [79fe6ba]
- Updated dependencies [54bbab0]
- Updated dependencies [cbf6378]
- Updated dependencies [e9cc0e9]
- Updated dependencies [bf41997]
- Updated dependencies [0292473]
- Updated dependencies [79fe6ba]
- Updated dependencies [3f4bcb1]
  - @airnauts/comments-core@0.6.0
  - @airnauts/comments-server@0.6.0
