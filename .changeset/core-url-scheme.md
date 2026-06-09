---
"@airnauts/comments-core": minor
---

`pageUrl` is now restricted to `http(s)` schemes on both the create-thread request and the
`Thread` schema. This rejects `javascript:`, `data:`, and similar active schemes so a link built
from `pageUrl` server-side (notification deep-links) can never carry one. Browser hosts are
unaffected (`window.location.href` is always http(s)).
