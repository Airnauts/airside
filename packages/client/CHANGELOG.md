# @airnauts/comments-client

## 0.2.0

### Minor Changes

- b03ddcf: Gate the commenting UI behind a "Log in" step. A logged-out reviewer now sees only a Log In
  button; placing comments, pins, and the panel appear after entering a name/email up front
  (self-asserted, as before — no verification). Identity is remembered, so return visits skip
  the prompt.
- 028d59e: The comments sidebar is now a master–detail surface: list cards show each thread's
  first message with a Reply action, clicking a thread opens an in-sidebar detail view
  (with a Back button) while focusing its pin, the pin popover and sidebar share a live
  composer draft, and each card has a Copy-link deep-link to the thread.

### Patch Changes

- aea661e: Add a `link` text variant to the shared Button and migrate the remaining hand-rolled buttons onto it: the panel list link actions (Reply/Resolve/Copy link/Load more), the comment-list and panel Retry links, the login modal submit, and the panel close buttons. No behavioral change (minor pixel-level styling is snapped to the Tailwind scale).
- a5d79b9: Thread comment lists now scroll to the most recent message when a thread opens and when a new comment is posted, so the latest reply is always in view.
- e5980c1: Unify widget buttons onto a shared Button component. No behavioral or API change (minor pixel-level styling is snapped to the Tailwind scale).
- 361827a: Sidebar detail polish: the panel header keeps a consistent compact height when opening
  a thread (the close button no longer jumps), the reply composer sits directly below the
  last message (long threads scroll within the drawer rather than pinning the composer to
  the bottom), and the reply/comment input is auto-focused on open everywhere — the pin
  popover, the sidebar detail (via Reply, a thread row, or cross-page navigation), and the
  new-comment draft — so you can type immediately.
- Updated dependencies [ab680eb]
  - @airnauts/comments-core@0.2.0

## 0.1.1

### Patch Changes

- f95c270: Emit the widget's Tailwind utilities un-layered so a host's un-layered reset or Preflight can't override them. The widget embeds into the host's light DOM, and most hosts ship an un-layered reset (every Tailwind v3 app, Normalize, reset.css). Because un-layered author rules beat layered ones regardless of specificity, the previous `@layer utilities` wrapping let the host's `button { … }` / `*,::before,::after { … }` reset strip the widget's borders, radii, and padding — leaving buttons unstyled in hosts like a Tailwind v3 app. Utilities are now un-layered; their `cmnt:`-prefixed selectors win on specificity and still cannot leak onto the host page (ADR-0025).

## 0.1.0

### Minor Changes

- 8f30bb1: Initial public release of the Airnauts embeddable commenting tool.
- initial release

### Patch Changes

- Updated dependencies [8f30bb1]
- Updated dependencies
  - @airnauts/comments-core@0.1.0
