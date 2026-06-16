---
"@airnauts/airside-client": patch
---

Keep widget text from scaling with the host page's root font-size. The widget root
now pins a fixed base `font-size`, so any text without an explicit size — most
visibly the login modal's title and description — stays put on hosts that set a
responsive `html { font-size: clamp(…) }`. The login modal's heading, body, and
inputs also carry explicit sizes for a stable hierarchy.
