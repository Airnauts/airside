---
"@airnauts/comments-client": minor
---

Gate the commenting UI behind a "Log in" step. A logged-out reviewer now sees only a Log In
button; placing comments, pins, and the panel appear after entering a name/email up front
(self-asserted, as before — no verification). Identity is remembered, so return visits skip
the prompt.
