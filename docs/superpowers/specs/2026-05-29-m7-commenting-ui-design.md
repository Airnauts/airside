# M7 — Commenting UI — design

- **Status:** Approved
- **Date:** 2026-05-29
- **Track:** Frontend · Size: L
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §3, §6 · [`docs/prd.md`](../../prd.md) §6.1, §6.3–§6.5 · ADR-0005
- **Depends on:** M6 (anchored pins + positioning runtime), M4 (`/uploads` endpoint), M5 (widget shell + `ApiClient` + identity)

## Goal

The full on-page commenting interaction on an anchored pin. M6 proved anchoring by
rendering bare pin dots + highlight rects; M7 turns those into the real product:
clickable pins that open a thread popover with comments, replies, screenshot
uploads, and resolve/reopen — plus the place-mode launcher and the "show resolved"
toggle. The cross-page panel is **M8** and is out of scope here.

## What is already built and reused, not rebuilt

- **`@comments/core`** — `Thread`, `ThreadListItem`, `Comment`, `Attachment`,
  `Author`, `ThreadStatus`, request/response schemas. M7 changes **no** schema; the
  contract already carries everything (e.g. `comment.attachmentIds`,
  `AddCommentBody.attachmentIds`).
- **`@comments/client` `api/client.ts`** (M5) — every endpoint M7 needs already
  exists: `createThread`, `listThreads`, `getThread`, `addComment`,
  `setThreadStatus`, `upload`. The optimistic-post + rollback pattern is established.
- **M6 anchoring runtime** — `createRuntime` (list → re-match → position →
  refreshAnchor), `rematch`, `coords`, `lifecycle` observers, `PinLayer`
  geometry. M7 does **not** touch re-match, scoring, positioning math, or the
  observer wiring.
- **Widget shell** (M5) — light-DOM mount, `WidgetProvider`, `ToastProvider`,
  `IdentityModal` + `loadIdentity`/`saveIdentity`, error boundary,
  shadcn/Radix-in-widget setup.

## Product decisions (made during brainstorm)

- **Pin** — map-teardrop silhouette with a solid-blue avatar (white initials), a
  white ring for legibility on any background, and a **dark count pill** (not a red
  badge) for unresolved count. Resolved → grey teardrop + green check.
- **Popover** — "threaded card" (~320px): a quiet inline header
  (`Open · N unresolved` + a `✓ Resolve` button + close), comments as flat
  avatar+text rows, and a single-line reply input that grows. Radix `Popover`
  anchored to the pin.
- **Place trigger** — a floating **launcher** (bottom-right). Clicking it enters
  comment mode (crosshair cursor + hint); the launcher also hosts the **show-resolved
  toggle**. (The launcher is M7's only persistent on-page chrome; the cross-page
  panel that would otherwise host the toggle is M8.)
- **Aesthetic** — proposed clean, neutral floating-pin idiom (Vercel/Figma-comments
  family) built on the widget's existing shadcn/Radix + Tailwind setup. No external
  design system to match.
- **Styling convention** — static styling uses M5's **Tailwind `cmnt:`-prefixed
  utilities** composed with the `cn()` helper; inline `style` is reserved for
  runtime-computed values (pin/highlight/draft coordinates, per-author avatar color)
  and the one-off teardrop shape. The existing M5/M6 inline-styled components
  (`IdentityModal`, toast, providers) are **retrofitted** to the same convention so
  the widget is consistent.
- **Reply-reopens** — replying to a resolved thread reopens it.
- **State architecture** — a small **threads store + imperative controller**
  (approach A below), chosen so the open-by-id seam M8 needs exists from the start
  and `PinLayer` stays presentational.

## Architecture — module layout (all in `@comments/client`)

M6's pure and positioning units are untouched. M7 adds a thread-UI layer and slims
`MarkerLayer`.

```
src/threads/
  ThreadsProvider.tsx   context + useReducer: itemsById, placementsById, openId, detailById, draft, showResolved
  controller.ts         { openThread(id), close(), setShowResolved(b) } — the M8-facing seam
  useThreads.ts         hooks: useThreadList(), useOpenThread(), useThreadActions(), useShowResolved()
src/ui/
  Launcher.tsx          floating cluster: "+ Comment" (enter place mode) + show-resolved toggle + open count
  ThreadPopover.tsx     Radix Popover anchored to a pin; header + CommentList + Composer
  CommentList.tsx       comments (avatar, name, relative time, text, attachments) + loading skeleton + empty
  Composer.tsx          growing text input + attach + send; new-thread & reply modes
  Attachment.tsx        pending thumbnail (spinner / remove / error-retry) + sent image
  relativeTime.ts       pure "2h" / "just now" formatter
src/positioning/
  layer.tsx             PinLayer upgraded: teardrop-avatar pins (still presentational), highlight rects unchanged
src/marker/
  MarkerLayer.tsx       slimmed: owns place-mode capture (M6); renders Launcher + PinLayer + open ThreadPopover from the store
```

Each unit keeps one purpose and a narrow interface. `relativeTime`, the reducer, and
the placement-filter selector are **pure and headless-testable**. `PinLayer`,
`CommentList`, `Composer` are presentational (data + callbacks in). `ThreadsProvider`
owns store state; `controller` is the only imperative surface; `MarkerLayer` wires
capture to the store. All network I/O continues to go through the M5 `ApiClient`.

## Data flow & state

**Runtime feeds the store, not the layer.** M6's `createRuntime` currently maps
matched threads to bare `Placement{id,pin,highlight,pending}` via `onPlacements`,
discarding the `ThreadListItem` it fetched. M7 widens the retained record to carry
that `ThreadListItem` and changes the emitted shape to
`{ item: ThreadListItem, pin: XY, highlight: Box[] }`. Re-match, scoring,
positioning math, self-heal, and the observer wiring are **unchanged** — this is a
payload-shape change only.

**Provider state (`useReducer`):**

- `itemsById: Map<id, ThreadListItem>` — list metadata for every matched thread
  (avatar/`createdBy`, `status`, `unresolvedCount`, `selectionLost`).
- `placementsById: Map<id, { pin, highlight }>` — geometry from the runtime.
- `openId: string | null` — the single open thread (one popover at a time).
- `detailById: Map<id, Thread>` — full thread (with `comments`) lazily fetched via
  `getThread` on open; cached.
- `draft: { anchor: Anchor; point: { x: number; y: number }; pin: XY } | null` — a
  just-placed thread that has **no id yet**. The runtime only positions threads
  returned by `listThreads`, so the draft is the *only* place an un-created thread
  lives. `pin` is computed from the captured anchor via the same `coords.pinXY`
  the runtime uses. A **transient draft pin** is rendered (in the `pending`
  appearance) so the Radix popover has an element to anchor to; `openId` stays
  `null` while `draft` is set.
- `showResolved: boolean` — default `false`.

**New-thread lifecycle.** Place mode captures an `Anchor` → reducer sets `draft` and
opens its popover (empty composer). On successful `createThread`: clear `draft`, set
`openId = created.id`, seed `itemsById`/`detailById` from the response, and let the
next runtime `refresh()` fold the real placement in. Esc/close before Send clears
`draft` — no thread is created, **no orphan write**. (The M6 `Placement.pending`
flag is subsumed here: "pending" now means the draft pin or an optimistic
create-in-flight, not a field on every emitted placement.)

**Re-match must not clobber open/draft state.** M6's throttled `MutationObserver`
fires `rematchAll()`, which re-emits placements on any host-page DOM change. The
reducer action that ingests fresh placements updates only `itemsById`/
`placementsById`; it **must not** reset `openId`, `detailById`, or `draft`. One edge
case: if the currently-open thread **orphans** during a re-match (drops out of the
emitted set), close its popover and toast ("This comment's anchor was lost") rather
than leaving the popover anchored to nothing.

**Rendered pins** = placements whose `item` passes the `showResolved` filter
(resolved hidden unless toggled). The filter is **client-side** off the already-
fetched list — the toggle is instant, no refetch. (`listThreads` is called without a
`status` param so both open and resolved are available locally; M8 reuses this list.)

**Pagination is deferred.** `listThreads` is paginated (server default 50 per page,
`nextCursor`), and M6's `refresh()` fetches a single page and ignores the cursor. M7
inherits that as-is: the local list — and therefore the client-side resolved filter —
covers the **first page only**. For a single page's worth of pins this is sufficient
for the M7 loop; full cursor handling belongs with the cross-page panel (**M8**) /
e2e (**M9**), where listing across pages is the actual feature.

**Controller** (`controller.ts`) is created in `WidgetApp`, handed to the provider,
and exposes `openThread(id)`, `close()`, `setShowResolved(b)`. `openThread` sets
`openId`, triggers the lazy `getThread`, and scrolls the pin into view. **This is the
seam M8 uses** to focus a pin after cross-page navigation, with no refactor of
`MarkerLayer`.

## Components & the API calls behind them

| Component | Behavior | API |
| --- | --- | --- |
| **Launcher** | `+ Comment` toggles place mode (M6 capture logic moves here); show-resolved switch flips `showResolved`; shows total open count. | — |
| **Pin** (teardrop) | Click → `controller.openThread(id)`. Renders avatar + dark count pill; resolved → grey + check. | `getThread(id)` on open |
| **ThreadPopover** (layout A) | Radix `Popover` anchored to the pin element; quiet header (`Open · N unresolved` + `✓ Resolve`/`↺ Reopen` + close); `CommentList`; `Composer`. | — |
| **Composer** | New-thread mode: first comment → `createThread` (replaces M6's `'Placeholder comment'`). Reply mode → `addComment`. Attach → `upload(file)` → hold `attachmentId`; Send posts text + `attachmentIds`. Send disabled while empty or an upload is in flight. | `createThread`, `addComment`, `upload` |
| **Resolve / Reopen** | Header action flips status; replying to a resolved thread also reopens it. No author needed. | `setThreadStatus(id, {status})` |
| **Attachment** | Pending: thumbnail + spinner + remove ✕; on upload error → errored thumbnail with retry/remove. Sent: image rendered in the comment. | `upload` |

No contract or schema changes — all calls exist on the M5 `ApiClient`.

## Interactions & behaviors

- **Place → comment.** M6 place mode is unchanged (crosshair; selection → selection
  anchor, else next click → element anchor; Esc cancels). On capture, instead of
  immediately posting a placeholder thread, M7 opens a **new-thread popover** at that
  point with an empty composer. The thread is **created on first Send**
  (`createThread` with the captured `Anchor` + the typed text + any `attachmentIds`).
  Esc/close before Send discards the unsaved pin — **no orphan write**.
- **Identity gate on every authored write.** Both `createThread` and `addComment`
  require an `author` (`AddCommentBody.author` is mandatory), so a first-time user's
  first action may be a **reply**, not a new thread. The composer therefore routes
  every Send through the M5 `identity`/`onNeedIdentity` resume flow (prompt → save →
  resume the pending send), not just creation. **Resolve/reopen take no author**
  (`SetThreadStatusBody` is just `{status}`) and never trigger the identity modal.
- **One popover at a time.** A single `openId`; opening a thread closes any other.
- **Resolved filter.** Hidden by default; the launcher toggle reveals resolved
  threads (grey+check pins, dimmed popover body, `↺ Reopen`). The header reads
  **"Resolved"** with no attributed name — `ThreadBase` carries `createdBy` only
  (no `resolvedBy`/`resolvedAt`), and the schema is frozen out of scope, so the
  brainstorm mockup's "Resolved by Anna" is *not* implemented as attribution.
- **Text-selection threads.** M6 already renders the highlight rects; M7 attaches the
  same popover to selection pins and shows the selected quote as context in the
  new-thread header. `selectionLost` threads (recorded by M6) keep the element pin and
  render without a highlight.
- **Optimistic + rollback** (reusing the M5 pattern). Replies append immediately;
  resolve/reopen flip immediately; both roll back on error with a toast. Thread
  creation shows the pin as `pending` until the POST resolves.

## Loading / error / empty states

- **Opening** — popover opens instantly using cached list metadata; the comment list
  shows a short skeleton until `getThread` resolves.
- **Empty** — a freshly placed thread shows the "start the thread" empty state.
- **Errors** — a failed send keeps the draft and shows an inline retry; a failed
  `getThread` shows an inline "couldn't load — retry"; a failed upload marks the
  thumbnail errored with retry/remove. User-facing failures also surface via the
  existing `ToastProvider`.
- **Rollback** — optimistic resolve/reply failures restore the prior state.

## Accessibility

Radix `Popover` provides the focus trap, Esc-to-close, and ARIA wiring. Pins are
`<button>`s with descriptive `aria-label` (e.g. "Comment thread by Mateusz, 2
unresolved"); the launcher button and the show-resolved `switch` are labelled; the
composer and Send are keyboard-reachable; focus moves into the popover on open and
returns to the pin on close. Status is never color-only — the green/grey is always
paired with an icon + text ("Open" / "Resolved").

## Testing strategy (architecture §9 — component testing, not strict TDD)

- **Pure units, test-first:** `relativeTime`; the provider **reducer**
  (open/close/filter/optimistic-apply/rollback); the placement-filter selector.
- **Component tests** (Testing Library + jsdom, mocked `ApiClient`): pin click →
  popover open → `getThread` → render; the **new-thread draft lifecycle** (place →
  draft pin + empty popover → Send → `createThread` → draft cleared, `openId` set;
  Esc discards with no write); composer create-thread and reply; the **identity gate
  fires on a reply** by a not-yet-identified user (and *not* on resolve/reopen);
  upload pending → attach → send (Send gated on in-flight upload); resolve/reopen
  optimistic apply + rollback on error; show-resolved filter hides/reveals; a
  re-match re-emit **does not** close an open popover or drop a draft; **controller
  `openThread(id)` opens the correct popover** (the M8 seam); error/empty/loading
  states.
- **Out of M7:** the real-browser e2e loop (place → reply → attach → resolve across
  reload) is **M9 Playwright** against the `examples/` host app.

## Build sequence (vertical slice; TDD for the pure units)

1. **Store + controller** — widen the runtime record to carry `ThreadListItem` and
   re-shape `onPlacements`; build `ThreadsProvider` reducer (including `draft` state,
   the new-thread lifecycle, and the re-match-doesn't-clobber-open/draft invariant) +
   `controller` + `useThreads` hooks (reducer tested first).
2. **Pins + Launcher** — upgrade `PinLayer` to teardrop-avatar pins; build `Launcher`
   with place-mode toggle (M6 capture logic relocated) + show-resolved switch.
3. **Read path** — `ThreadPopover` + `CommentList` + lazy `getThread`; loading/empty
   states.
4. **Composer** — new-thread (`createThread`, replacing the M6 placeholder) and reply
   (`addComment`); optimistic append + rollback.
5. **Uploads** — `Attachment` pending/sent/error; `upload` → `attachmentIds` wired
   into create + reply.
6. **Resolve/reopen + filter** — `setThreadStatus`; reply-reopens; show-resolved
   client-side filter.
7. **Accessibility pass + state polish** — labels, focus management, skeletons,
   inline retries.

## Exit criteria (from milestones.md M7)

- Full single-page loop: place → comment → reply → attach image → resolve → reopen,
  all persisted.
- Resolved threads hidden by default, shown via the launcher toggle.
- Highlights render for text-selection anchors.

## Out of scope

The cross-page comments panel and any orphan/needs-review listing UI (M8); the live
browser e2e loop (M9); markdown, mentions, emoji, comment editing, and automatic
screenshot capture (post-v1); any change to the frozen `Thread`/`Comment`/`Anchor`
schemas, the HTTP contract, the scoring weights, or the thresholds (M2a/M2b).
