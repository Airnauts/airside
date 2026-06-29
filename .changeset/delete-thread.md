---
"@airnauts/airside-server": minor
"@airnauts/airside-core": patch
"@airnauts/airside-client": patch
"@airnauts/airside-integration-next": patch
---

Reviewers can now delete a whole thread — its pin, comments, and attachment metadata — from the thread overflow (`···`) menu, behind a confirmation dialog. This adds a `DELETE /threads/:id` operation and a new `Repository.deleteThread(scope, id)` method that every adapter implements; the delete is a hard delete (embedded comments cascade) and attachment blobs are intentionally left in place. Custom `Repository` implementations must add `deleteThread`.
