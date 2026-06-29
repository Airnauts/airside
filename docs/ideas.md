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

## Re-navigate to a thread's pin from the open detail

**Trigger:** opening a thread scrolls to its pin once, but if you then scroll away (or
SPA-navigate elsewhere), there's no way back — you have to close the detail and re-open
it. The open detail should offer a "take me back to the pin" affordance.

The scroll machinery already exists: `requestFocus(id)` waits for placement, then
`scrollIntoView({ block: 'center' })` + pulses the pin (`marker/useFocusPin.ts:36`). The
gap is purely that the *open* detail never re-fires it — it only runs on the initial
open. So this is exposing a re-trigger, not building scroll logic.

Natural home: make the sidebar detail's page-context card clickable
(`ui/ThreadConversation.tsx:108-115`) and re-run the same same-page-vs-cross-page split
already in `PanelDrawer.onSelect` (`panel/PanelDrawer.tsx:40-52`): same page →
`requestFocus(id)`; different page → `goToThread`. Small. Making that card a link also
naturally dedups the doubled-URL rough edge (see `issues.md`).

## Emoji reactions on comments

React to a comment with emoji. Deferred — it is a full backend feature: a new field on
the `Comment` schema, add/remove-reaction endpoints, both adapters, and the contract
suite. Not a UI-only change.

## Per-comment more-menu (···)

Overflow menu per comment (edit / delete / copy text). Deferred — edit and delete are
new backend operations (`PATCH`/`DELETE` on a comment) with their own contract +
optimistic UI.

## Delete a thread from the thread overflow menu (···)

A destructive "Delete thread" item in the thread `···` menu (`ui/ThreadActions.tsx`) —
red label, gated by a confirmation dialog — that removes a whole thread (pin, comments,
attachments), not a single comment. This is thread-level, distinct from the per-comment
more-menu above (which deletes one comment).

Deferred — needs a new backend operation: there is no thread delete in the repository
contract today. Shape: a `DELETE` use-case mirroring `set-thread-status.ts` plus a
`deleteThread(scope, id)` repository method, wired through every adapter (memory / mongo /
postgres) and the shared adapter contract suite (TDD). Client: a
`controller.deleteThread(id)` that optimistically drops the thread from state and closes
any open detail/panel, plus the confirm dialog (reuse the `@radix-ui/react-dialog` modal
pattern from `identity/IdentityModal.tsx`). The `···` menu currently renders only
extension `thread-toolbar` actions and returns `null` when there are none, so a built-in
delete means it must render unconditionally.

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

## Drag-and-drop image upload

**Date:** 2026-06-16 · **Status:** idea · **Trigger:** uploading an image to a comment
should be a drag-and-drop (and paste) gesture onto the composer, not just a file picker.

Add a drop zone over the comment composer that accepts an image dragged from the desktop
(and `paste` of an image from the clipboard), shows a thumbnail/progress while it
uploads, then attaches it to the comment. Builds on the existing attachment storage path
(`airside_attachments`) — this is a composer UX layer, not a new backend capability,
though it should reuse the same upload + size/type validation the file picker already
runs. Open questions: multi-file drop, paste-image naming, and a max-size affordance.

## Authentication providers (email-with-code, Google)

**Date:** 2026-06-16 · **Status:** idea · **Trigger:** reviewers are identified loosely
today; offer real sign-in so a comment's author is a verified identity, not a typed name.

Add pluggable auth so a reviewer can prove who they are before commenting:

- **Email with code** — enter email, receive a one-time code, verify. Pairs naturally
  with the email notifier's SMTP path (a verified email is also a deliverable address).
- **Google** — OAuth sign-in, identity + avatar from the Google profile.

Architecturally this wants to mirror the extension seam already used server-side: an
*auth provider* abstraction the host registers (like notifiers/integrations), so the
widget stays provider-agnostic and the host picks email/Google/none. Large feature —
touches the identity model end to end (schema author fields, session/token handling,
the widget's identity context, and both adapters). Needs its own ADR (auth model is hard
to change later) and a milestone; not a UI-only change.

## Airside logo placement with repo link

**Date:** 2026-06-16 · **Status:** idea · **Trigger:** a small, tasteful "powered by
Airside" mark in the widget chrome that links back to the repo.

A subtle Airside logo in a corner of the widget chrome (or the panel footer) linking to
`Airnauts/airside`. Cheap, mostly a branding/attribution affordance. Decisions to make:
which surface (overlay corner vs. sidebar footer), and whether it's host-configurable
(on/off, or swap for the host's own mark) so it doesn't intrude on production hosts.

## Changelog popup ("what's new")

**Date:** 2026-06-16 · **Status:** idea · **Trigger:** surface recent releases to
reviewers in-widget instead of only in the generated per-package `CHANGELOG.md` files.

A "what's new" modal that shows recent user-facing changes, opened from the widget chrome
and optionally auto-shown once per new version (track last-seen version in localStorage,
same pattern as the persisted activation key). Source could be curated release notes
derived from the Changesets summaries (which are already written for the changelog
reader). Open question: hand-curated highlights vs. rendering the changelog directly.

## Hide all pins from the screen

**Date:** 2026-06-16 · **Status:** idea · **Trigger:** sometimes you want to read the
page unobstructed — a single toggle to hide every pin/highlight without leaving comment
mode.

A show/hide-pins toggle in the widget chrome that hides the entire marker overlay (pins
and highlights) while keeping the session active, so the page can be read clean and pins
restored with one click. Mostly a visibility flag on the overlay layer (`app/mount.tsx`
overlay + `MarkerLayer`); no anchoring or data changes. Decisions: whether the open
detail/panel stays visible while pins are hidden, and whether the state persists across
reloads.

## Create a thread without a pin (page-level / unanchored comment)

**Date:** 2026-06-18 · **Status:** idea · **Trigger:** not every comment is about a
specific element — sometimes you want to leave general feedback about the page (or the
review as a whole) without first clicking something to drop a pin.

Starting a thread is element-anchored today: `CreateThreadBody` mandates `anchor`
(`packages/core/src/contract/requests.ts:22`), and the create flow begins with a click
that captures the element fingerprint. The idea: allow a thread that carries no element
anchor — it never paints a pin on the page and lives only in the panel/sidebar.

Most of the infrastructure already exists:

- **Display is solved.** Threads with no live pin already render as the detached
  `ThreadCard` in the panel (the M8 orphan path). A pinless thread is essentially one
  that is *born* detached rather than orphaned by a DOM change.
- **The data model anticipates it.** The documented seam is `scope: "page" | "global"`
  with `pageKey: null` "allowed for future global threads" (`docs/architecture.md:197-198`),
  although the live zod still hard-codes `scope: z.literal('page')`
  (`packages/core/src/schemas/thread.ts:23`).

The real gaps:

1. **Make `anchor` optional** in `CreateThreadBody` and pick the model shape. Likely a
   distinct state rather than reusing `orphaned` — `orphaned` means *lost its anchor*,
   not *never had one*; conflating them would muddy the self-heal/re-match policy. The
   contract is TDD-first (ADR-0010), so this lands as failing core/adapter tests before
   code.
2. **A create affordance that isn't an element click** — e.g. a "comment on this page"
   button in the widget chrome that opens the composer straight into the panel.
3. **Page vs. global scope.** The smaller first cut is page-scoped (anchor omitted but
   `pageKey` set, so it shows in this page's panel and not others), matching today's
   `pageKey`; truly cross-page/global threads (`scope: "global"`, `pageKey: null`) can
   follow.

Effort: medium — core schema + HTTP contract, both adapters' create/list, and a composer
entry point in the widget. No anchoring or re-match work, since these threads opt out of
that machinery entirely.

Decision so far: deferred. Smallest cut = page-scoped, anchor-optional, reuse the
detached card for display; promote `scope: "global"` only if cross-page general comments
are actually wanted. Worth an ADR note when picked up, since it widens a public request
shape and adds an anchor state.

## MCP server — let an agent read and resolve comments directly via the API

**Date:** 2026-06-29 · **Status:** idea · **Trigger:** today a reviewer's comment lives
only in the widget; acting on it is a human's job. Expose the comment API as an MCP server
so an AI agent can connect, pick up open threads, address them, and resolve them in place
— closing the loop from "comment left" to "comment solved" without a human relay.

The airside-agent automation we already ship works *around* GitHub: issue → branch →
draft PR → review (see the `airside-agent` skill). This idea is the complementary inner
loop — the agent talks straight to the **comment** API and operates on review threads
themselves, so feedback dropped on a live page becomes actionable by an agent directly.

The surface already exists to wrap. The widget speaks to the host over the HTTP contract
mounted at `/api/airside` (`core`'s request/response schemas; the `server` use-cases incl.
`set-thread-status.ts`). An MCP server is a thin tool layer over that same contract — no
new persistence, no new domain logic. Candidate package: `@airnauts/airside-mcp` (or an
`airside-integration-mcp` following the integration-naming convention).

Tools to expose (each maps to an existing use-case/route):

- **`list_threads`** — open/unresolved threads for a page (or all), with their comments
  and anchor context, so the agent knows what's pending.
- **`get_thread`** — full conversation + the anchored element/page context for one thread.
- **`reply_to_thread`** — post a comment as the agent (needs a bot/agent identity — see
  the auth-providers idea; minimally a configured service author).
- **`set_thread_status`** — resolve / reopen, mapping to `set-thread-status.ts`.

The real decisions:

1. **Transport & deployment.** Standalone MCP process that holds the host's base URL +
   credential, vs. an in-process server the host mounts beside its route. Standalone is
   the cleaner first cut (one config: API base + token).
2. **Auth & identity.** The agent needs to authenticate to the API *and* carry an author
   identity for anything it writes — depends on the auth-provider seam not yet built, so
   the first cut likely uses a static service token + a configured "agent" author.
3. **Read-only vs. write.** Ship `list`/`get` first (zero risk), gate `reply`/`resolve`
   behind explicit config so an agent can't silently close human threads.
4. **Scope guard.** How the agent decides a thread is "solved" is out of scope here — this
   idea only provides the hands (the tools); the judgement lives in whatever agent connects.

Effort: small–medium — mostly an MCP adapter over the existing contract, plus the
identity/auth question (which it shares with the auth-providers idea). Worth an ADR note
when picked up: it opens a new automated write path into the comment store.
