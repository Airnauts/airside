# Refactor sweep — design (2026-06-12)

Goal: a structural refactor of the monorepo driven by duplication and oversized-component
findings. No behavior changes; every step is verified against the existing test suite
(`pnpm build && pnpm test && pnpm lint`). Breaking changes to *internal* component props are
allowed; public package APIs only gain exports (no removals).

## Scope — backend

### B1. `unresolvedCountOf` moves to core
All three repository adapters define the same domain policy inline
(`status === 'open' ? 1 : 0`): `adapter-memory/src/in-memory.ts:61`,
`adapter-mongo/src/repository.ts:52`, `adapter-postgres/src/repository.ts:30`.
This is scoring/threshold-adjacent domain policy, which per the architecture lives in
`core`. Add `unresolvedCountOf(status: ThreadStatus): number` to core (test-first),
export it, and consume it from all three adapters (memory's thread-shaped variant becomes
a call with `thread.status`).

### B2. Shared storage helpers move to server
`sanitizeName()` and `readAllBytes()` are byte-for-byte identical in
`storage-fs/src/index.ts:16-52` and `storage-vercel-blob/src/index.ts:15-44` (~49 lines
duplicated). The `StorageAdapter` contract already lives in `server/src/storage/types.ts`
and both packages already depend on `@airnauts/comments-server`, so add
`server/src/storage/util.ts` with both helpers (test-first), export them from the server
index, and delete the local copies.

### B3. Merge the two view mappers in server
`server/src/use-cases/view.ts` defines `toThreadView` and `toThreadListItemView` with
identical bodies. Replace with a single `withThreadActions(threadish, registry, scope)`
and update call sites.

### B4. Use-case test fixture reuse
Server use-case tests re-declare the attachment fixture that
`test-support/src/repository-contract.ts` already provides as `makeAttachment()`.
Export it for direct use and swap the inline copies.

## Scope — client (widget)

### F1. Identity context (removes 6-level prop drilling)
`identity` + `onNeedIdentity` are threaded through 8 files
(app → MarkerLayer/PanelDrawer → PinLayer/ThreadPopover/DetachedThread →
ThreadConversation → Composer). Add an `IdentityProvider` in `src/identity/` exposing
`useIdentity(): { identity, requestIdentity }`; `WidgetApp` provides it. All consumers
drop the two props and read the context. Component tests get a small provider wrapper
helper. This is a breaking change to internal component props only — the public widget
API (`init` options) is unchanged.

### F2. `useAttachmentUpload` hook out of Composer
`Composer.tsx` (220 lines) mixes text-input state with the pending-attachment lifecycle
(preview object URLs, upload, retry, controlled/uncontrolled hand-off). Extract the
attachment machinery into `ui/useAttachmentUpload.ts`; Composer keeps text + send.

### F3. `useSubmitReply` hook out of ThreadConversation
The optimistic reply orchestration (`ThreadConversation.tsx:67-111` — temp id, count
bump, optimistic reopen, rollback, toasts) moves to `threads/useSubmitReply.ts`. The
component keeps rendering concerns.

### F4. PanelDrawer split + shared state indicator
`PanelDrawer.tsx` (311 lines) renders two views plus filter chips, a toggle, and three
inline status states. Split into `panel/PanelDetailView.tsx` (the existing inner
`DetailView`), `panel/PanelListView.tsx` (filter bar + needs-review + rows + load-more),
keeping `PanelDrawer` as the Dialog shell that picks a view. Extract a shared
`ui/StatusNotice.tsx` for the loading/error(+retry)/empty trio used by both the panel
list and (where it fits without changing markup semantics) CommentList's error/empty
branches.

### F5. MarkerLayer hook extraction
`MarkerLayer.tsx` (286 lines) hosts three concerns. Extract:
- `marker/usePlacingMode.ts` — the place-mode capture-phase click/Escape listeners
  (lines 173-214) returning `{ placing, setPlacing }`.
- `marker/DraftPopover.tsx` — the draft pin + popover JSX (lines 225-276).
The anchor-runtime effect stays in MarkerLayer (it is the component's core job and its
cleanup is tightly coupled to controller registration).

## Considered and rejected

- **Adapter `toThread`/`toListItem` consolidation** — the stored shapes genuinely differ
  per backend (Mongo `_id` strip, Postgres row split, memory spread); a shared helper
  would abstract over differences instead of duplication. Skipped.
- **threads/state.ts sub-reducers** — 252 lines, 23 actions, well-tested and cohesive;
  slicing adds indirection without fixing a real problem today. Skipped.
- **Controller listener redesign (reactive sync)** — touches the most fragile
  optimistic-update machinery for a purely aesthetic gain. Skipped.
- **Notifier transport formalization** — two transports already share a structural
  interface; a base type adds ceremony. Skipped.

## Testing strategy

- Backend changes are test-first per ADR-0010: new core/server helper tests are written
  before the helpers; adapter/storage swaps are covered by the existing contract suites.
- Client refactors are behavior-preserving: the existing 54 test files / 319 tests must
  stay green after each step; extracted hooks get their coverage through the existing
  component tests (plus the provider wrapper helper for the identity context).
- Each scope item lands as its own commit with `pnpm build && pnpm test && pnpm lint`
  green (turbo runs the affected graph).

## Release notes

Affected publishable packages get changesets: `core` (new export, minor),
`server` (new exports, minor), `adapter-memory`/`adapter-mongo`/`adapter-postgres`/
`storage-fs`/`storage-vercel-blob` (internal refactor, patch), `client` (internal
restructure, patch). Pre-1.0 policy: breaking → minor, but no public API breaks here.
