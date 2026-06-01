# M8 — Cross-page comments panel — design

- **Status:** Approved
- **Date:** 2026-06-01
- **Track:** Frontend · Size: M
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §6 · [`docs/prd.md`](../../prd.md) §6.6
- **Depends on:** M7 (thread popover + pin UI to focus), M3/M4 (the all-pages `GET /threads` list endpoint)

## Goal

The panel is v1's **sole discovery surface** — there are no notifications (PRD §6.6,
architecture §347). It must make "what's here and what changed?" answerable at a
glance: a flat, activity-ordered list of threads **across all pages**, a pinned
"Needs review" section for orphans, and a click that **navigates to the thread's
page and focuses its pin**.

This milestone adds a list surface, a Launcher trigger, and the cross-page
navigate-and-focus flow. It does **not** touch anchoring, scoring, positioning, the
HTTP contract, or any backend code.

## What is already built and reused, not rebuilt

- **`@comments/core`** — `ThreadListItem` already carries everything the panel
  renders: `pageUrl`, `pageTitle?`, `pageKey`, `status`, `unresolvedCount`,
  `anchorState` (`anchored`/`orphaned`), `updatedAt`. **No schema changes.**
- **`api/client.ts`** — `listThreads({ pageKey?, status?, sort?, cursor? })` already
  returns the all-pages list `{ threads[], nextCursor }` when called **without**
  `pageKey`. The panel needs **no new endpoints**; the M2a contract stays frozen.
- **`threads/controller.ts`** — `openThread(id)` opens + lazy-fetches a thread. The
  focus flow builds on it (it is necessary but **not sufficient** — see §3).
- **`threads/relativeTime.ts`** — relative timestamps ("5m ago"). Reused for rows.
- **`positioning` + anchoring runtime** (M6) — owns current-page placement geometry.
  The panel reads `placementsById` to know when a focused pin has been placed; it
  does not re-implement re-match or positioning.
- **M7 UI idioms** — `Launcher`, Radix popovers, the lost-anchor toast, `cmnt:`
  Tailwind prefix, light-DOM portal container.

## Architecture: a second, independent data surface

The panel is a **separate data surface** from the anchoring runtime. The runtime owns
*current-page* placements (geometry, re-match, pins). The panel owns a *flat
cross-page list* (no geometry). They are fetched independently and reconciled only
for status changes (§4).

State lives in a **new `panel/` slice**, deliberately **not** in `threads/state.ts`,
to keep the runtime reducer focused on placement/draft/detail concerns.

### `panel/` state

```
type PanelState = {
  open: boolean                 // drawer visibility
  filter: 'open' | 'resolved' | 'all'   // default 'open'
  list: ThreadListItem[]        // main list, server order (updatedAt desc)
  nextCursor: string | null     // null → no more pages
  loading: boolean              // first-page / filter-switch fetch
  loadingMore: boolean          // 'Load more' fetch
  error: boolean
  needsReview: ThreadListItem[] // open-orphans, separate fetch (§1)
}
```

A small reducer + an imperative `panelController` (mirroring the M7
controller/provider split): `openPanel()`, `closePanel()`, `setFilter(f)`,
`loadMore()`, `refresh()`. Fetches are fire-and-forget; the reducer tracks
loading/error.

## 1. The two fetches

Both go through the existing `client.listThreads`; **neither sends `pageKey`** (that
is what makes it the all-pages list).

- **Main list** — `listThreads({ status: <filter>, sort: 'updatedAt', cursor })`.
  Paged via `nextCursor`. `status` is omitted when the filter is `all`.
- **Needs-review** — a **separate, un-paged** `listThreads({ status: 'open' })`,
  then **client-filtered** to `anchorState === 'orphaned'`.

Why a separate fetch: `ListThreadsQuery` is frozen as `{ pageKey?, status?, sort?,
cursor? }` — there is **no `anchorState` param**, so the server cannot return "just
orphans." And the main list's `status` filter would hide open orphans whenever the
user views "Resolved." Open-orphans are the actionable review set, so we fetch them
independently of the main list's filter and cursor. (Resolved orphans are not
surfaced — a resolved thread needs no review.)

The needs-review fetch refreshes alongside the main list (on open, on filter change,
and on the §4 status-change refetch), but is itself unaffected by the filter value.

## 2. Surface & components

- **`PanelDrawer`** — right-edge, full-height slide-over, portal'd into the widget
  container. Radix `Dialog` in **non-modal** mode so the host page stays interactive
  (no scroll-lock, no focus trap on the page) while still giving us Escape-to-close
  and accessible labelling. Opened by a new list/inbox icon button added to the
  existing `Launcher` pill.
- **Header** — title + close button; a segmented `[ Open | Resolved | All ]` control
  (default **Open**) bound to `panel.filter`.
- **`NeedsReviewSection`** — pinned above the main list, rendered only when
  `needsReview.length > 0`: `⚠ Needs review (n)` heading + orphan rows.
- **`PanelList`** — the flat main list in server `updatedAt` order. No client
  re-sort, no grouping.
- **`PanelRow`** — status dot (open ●, resolved ✓), `pageTitle ?? pageUrl`,
  unresolved count, relative time (`relativeTime.ts`), and an `anchor lost` badge
  when `anchorState === 'orphaned'`. The whole row is the click target (§3). Rows are
  **navigate-only** — no inline resolve/reopen in v1 (that happens at the pin).
- **`Load more`** — a button shown when `nextCursor != null`; calls `loadMore()`,
  which appends the next page.

Empty/loading/error states: spinner on first load; "No comments yet" when the list
is empty and no orphans exist; an error row with a retry affordance on fetch failure.

The Launcher's existing **"Resolved" toggle controls on-page pin visibility** and is
**independent** of the panel's list filter — two different concerns, both retained.

## 3. Navigate-and-focus flow (the one new mechanism)

Clicking a row resolves to one of two paths by comparing the row's `pageKey` to the
current page's active key.

**Same page** (`row.pageKey === activeKey`): no navigation. Close the drawer,
`controller.openThread(id)`, then run **focus** (below).

**Different page**: stash `sessionStorage['cmnt:focus'] = id`, then assign
`location.href = row.pageUrl`. The browser navigates (full reload or SPA route). On
boot, the widget reads **and clears** the key and runs the same **focus** routine.
Clean URLs, survives the navigation boundary, composes with the existing route-change
detection.

### `focusThread(id)` — focus is **not** just `openThread`

A pin's geometry exists only **after** the runtime's async `refresh()` → re-match →
`INGEST_PLACEMENTS`. `openThread` sets `openId` but cannot scroll to a pin that is
not placed yet. So `focusThread`:

1. `controller.openThread(id)` — sets `openId`, lazy-fetches detail.
2. **Wait for the thread to appear in `placementsById`** — subscribe to the threads
   store; resolve when `id` is placed, with a **~2s timeout** fallback.
3. On placement → `scrollIntoView` the anchored element (centered) + a brief **pulse**
   highlight on the pin to draw the eye.
4. **Orphaned / never-placed target** (the "Needs review" case): on timeout, open the
   thread popover if the thread loaded, and show the existing lost-anchor toast
   ("This comment's anchor was lost"). **No scroll.**

The sessionStorage handoff is read once on boot; if the target turns out to be
orphaned on the destination page, the same step-4 fallback applies. This is the only
net-new component — M7 placed pins but nothing focuses a *specific* pin
programmatically.

## 4. Reconciliation & freshness

- The panel **fetches on open** (main list + needs-review) — fresh each time the
  drawer opens; cheap and avoids stale lists.
- Rows are navigate-only, so the only cross-surface mutation is **resolving/reopening
  from a pin popover while the drawer is open**. When a status change commits, if the
  drawer is open, **refetch** the current filter (main + needs-review). The panel
  subscribes to the same controller status-change signal that already patches the
  runtime cache. No shared optimistic state across surfaces — **one source of truth
  per surface, reconciled by refetch.**

## 5. Mounting & wiring

- A `PanelProvider` (reducer + `panelController`) wraps the widget subtree alongside
  `ThreadsProvider` in `app.tsx`.
- `PanelDrawer` mounts next to `MarkerLayer` (same portal container).
- The `Launcher` gains an `onTogglePanel` prop + list icon; `MarkerLayer` (which
  renders the Launcher) wires it to `panelController.openPanel()`.
- Boot handoff: on mount, `app.tsx` (or a small effect in `MarkerLayer`) reads
  `sessionStorage['cmnt:focus']`, clears it, and — after the first runtime refresh —
  invokes `focusThread`.

## 6. Testing (architecture §9, not strict TDD)

Component tests with an injected fake `ApiClient`:

- list renders in **server order**, no client re-sort;
- switching the filter changes the `status` param sent to `listThreads`
  (`open`/`resolved`/omitted for `all`);
- `Load more` fetches `nextCursor` and **appends**; hidden when `nextCursor` is null;
- **Needs-review** populates from the separate `status: 'open'` fetch filtered to
  `orphaned`, and **stays visible under the Resolved filter**;
- **same-page** row click closes the drawer and calls `openThread` + focus;
- **cross-page** row click writes `sessionStorage['cmnt:focus']` and sets
  `location.href` to `pageUrl`;
- **boot handoff** reads + clears the key and runs `focusThread`;
- `focusThread` scrolls + pulses once the thread is placed; **orphaned target** falls
  back to the lost-anchor toast with no scroll;
- a status change committed while the drawer is open triggers a refetch.

`focusThread`'s placement-wait and scroll are tested against a fake store/placement
signal; jsdom has no layout, so `scrollIntoView`/pulse are asserted via spies.

## Out of scope (post-v1)

Notifications, inbox, search, per-row resolve/reopen, grouping by page, infinite
scroll, deep-linkable `#` anchors. (PRD §6.6, architecture §6.)

## Open decisions resolved during brainstorming

- Cross-page focus handoff → **sessionStorage** (`cmnt:focus`), not URL hash.
- Panel surface → **right slide-over** triggered from the Launcher.
- List shape → **flat, `updatedAt` order**; orphans in a **pinned "Needs review"**
  section.
- Paging → **"Load more"** button (cursor), not infinite scroll.
- Filter → segmented **Open / Resolved / All**, default **Open**.
- Rows → **navigate + focus only** in v1.
