# Sidebar master–detail view with parallel pin & synced drafts — design

- **Status:** Approved
- **Date:** 2026-06-03
- **Track:** Frontend + Backend (contract) · Size: M
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §6 (panel) · [`docs/prd.md`](../../prd.md) §6.6
- **Depends on:** M7 (thread popover / `ThreadCard` / `Composer`), M8 (cross-page panel + focus handoff)

## Goal

Reshape the comments sidebar into a **Vercel-toolbar-style master–detail surface**:

- The **list view** shows each thread's **initial (root) comment** inline, so you can
  tell what a thread is about without opening it — alongside the page-context box and
  a `N Replies` / `Reply` affordance.
- Clicking a card (or its Reply) opens an in-sidebar **detail view** — Back button
  top-left, the full message list, and a composer — while **also** navigating to the
  thread's page and focusing its pin (the existing M8 flow).
- The **pin popover stays and runs in parallel** with the sidebar detail (open/close
  independently), and the **composer draft is synced** between the two surfaces for
  the same thread (text live; the uploaded attachment once stored).
- Per-card actions for this iteration: **Resolve (✓)** and **Copy link**.

This reference UI is the Vercel toolbar; the three reference screenshots provided by
the user (list with root messages → detail with Back → detail + parallel pin popover
with mirrored composer text) are the acceptance picture.

## What is already built and reused, not rebuilt

- **`panel/` slice** (M8) — `PanelState`, reducer, `PanelController`, `PanelDrawer`,
  `PanelRow`, the Launcher trigger, filters, "Needs review", and `loadMore`. We extend
  this slice; we do not add a parallel one.
- **`threads/` slice + `controller.ts`** — `openThread(id)`, `requestFocus(id)` (scroll
  + pulse), `setStatus`, `patchStatus`, the lazy `getThread` detail cache, and the
  runtime status bridge. The detail view and pin both read this open-thread state.
- **`ThreadCard` / `CommentList` / `Composer` / `Attachment`** (M7) — the conversation
  UI. §4 extracts a shared inner from `ThreadCard`; §5 makes `Composer` controllable.
- **`panel/navigate.ts`** — `goToThread` (stash + navigate) and `takeFocusHandoff`
  (consume on arrival). §6 grows the handoff payload.
- **`MarkerLayer`** — boot consumer that calls `takeFocusHandoff()` after the first
  refresh (`MarkerLayer.tsx:99`). §6 wires the panel controller into this point.
- **`gate.ts` / `index.ts` URL-param + activation precedent** (`?comments-key`, read
  then stripped, persisted) — §7's copy-link deep-link mirrors this pattern.
- **`adapter-memory` + `adapter-mongo` + shared contract suite** — §2's contract change
  is authored test-first against the shared suite, then satisfied by both adapters
  (ADR-0010).

## §1. The two-view sidebar

The sidebar is one drawer with two views. State extends the existing `panel/` slice
(it does **not** become a second slice):

```
type PanelView = 'list' | 'detail'

type PanelState = {
  // ...existing M8 fields (open, filter, list, nextCursor, loading, loadingMore,
  //    error, needsReview)...
  view: PanelView              // 'list' default
  detailThreadId: string | null // the thread shown in detail, or null in list view
}
```

New reducer actions:

- `OPEN_DETAIL { id }` → `view: 'detail'`, `detailThreadId: id`.
- `BACK` → `view: 'list'`, `detailThreadId: null`. **Does not touch the pin** (the
  threads-store `openId` is independent — see §3).
- `CLOSE` (existing) resets `view → 'list'` so the next open starts on the list.

The drawer header is view-dependent: **list view** keeps "Comments" + filters; **detail
view** shows a **Back** button top-left (and the existing close ✕). Prev/next chevrons
from the reference UI are **deferred** (§8).

## §2. Backend — extend `ThreadListItem` with the root comment (TDD)

The list payload carries no comment body today — only `commentCount`, `createdBy`,
timestamps. Rendering the root message in each card without an N+1 of `getThread`
requires extending the contract.

**Schema change** (`packages/core/src/schemas/thread.ts`), additive — on
**`ThreadListItem` only** (not `ThreadBase`/`Thread`, which keep the full `comments`
array):

```
rootComment: { text: string; createdAt: IsoTimestamp } | null
```

- The author of the root comment is already `ThreadBase.createdBy`; its time is already
  `createdAt`. The only missing datum is the **text**, so the field is intentionally
  minimal. `text` is a plain `z.string()` (comments are never null) — it is **empty
  (`''`) for an attachment-only root**, since a comment always carries text *or* an
  attachment. `rootComment` itself is `null` only for the degenerate no-comments thread
  (not normally reachable, but the schema stays total). The card renders the text, or a
  "📎 Attachment" placeholder when the text is empty.
- `replies = commentCount - 1`. The card shows `N Replies` when `> 0`, else a `Reply`
  link. No new count field.

**Built test-first (ADR-0010):**

1. Extend the **core zod schema** + its unit test first (red).
2. Extend the **shared adapter contract suite** — a thread with a text root projects
   `rootComment.text === '<text>'`; an attachment-only root projects `text === ''`;
   and `updateAnchor` (the `refreshAnchor` path) also returns a `ThreadListItem`
   carrying `rootComment`. This is the executable spec both adapters must satisfy.
3. Make `adapter-memory` then `adapter-mongo` compute `rootComment` from `comments[0]`
   (the earliest comment = root) in the **shared `toListItem` helper**, which both
   `listThreads` and `updateAnchor` already route through. `adapter-mongo`'s
   `listThreads` projection currently excludes `comments`; widen it to
   `{ comments: { $slice: 1 }, captureContext: 0, provenance: 0 }` so the root is
   available (`$slice` is permitted alongside exclusions). `server` passes the field
   through (it serializes whatever the repository returns against the contract).

**Release mechanics:** additive contract field → **`minor`** bump pre-1.0 (per the
changeset policy) across the affected publishable packages (`core`, both adapters,
`server`, and `client` which consumes the field). Add a **changeset** and an **ADR**
recording the `ThreadListItem` extension (contract changes are architecturally
significant — see CLAUDE.md "When to add an ADR").

## §3. Coexistence: sidebar detail and pin popover are independent

The pin popover (`ThreadPopover`) is keyed off the threads-store `openId` — unchanged.
The sidebar detail is keyed off `panel.detailThreadId`. They are **independent
surfaces** that happen to be opened together by the same gesture:

- Opening a thread from the sidebar sets **both** `panel.detailThreadId` (sidebar) and
  threads `openId` (pin popover) — see §6.
- `BACK` clears only `detailThreadId`; the pin popover stays open (`openId` untouched).
- Closing the pin popover (its ✕) clears only `openId`; the sidebar detail stays.

Both render the same conversation for the same thread, reading the same `threads`
detail cache (`getThread`), so replies/status stay consistent across the two.

## §4. The detail view — a restructure of `ThreadCard`, not a drop-in reuse

The reference detail view renders the **root comment + page-context box specially at
the top**, then replies below; today `CommentList` renders all comments uniformly and
`ThreadCard` is sized for the popover (`w-80`).

Extract a shared inner — `ThreadConversation` — used by **both** the popover and the
sidebar detail:

- **Props:** `item`, `client`, `identity`, `onNeedIdentity`, plus a `variant:
  'popover' | 'sidebar'`.
- **Renders:** status/header row (resolve/reopen toggle), the page-context box
  (title + path) in the `sidebar` variant, root comment, reply list, and the composer.
- `ThreadPopover` wraps it at `w-80`; the sidebar detail renders it full-width inside
  the drawer below the Back header.

`ThreadCard` is refactored into (or replaced by) `ThreadConversation`; the optimistic
reply / reopen logic moves with it unchanged. No behavior change to the popover beyond
the extraction.

## §5. Synced composer draft (text + stored attachment)

A new **`drafts` slice keyed by `threadId`** holds `{ text: string; attachment:
Attachment | null }`. It lives alongside the threads store (it is per-open-thread, not
per-panel).

- **Text** syncs live — a shared string both composers read/write.
- **Upload stays local** to whichever composer the file was picked in. The existing
  `Composer` `pending` state, the object-URL preview, the `uploading → ready/error`
  transitions, and **object-URL revocation on unmount/clear are unchanged and remain
  owned by the originating composer.** No cross-surface object-URL lifecycle.
- **On `ready`**, the originating composer writes the resulting **`Attachment`**
  (`{ id, url, name, contentType, size, w?, h? }` — already returned by `upload()`)
  into the shared draft and renders from it. The **other** surface renders that
  attachment from its server `attachment.url`. Net effect: a file mid-upload shows only
  in the box you picked it in; once stored, it appears in both.
- **Send** uses `attachmentIds = draft.attachment ? [draft.attachment.id] : []`.
- **Clear on success** clears the **shared** slice (text + attachment) keyed by
  `threadId` — not local component state — so the two composers can't fight. The
  optimistic-reply path in the conversation component (formerly `ThreadCard`) clears
  the shared slice too.

`Composer` becomes **controlled over `text`** (`value` + `onValueChange`) and reads/
writes the shared `attachment`, while keeping its own transient `pending` for the
in-flight upload. When `threadId`/the controlled props are **absent** (the new-thread
composer), it keeps fully self-owned state — no churn for thread creation.

**Cross-page consistency note:** like text, a synced attachment draft is **lost on a
cross-page reload** — a `File` can't be serialized, and drafts are not persisted across
navigation. In-page both surfaces mirror fully; after a reload the draft starts empty.
This is uniform for text and attachment, not a special case.

## §6. Navigation flow — same-page vs cross-page (load-bearing)

Clicking a card or its Reply opens the detail **and** focuses the pin. The two branches
of the existing `PanelDrawer.onSelect` change as follows.

**Same page** (`row.pageKey === resolvePageKey(here)`):

- `OPEN_DETAIL(id)` (sidebar → detail) **+** `openThread(id)` (pin popover) **+**
  `requestFocus(id)` (scroll + pulse).
- **No reload; the panel stays open.** This is the opposite of today's
  `closePanel(); requestFocus(id)` (`PanelDrawer.tsx:36-44`).

**Cross page** (different `pageKey` → full reload, React panel state dies):

- Today only a bare id is stashed (`FOCUS_STORAGE_KEY = row.id` in `navigate.ts`) and on
  arrival only the **pin** is focused — the sidebar would boot **closed**, contradicting
  "open the details view."
- Fix: **grow the handoff payload** to carry intent, e.g.
  `{ id: string; openDetail: true }` (stored as JSON under the existing key; the reader
  tolerates the legacy bare-string form for safety).
- On arrival, the boot consumer (`MarkerLayer`, after the first `refresh()`,
  `MarkerLayer.tsx:96-101`) must, for an `openDetail` handoff, open the **panel** to that
  thread's detail in addition to `requestFocus(id)`. **The panel controller is wired
  into this boot point** (today only the threads controller is). It opens the drawer
  (`openPanel`/`OPEN`) and dispatches `OPEN_DETAIL(id)` + `openThread(id)`.

The detail's lazy `getThread(id)` fills the message list on arrival via the existing
detail cache; `requestFocus` pulses the pin once the runtime places it (existing M8
behavior).

## §7. Copy link (deep-link to a thread)

Each card's **Copy link** copies `thread.pageUrl` plus a focus param —
`?comments-thread=<id>` — mirroring the `?comments-key` precedent
(`config.ts:DEFAULT_KEY_PARAM`, read in `gate.ts`, then stripped/persisted in
`index.ts`).

- The param name is a config default (e.g. `DEFAULT_THREAD_PARAM = 'comments-thread'`),
  same shape as the key param.
- On boot, if present, the widget treats it like an `openDetail` focus intent: open the
  drawer to that thread's detail + `requestFocus(id)`, then **strip the param** from the
  URL (history `replaceState`, as the activation key already does) so a refresh/share of
  the cleaned URL is idempotent.
- Copy uses `navigator.clipboard.writeText`; on failure (insecure context / denied)
  surface the existing toast. No new backend, no schema change.

## §8. `docs/ideas.md` — deferred items (part of this deliverable)

Create `docs/ideas.md` (a forward-looking backlog, sibling to the `docs/issues.md`
known-issues log) and record the items scoped **out** of this iteration:

- **Prev/next chevrons** in the detail header — step through the current filtered list
  order without returning to the list.
- **Emoji reactions** on comments — a full backend feature (new `Comment` field,
  endpoints, both adapters); deferred.
- **Per-comment more-menu (···)** — edit/delete/copy; needs new backend operations.

## §9. Testing

Per architecture §9 (client/widget testing) plus TDD for the contract change (§2).

**Unit**

- `panel/state` reducer: `OPEN_DETAIL` / `BACK` / `CLOSE` view transitions; `BACK`
  leaves the list/cursor intact.
- `drafts` slice: text mirrors across reads; writing a ready `Attachment` populates the
  shared draft; send → clear empties text + attachment; clear is keyed by `threadId`.
- `navigate`: handoff round-trips the `{ id, openDetail }` payload and tolerates a legacy
  bare-string id.
- **Adapter contract suite**: `listThreads` projects `rootComment.text` for a normal
  thread and `text === ''` for an attachment-only root; `updateAnchor` returns a
  `ThreadListItem` carrying `rootComment` — run against **both** `adapter-memory` and
  `adapter-mongo`.

**Component**

- List card renders the root comment text + `N Replies` / `Reply`; Copy link writes the
  `?comments-thread=<id>` URL; Resolve toggles status.
- Detail view renders root + page-context box + replies + composer; **Back** returns to
  the list **without** closing the pin popover.
- Draft sync: typing in the sidebar composer mirrors into the pin popover composer and
  vice-versa; a stored attachment appears in both; sending from one clears both.

**e2e (Playwright, hermetic — M10 harness)**

- Same-page: click a card → detail opens, panel stays open, pin pulses.
- Cross-page: click a card on another page → reload → drawer reopens to that thread's
  detail with the pin focused.
- Copy-link: load a URL carrying `?comments-thread=<id>` → drawer opens to that detail,
  param stripped from the URL.

## Out of scope

Anchoring/scoring/positioning internals; new list endpoints (the M2a contract gains only
the additive `rootComment` field); reactions, more-menu, prev/next chevrons (§8);
persisting drafts across reloads; multi-attachment composing.
