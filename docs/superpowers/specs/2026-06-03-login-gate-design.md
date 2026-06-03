# Login gate — design

**Date:** 2026-06-03
**Status:** approved (brainstorm)
**Package:** `@airnauts/comments-client`

## Problem

Today a logged-out reviewer can place a pin and start typing; only on the first
**Send** does the widget lazily prompt for a self-asserted name/email (the identity
modal). That late prompt is awkward — and it caused the "pin closes behind the modal"
bug. We want to flip the model: **require login up front**, and **hide the whole
commenting UI until the user logs in**, showing only a "Log In" button.

"Login" here is **not** new authentication. v1 has no real auth (PRD §6.1: identity is a
self-asserted email, no verification, no email sent; the activation key is a capability
token, not user auth). "Log In" simply **reframes the existing identity step** and gates
the UI on it. No backend, host-API, or schema change.

## Decisions (from brainstorm)

- **Login = the existing self-asserted name/email step**, presented up front via a "Log
  In" button instead of a lazy prompt on first Send.
- **Logged-out state shows only a "Log In" pill** in the launcher position. Everything
  else is hidden: pins, place mode, the panel/drawer, the resolved toggle.
- **Pins appear only after login.**
- **No "Log Out" control.** Identity persists in `localStorage` as today; clearing it is
  out of scope.
- Supersedes the closed PR #4 (modal-guard bug fix): with mandatory up-front login, the
  lazy-prompt-over-popover path is unreachable, so that bug can't occur.

## Approach (chosen: top-level gate)

`WidgetApp` (`app.tsx`) already owns `identity` state (`loadIdentity()` on boot). Gate the
whole tree on it, in one place:

```
identity == null  →  <LoginLauncher onLogIn={() => setModalOpen(true)} />  +  <IdentityModal/>
identity != null  →  <MarkerLayer/> + <PanelDrawer/> + <IdentityModal/>      (today's tree)
```

Hiding is achieved by **not mounting** `MarkerLayer`/`PanelDrawer` when logged out — pins,
place mode, panel, and resolved toggle don't exist until login. No scattered conditionals.

Rejected alternatives:
- *Rip out the lazy `onNeedIdentity` machinery* across `Composer`/`ThreadCard`/
  `ThreadPopover`/`MarkerLayer`/`DetachedThread`. Cleaner end-state but a 6-file diff.
  We keep that wiring as an inert, defensive fallback (identity is always set before any
  composer renders, so it never fires).
- *Gate inside `MarkerLayer`/`Launcher`*. Worse isolation — rejected.

## Components

### New: `LoginLauncher` (`packages/client/src/ui/LoginLauncher.tsx`)
A fixed bottom-right pill mirroring `Launcher`'s container styling, with a single button:
- `data-testid="comments-login"`, accessible label "Log in", visible text "🔑 Log In".
- Prop: `onLogIn: () => void`.
- Rendered by `WidgetApp` directly (the full `Launcher` lives inside `MarkerLayer`, which
  is unmounted when logged out, so the logged-out entry point must live at the app level).

### Reused: `IdentityModal` as the login screen
- Opened by the Log In button via `setModalOpen(true)` with **no** `resume` callback (no
  pending send). On submit, `onSubmitIdentity` runs `saveIdentity` + `setIdentity` →
  `resume?.()` is a no-op → the gate flips → full UI mounts → `MarkerLayer`'s boot effect
  runs `refresh()` → pins load.
- Copy tweak for the login framing: title "Enter your email" → "Log in to comment";
  submit button "Start commenting" → "Log in". (Body text about labelling/no-verification
  stays.)

### Changed: `app.tsx`
- Conditional render on `identity`. The existing `onNeedIdentity`/`resumeRef`/
  `onSubmitIdentity` stay; the modal is shared between the (now-primary) login entry and
  the (now-inert) lazy path.

## Data flow

1. **Boot.** `loadIdentity()` → if non-null, render full UI immediately (no Log In button).
   If null, render `LoginLauncher` + modal.
2. **Log in.** Click Log In → modal opens → submit email → `setIdentity(who)` → gate flips
   → `MarkerLayer` mounts → `createRuntime` + `refresh()` → pins render. Identity saved to
   `localStorage`.
3. **Return visit.** Stored identity → straight to full UI.

## Error handling / edge cases

- **Activation precedes login.** The `?comments-key` activation gate (`gate.ts`) is
  unchanged and still runs first; login is a second, independent gate. An unactivated page
  shows nothing (as today); an activated-but-logged-out page shows the Log In pill.
- **Empty email.** `IdentityModal` already rejects an empty email (no-op submit); unchanged.
- **No logout.** Once logged in there is no path back to the logged-out state within the
  session (by decision). Identity persists across reloads.

## Testing (jsdom, mirroring the existing client suite)

In `app.test.tsx` (or a new `app.login-gate.test.tsx`):
1. **Logged out** (`localStorage` empty): `comments-login` is visible; `comments-place`,
   `comments-panel-open`, and any pin are **absent**.
2. **Log in unlocks UI**: click Log In → fill Email → submit → `comments-place` (full
   launcher) appears; a seeded-thread pin renders (reuse the placed-thread harness from
   `MarkerLayer.test.tsx`).
3. **Boot with stored identity**: pre-seed `localStorage` → full UI directly, no
   `comments-login`.
4. `LoginLauncher` unit test: renders the button, calls `onLogIn` on click.

## Changeset

`@airnauts/comments-client` — **minor** (pre-1.0 policy: user-visible behavior change —
commenting is now gated behind login).

## Out of scope

Real authentication, host-provided user/session, logout, read-only pins for logged-out
users, and removing the inert `onNeedIdentity` wiring.
