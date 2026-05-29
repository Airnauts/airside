# M5 — Frontend: widget shell, isolation & identity

- **Status:** Proposed
- **Date:** 2026-05-29
- **Milestone:** [M5](../../milestones.md#m5--frontend-widget-shell-isolation--identity--frontend--m)
- **Track:** Frontend
- **Depends on:** M2a (the frozen `operations` table + zod schemas + branded IDs +
  `KEY_HEADER_NAME` + `pageKey` normalization in `@comments/core`); a running
  backend — M3's in-memory dev server (`createCommentsServer` +
  `InMemoryRepository` + `@comments/server/dev`) suffices before M4.
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §3, §4, §8;
  [`docs/prd.md`](../../prd.md) §6.1; ADR-0002, ADR-0005, ADR-0006, ADR-0012.

## 1. Goal

Stand up the entire widget **runtime skeleton** that M6/M7/M8 hang features on, and
prove exactly one end-to-end behavior: **a fixed-position placeholder marker can
create + read a thread against a live in-memory API.**

The widget mounts on any page via one `comments.init()` call, stays isolated from
the host (light DOM, ADR-0006), gates on the key in the URL (PRD §6.1), captures a
self-asserted email identity, and talks the M2a HTTP contract through a typed API
client — **all before any real anchoring**. Real capture / re-match / positioning is
M6; thread / composer / panel UI is M7–M8.

## 2. Scope

### In

- **`comments.init({ key, endpoint, pageKey?, features?, keyParam? })`** — the
  vanilla mount entry of `@comments/client`, a tiny gating shell.
- **Light-DOM mount** (ADR-0006): one injected host root
  (`position:fixed; inset:0; pointer-events:none; all:revert`), Tailwind v4 with
  preflight disabled + scoped prefix, theme CSS vars on the host root, a
  `data-portal-container` + `data-toasts-container` for Radix.
- **shadcn/Radix setup** inside the widget — only the primitives M5 uses
  (a `Dialog` for identity and a toast for errors). M7 adds the rest.
- **React error boundary** wrapping the widget app (host-crash isolation, arch §8).
- **Activation gate** — mounts (and loads the heavy chunk) only when the configured
  URL key param is present **and equals** `init({ key })`; otherwise a no-op.
- **Self-asserted email identity** — a modal on first write, persisted in
  `localStorage`; no verification, no email sent (PRD §6.1).
- **Typed API client** — all seven contract operations as typed methods (types
  inferred from `@comments/core`), `KEY_HEADER_NAME` header, typed errors;
  **optimistic + rollback wired only on the `createThread` path** (the marker's
  surface). `pageKey` via core's shared normalization (overridable).
- **Thin `<CommentsLayer/>`** wrapper at `@comments/client/react` (peer-React).
- **Placeholder fixed-position marker** that drives the round-trip with a
  schema-valid **stub anchor** (does *not* call M2b's `extract.ts`).
- A **throwaway `examples/playground/`** (Vite page + dev-server boot script) for
  manual visual proof.
- Client test setup: **Vitest + jsdom + @testing-library/react**; the round-trip
  verified against a real `createDevServer` instance.
- **ADR-0014** recording the widget-runtime delivery decisions.

### Out

- Real anchoring — capture, scored re-match, positioning engine, orphan/`selectionLost`
  (M6). The marker is fixed-position; the stored anchor is ignored for positioning.
- Thread popover, composer, replies, resolve/reopen, screenshot UI, highlights (M7).
- Cross-page panel (M8).
- The real `examples/` Next.js host app + Playwright e2e (M9).
- `createNextHandler` / Next.js glue (M4) — the playground uses M3's dev server.
- Bundle-size budget calibration — **explicitly deferred** (see §6); the existing
  size-limit entry stays as a loose placeholder, untouched in M5.
- Real feature chunks behind `features` — the flag is plumbed; no chunk ships yet.

## 3. Decisions taken in this brainstorm

Recorded so later milestones don't relitigate them.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Two entry points, one lazy split:** a tiny vanilla `index.ts` gating shell that `await import('./app')`s the heavy React/shadcn chunk. | ADR-0002 ("own bundled React, lazy-loaded"). The split's M5 rationale is **gate inertness** — with no key, React/shadcn never load and the widget is truly inert — *not* size optimization (size is deferred). |
| 2 | **Dual-React boundary.** The widget's `./app` chunk bundles its own React; `@comments/client/react`'s `<CommentsLayer/>` uses the **host's** React as a `peerDependency`. | ADR-0002. The wrapper only calls `init()` in an effect; no React state ever crosses the boundary, so two React instances coexist safely. |
| 3 | **Tailwind v4 compiled to a CSS string, injected into the host root** `<style>` at mount (not document `<head>`); theme vars on the host root element, not `:root`. | ADR-0006 (light DOM, no-preflight, prefix). Keeps the "one `init()` call, framework-agnostic" promise — integrators import nothing extra. Alternative (ship a CSS file consumers import) rejected for that reason. |
| 4 | **Gate requires URL param `=== init({ key })`,** not mere presence; param name configurable via `keyParam` (default `comments-key`). | Arch §4: one secret value flows `init({key})` → URL param → header. Equality stops a stale/foreign link param from activating a different mount. The server still independently validates the header. |
| 5 | **Placeholder marker uses a schema-valid stub anchor;** `extract.ts` is *not* wired. | Milestone says "before any anchoring." M6 owns capture→signals integration. M5 proves the round-trip, not anchoring. |
| 6 | **Optimistic + rollback on `createThread` only;** other writes are plain typed calls. | The marker is the only write surface in M5; M7/M8 add optimistic behavior when they have UI to roll back. |
| 7 | **Demo = throwaway `examples/playground/` (Vite) + Vitest round-trip;** real `examples/` app + Playwright deferred to M9. | M9 formally owns `examples/` + e2e. M5 needs a way to *run* the widget now without stealing that deliverable. |
| 8 | **Bundle-size budgets deferred** to M9; M5 leaves size-limit config untouched. | User direction: don't gate on size now; tweak later if needed. |

## 4. Package & build topology

`@comments/client` currently holds only the M2b anchor logic (`src/anchor/`) and its
corpus. M5 adds the runtime around it.

```
packages/client/
  src/
    index.ts          # comments.init() — tiny gating shell (no static React import)
    react.ts          # <CommentsLayer/> — peer-React wrapper
    app/              # the lazy chunk (own bundled React)
      mount.tsx       #   creates host root, injects CSS, mounts React root, teardown
      app.tsx         #   error boundary > providers > identity gate > overlay/chrome
      providers.tsx   #   portal-container + toasts-container context
      styles.css      #   Tailwind v4 entry (compiled → string at build)
    gate.ts           # activation-gate logic (pure, unit-testable)
    identity/         # localStorage identity + <IdentityModal/>
    api/              # createApiClient + typed methods + error mapping
    marker/           # placeholder fixed-position pin + optimistic create flow
    config.ts         # init options schema/validation, pageKey resolution, captureContext
    anchor/           # (existing M2b extract — untouched by M5)
```

**Entry shells.**

- `index.ts` exports a `comments` namespace with `init(opts)`. `init` validates
  options, runs the gate **synchronously**, and only on a pass does
  `await import('./app/mount')`. It contains **no static import of React** so the
  shell stays inert and self-contained.
- `react.ts` exports `<CommentsLayer {...opts} />`, which calls `comments.init(opts)`
  in a `useEffect` and tears down on unmount. `react` + `react-dom` are
  `peerDependencies` here.

**Build.** tsup with code-splitting (`splitting: true`, ESM) so `./app` is a separate
chunk; React/shadcn bundle into it. `@comments/client/react` externalizes `react`
(peer). The `tsc --build` / tsup split from ADR-0011 is unchanged. CSS is handled per §6.

## 5. Host DOM structure & isolation (ADR-0006)

`init()` → `mount.tsx` imperatively creates one host root, injects the compiled CSS,
then mounts a React root into it:

```
<body>
  …host app (untouched)…
  <div data-comments-root style="position:fixed; inset:0; pointer-events:none; all:revert">
    <style> …compiled, prefixed, no-preflight Tailwind; theme vars on the host root… </style>
    <div data-comments-overlay>      # pins + (future M6) highlights; pointer-events:none, pins re-enable
        └─ placeholder marker (M5)
    <div data-comments-chrome>       # identity modal (M5); cursor/toolbar (M7)
    <div data-portal-container>      # Radix portals / menus
    <div data-toasts-container>      # toasts (error surface)
  </div>
```

- `all: revert` on the root neutralizes inherited host styles; no-preflight + a scoped
  utility prefix prevent leakage outward. Isolation is **not bulletproof** (ADR-0006
  consequences) — accepted for v1.
- Every Radix `Portal` is given `container={data-portal-container}` via one provider
  (`providers.tsx`), so overlays stay inside the host root. Getting this central is
  the one place subtle isolation bugs hide (ADR-0005 consequence).

## 6. Tailwind v4 CSS delivery

- A Tailwind v4 CSS entry (`app/styles.css`) with **preflight disabled** and a
  **scoped class prefix**. Theme CSS variables are declared on the widget host root,
  not document `:root`.
- At build, Tailwind compiles to a CSS string; the string is imported into the app
  chunk as **text** (esbuild `loader: { '.css': 'text' }`) and injected into the
  host-root `<style>` at mount. Nothing is written to the document `<head>`.
- This is the **riskiest build integration in M5** (Tailwind v4 prefix syntax + the
  compile-to-string step). The implementation plan should validate it in an early,
  isolated step before the UI depends on it.

## 7. Runtime modules

Each module has one job, a typed boundary, and is testable in isolation.

- **`config.ts`** — validates `init` options; resolves `pageKey` (core's normalization,
  overridable); assembles `captureContext` (`viewportW/H`, `devicePixelRatio`,
  `userAgent`) and threads `provenance` from `init()`.
- **`gate.ts`** — `isActivated(location, { key, keyParam })`: the param is present
  **and** `=== key`. Pure; the no-op-without-key property is a unit test.
- **`identity/`** — `loadIdentity()/saveIdentity()` over `localStorage`
  (`comments:identity` → `{ email, name? }`); `<IdentityModal/>` (shadcn `Dialog`)
  prompts on first write when unset. Email required, name optional. **No verification,
  no email sent** (PRD §6.1).
- **`api/`** — `createApiClient({ endpoint, key })`. Methods: `createThread`,
  `listThreads`, `getThread`, `addComment`, `setThreadStatus`, `refreshAnchor`,
  `upload`. Each sets the `KEY_HEADER_NAME` header, sends/parses JSON typed by core
  schemas, and maps the core error model to typed client errors. **Only `createThread`
  is optimistic** (provisional → reconcile / rollback).
- **`marker/`** — the placeholder fixed-position pin and the click→create flow.
- **`app/`** — `mount` (host root + CSS + React root + teardown) and `app`
  (error boundary → providers → identity gate → overlay/chrome).

## 8. Data flow — the round-trip M5 proves

**Place.** click → ensure identity (modal if unset) → optimistically render a
provisional pin → `POST /threads` `{ pageKey, pageUrl, anchor: <stub>, comment,
author, captureContext, provenance? }` → on 2xx swap the provisional id for the real
one; on error remove the pin + show a toast.

**Load.** `init()` → gate passes → `app` mounts → `GET /threads?pageKey=…` →
render one fixed-position marker per returned thread (the stored anchor is **ignored**
for positioning in M5).

**Stub anchor.** A minimal anchor that satisfies the M2a schema, e.g.
`selectors: ['body','body']`, `signals: { tag:'body', classes:[], siblingIndex:0,
ancestorTrail:[] }`, `offset: { fx:0.5, fy:0.5 }`. Carries the current
`ANCHOR_SCHEMA_VERSION` from core.

## 9. Testing (architecture §9 — client is RTL/jsdom, **not** strict TDD)

- **Vitest + jsdom + @testing-library/react** — gate behavior (no-op without/with a
  mismatched key), identity modal + `localStorage` persistence, marker render,
  error-boundary containment, provider portal wiring.
- **API-client round-trip** — boot a real `createCommentsServer` +
  `InMemoryRepository` + a trivial storage stub, wrapped in `createDevServer`
  (`@comments/server/dev`) on a loopback port; point the client at it and assert
  create → read end-to-end over real HTTP (node fetch). This is the **live-API
  exit-criterion proof**. `allowedOrigins` is configured for the test origin; full
  browser CORS/origin behavior is exercised in M9.
- **jsdom limits** — layout/`getBoundingClientRect` are stubbed; M5 positioning is
  fixed (no real rects), so this is fine. Real visual/positioning proof is M9.

## 10. Playground (throwaway — M9 supersedes)

`examples/playground/` — a Vite page that imports `@comments/client`, calls
`comments.init({ key, endpoint })`, and a small script that boots the dev server
(`createCommentsServer` + `InMemoryRepository` + storage stub + `createDevServer`).
Run together for manual visual proof: open the page with the key param, place the
marker, see it persist + reload. Dev-only; not shipped; deleted/replaced when M9's
real `examples/` host app lands.

## 11. New dependencies

- Runtime (bundled in the app chunk): `react`, `react-dom`, `tailwindcss` v4, the
  shadcn/Radix primitives M5 uses — a dialog (`@radix-ui/react-dialog`) and a toast
  (exact lib chosen in the plan to match current shadcn — e.g. `sonner`).
- `@comments/client/react`: `react`/`react-dom` as `peerDependencies`.
- Dev: `@testing-library/react`, `@testing-library/dom`, `jsdom` (already present),
  `vite` (playground only), Tailwind's build tooling.

## 12. ADR-0014 — widget runtime delivery

A new record capturing the hard-to-reverse choices (CLAUDE.md ADR triggers: framework
choice, coding/architectural pattern):

- **Lazy own-React app chunk behind a tiny gating shell** — refines how ADR-0002's
  "lazy-loaded own React" is realized (code-split `./app`; shell stays React-free for
  gate inertness).
- **Tailwind v4 compiled to a string, injected into the light-DOM host root** — the
  concrete mechanism for ADR-0006's no-preflight/prefixed isolation.
- **Dual-React boundary** — bundled-React widget vs. peer-React `<CommentsLayer/>`.

ADR-0002/0005/0006 are *implemented* here, not changed; ADR-0014 records the
realization decisions M6–M8 build on.

## 13. Exit criteria → coverage

| Exit criterion (milestones M5) | Covered by |
|---|---|
| Widget mounts only with a valid key | §7 `gate.ts` + §3-#4; unit + RTL tests (§9) |
| Host styles don't bleed in/out | §5 light-DOM root (`all:revert`, no-preflight, prefix) |
| Email captured + remembered | §7 `identity/` + `localStorage`; RTL test (§9) |
| Hard-coded marker creates + reads a thread against the live API | §8 round-trip + §9 dev-server round-trip test + §10 playground |

## 14. Out of scope / seams for later

- `features` chunks (real screenshot/text-anchor feature modules) — flag plumbed, no
  chunk yet.
- Real anchoring runtime (M6) — `extract.ts` integration, positioning, orphans.
- Optimistic behavior on reply/resolve/upload (M7/M8).
- The real `examples/` Next.js host + Playwright e2e + bundle-size budgets (M9).
