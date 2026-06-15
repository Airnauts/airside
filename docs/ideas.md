# Ideas / parking lot

Exploratory notes and forward-looking ideas deliberately deferred — not yet milestones
or ADRs. Sibling to `issues.md` (which logs known rough edges in shipped behavior).
Promote an entry to `docs/adr.md` + a milestone once we commit to it.

---

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

## Smooth pin positioning (Vercel-Toolbar-style document anchoring)

**Date:** 2026-06-03 · **Status:** idea · **Trigger:** our pins jitter on scroll.

### Problem

Pins lag/jitter behind page content while scrolling. The native scroll paints on
the compositor thread immediately; our pin update runs on the main thread one
`requestAnimationFrame` later, so the dot visibly chases the content it's glued to.

### Why it happens (current architecture)

- Overlay is `position: fixed; inset: 0` (viewport-anchored) — `app/mount.tsx:19,27`.
- Pins/highlights are placed with `transform: translate(x, y)` where `x/y` are
  **viewport** coords from `getBoundingClientRect()` — `positioning/coords.ts`,
  `positioning/layer.tsx:29`, `marker/MarkerLayer.tsx:226`.
- Because the overlay is fixed, pins would freeze at a screen spot as the page
  scrolls. To keep them glued, `observeReposition` listens to `scroll`
  (capture, passive) and on every frame re-runs `emit()` →
  `getBoundingClientRect()` for every placed element → re-renders every pin —
  `positioning/lifecycle.ts:57`, `anchor/runtime.ts:26,33`.

So we recompute layout in JS on **every scroll frame**. That's the source of both
the jank and the per-frame main-thread cost.

### What Vercel Toolbar does (from the DOM screenshots)

Two distinct concerns, positioned differently:

1. **The pin marker** lives in a `position-context` whose inner node is
   `position: absolute; left: 821px; top: 561px` — those are **document**
   coordinates (element offset from the document origin, not the viewport).
   An absolutely-positioned element scrolls **natively with the page on the
   compositor**: zero JS on scroll, perfectly smooth. Position is computed
   **once** (and on resize/layout change), never on scroll.

2. **The thread popover/card** is a separate `position: fixed; top; left;
   z-index: calc(var(--z-comment-thread))` node — kept in a readable viewport
   slot, collision-managed only while open. Fixed is correct here because the
   card should stay on-screen, not scroll away with the content.

The key move: **anchor the pin to the document, not the viewport.** Let the browser
move it; only recompute when layout actually changes (resize, reflow, mutations),
not on scroll.

### Proposed change (sketch)

Split the two layers by positioning strategy:

- **Pin/highlight overlay → document-anchored absolute.**
  - Overlay becomes `position: absolute; top: 0; left: 0` sized to the full
    document (or just `position: absolute` on a `body`-level container so it
    inherits the document scroll box).
  - Pin coords become document-relative: `rect.left + scrollX`,
    `rect.top + scrollY` (small change in `coords.ts::pinXY` + a scroll-offset
    source).
  - **Drop the `scroll` listener.** Keep `resize`, `ResizeObserver`, and the
    host `MutationObserver` — those are the events that genuinely move elements.
  - Result: scrolling is handled by the compositor; pins stay glued with no
    per-frame JS.

- **Popover card → keep `position: fixed`**, placed near the (now
  document-anchored) pin via a one-shot viewport projection when it opens, with
  collision handling. This is the one place we still react to scroll while a card
  is open (only one open at a time → cheap).

### Trade-offs / open questions

- **Stacking-context & transforms:** absolute document anchoring breaks if an
  ancestor establishes a containing block (`transform`, `filter`, `perspective`,
  `will-change`, `contain`) on `body`/`html`. The fixed overlay sidesteps this
  today. Need a fallback probe (Vercel keeps a fixed strategy for exactly this).
- **Document height / `scrollX/Y` source:** must read the right scroll container.
  Pages with an internal scroll container (not the window) won't be covered by
  `window.scrollX/Y` — may need per-container handling later.
- **Highlights** (range rects) have the same fix — they're viewport rects today
  and would move to document coords the same way.
- **Effort:** medium. It's a positioning-basis change (viewport → document) plus
  removing one listener, but it touches `coords.ts`, `layer.tsx`,
  `MarkerLayer.tsx`, `runtime.ts`, `lifecycle.ts`, the `mount.tsx` overlay CSS,
  and their tests. The anchoring/rematch logic is untouched.

### Decision so far

Worth doing for the smoothness win, but **not urgent** — the current
reposition-on-scroll works, it's just jumpy. If we adopt this it should be its own
milestone with an ADR (positioning basis is hard to change later), and we should
prototype the containing-block fallback before committing.

## Jira comment sync (one integration registering both an action and a notification)

**Date:** 2026-06-09 · **Status:** idea · **Trigger:** once a thread is linked to a
Jira issue, new comments on the thread should flow into that Jira ticket automatically.

### The use case

The manual "Create Jira issue" thread action creates the ticket with the conversation
**as it stood at creation time** (full history in the issue description). After that,
the thread keeps living: people reply. Those later replies don't reach Jira. The idea:
when a comment is added to a thread that is already linked to Jira, post it to the
linked issue as a Jira comment — keeping the ticket current without anyone re-running
the action.

### Why it's interesting architecturally

It's the first case that needs **one integration to register both extension kinds at
once** — a `thread-action` for the manual create (the "current process") plus a
`notification` for the automatic sync (the "callback"). The extension model already
supports this with no change: `ServerExtension = NotificationExtension |
ThreadActionExtension`, and `jiraExtension(config)` already returns `ServerExtension[]`,
so it can return `[createIssueAction, syncNotification]` with the Jira config shared in
one closure. The split maps cleanly onto the two failure semantics we already have:
the manual create surfaces errors to the reviewer (not isolated), while the sync is a
best-effort `comment.added` subscriber that stays `Promise.allSettled`-isolated (a
failed sync must never break the comment write).

### The one real gap to resolve before building

`NotificationEvent` (see `packages/server/src/notify/types.ts`) is a flattened payload
— `threadId`, `text`, `author`, `threadUrl`, `participants`, … — and it does **not**
carry the thread's `externalLinks`. So a sync callback firing on `comment.added` has no
way to know the thread is linked to Jira or to find the issue key. Resolving that is the
crux of the work, and there are two shapes:

1. **Add `externalLinks` to `NotificationEvent`.** Smallest change; the sync filters
   `event.externalLinks?.find(l => l.provider === 'jira')` and no-ops when absent.
   Widens the event payload for one consumer's benefit.
2. **Give notification extensions thread access** (pass the loaded `Thread`, or a
   thread-loader, into the `onEvent` context). More general — future notifiers get the
   full thread — but couples notifiers more tightly to thread shape/repo.

Lean toward (1) for a first cut (matches the existing flattened-event style; YAGNI),
and revisit (2) if a second notifier needs richer thread data.

### Scope when picked up

- `comment.added` → POST `/rest/api/3/issue/{key}/comment` (ADF body), only when a
  `jira` external link exists. Reuse the existing Jira REST client + ADF builder.
- Status sync (resolve/reopen → Jira comment or transition) is a *further* option, and
  would need a `thread.status-changed` notification event the notifier can see — not in
  this idea's first cut.
- **One-way only** (comments → Jira). Bi-directional sync (Jira → comments) remains an
  explicit non-goal (per the Jira thread-actions design) — there's no echo-loop risk
  while it stays one-way.

### Decision so far

Deferred — the manual create action ships first; sync is a clean follow-on that needs
the `NotificationEvent`-carries-`externalLinks` decision (option 1 above) made first,
plus an ADR note since it changes a public event shape. No urgency.
