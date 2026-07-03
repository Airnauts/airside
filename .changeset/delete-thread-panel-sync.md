---
"@airnauts/airside-client": patch
---

Deleting a thread now updates the comments sidebar immediately: the deleted thread's row disappears from the list without a page refresh, and if its detail pane was open, the drawer returns to the thread list instead of getting stuck on the now-gone thread.
