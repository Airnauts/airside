# PROGRESS — issue #30: Widget: "powered by Airside" mark linking to the repo

**Phase:** building → draft PR
**Branch:** agent/issue-30

## What was done
- Added an opt-in `branding?: boolean` init option (`packages/client/src/config.ts`),
  documented as "defaults to hidden; set `true` to opt in". Production hosts see no
  mark unless they enable it.
- New `packages/client/src/ui/PoweredBy.tsx`: a subtle `<a>` to the Airside repo
  (`AIRSIDE_REPO_URL`, `target="_blank"`, `rel="noopener noreferrer"`) rendering an
  inline `fill="currentColor"` wordmark (aria-hidden, ~14px) adapted from
  `assets/airside-logo.svg` plus the visible accessible text "Powered by Airside".
- Threaded the flag, one prop deep: `app.tsx` passes `branding={options.branding === true}`
  → `PanelDrawer` (new required `branding` prop) → `PanelListView`, which renders
  `{branding && <PoweredBy />}` as the final child after the scrolling list region, so
  it pins to the drawer bottom on the **list pane only** (the detail view ends in a
  composer and never shows the footer).
- Tests: new `PoweredBy.test.tsx` (href/target/rel/accessible-name/aria-hidden) and
  three new `PanelDrawer.test.tsx` cases (footer absent by default; present when
  `branding={true}`; absent on the detail view even when enabled). Updated the existing
  `setup()` helper and the `MarkerLayer.test.tsx` render to pass the now-required prop.
- Changeset `.changeset/powered-by-airside.md`: `@airnauts/airside-client` **minor**.

## Decisions
- **Opt-in, default off** (approved spec v2): `branding={options.branding === true}` —
  only an explicit `true` enables the mark; `undefined`/`false` keep it hidden.
- **Panel-footer surface, not an overlay corner**: the panel only appears when a
  reviewer opens it, so it never intrudes on the host page (rejected the launcher-corner
  placement, which is always on-screen).
- **Inline SVG wordmark, not an external image**: light-DOM/npm widget; an external
  logo from `raw.githubusercontent.com` would be blocked by a host's `img-src` CSP.
  `fill="currentColor"` inherits the muted footer colour and sidesteps light/dark
  variants. Full 4 KB wordmark is well under the 300 kB brotli size-limit budget.
- Made `branding` a **required** prop on `PanelDrawer`/`PanelListView` (per spec) and
  fixed the one other internal caller (`MarkerLayer.test.tsx`) accordingly; the public
  surface stays opt-in via the optional `InitOptions.branding`.
- `AIRSIDE_REPO_URL` is exported from `PoweredBy.tsx` and asserted against in the test
  to avoid URL drift.

## Verification
- `pnpm --filter @airnauts/airside-client test` → 54 files, **323 tests passed**.
- `pnpm lint` (biome ci) → **exit 0** (29 pre-existing warnings in server test files,
  none in changed files).
- `pnpm --filter @airnauts/airside-client typecheck` (`tsc --build`) → **exit 0**.

## Follow-ups / not done
- White-label / host-supplied custom logo (future object form
  `branding?: boolean | { enabled?; href?; label? }`) — out of scope per spec.
- Overlay-corner / launcher placement — rejected, out of scope.

_Automated by airside-builder for #30._
