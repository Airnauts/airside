---
"@airnauts/comments-client": patch
---

Fix the comment pin closing when a logged-out user enters their name/email: the identity
modal no longer dismisses the open thread or draft popover behind it, so after submitting
their details the comment posts and the pin stays open and focused.
