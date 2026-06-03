# Ideas backlog

Forward-looking ideas deliberately deferred. Sibling to `issues.md` (which logs
known rough edges in shipped behavior). Each entry: what, why deferred, rough shape.

## Detail-view prev/next navigation

Up/down chevrons in the sidebar detail header that step through the current filtered
list order without returning to the list (Vercel-toolbar parity). Deferred from the
sidebar master–detail iteration to keep that change focused. Shape: track the index of
`detailThreadId` within `panel.state.list`; chevrons dispatch `OPEN_DETAIL` for the
neighbor + `requestFocus`.

## Emoji reactions on comments

React to a comment with emoji. Deferred — it is a full backend feature: a new field on
the `Comment` schema, add/remove-reaction endpoints, both adapters, and the contract
suite. Not a UI-only change.

## Per-comment more-menu (···)

Overflow menu per comment (edit / delete / copy text). Deferred — edit and delete are
new backend operations (`PATCH`/`DELETE` on a comment) with their own contract +
optimistic UI.
