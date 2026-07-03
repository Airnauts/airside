# PROGRESS for issue #33: Widget: place mode drops a pin on the launcher and panel chrome
**Phase:** building → draft PR
**Branch:** agent/issue-33

## What was done
- Test-first (ADR-0010): added `packages/client/src/marker/usePlacingMode.test.tsx` with a failing
  assertion that a click inside the widget's own chrome (`data-airside-chrome`) — the launcher place
  button and the panel — does NOT dispatch `SET_DRAFT`, plus a positive control that ordinary page
  content still places a pin. Confirmed RED against unmodified source, then GREEN after the fix.
- Fixed the place-mode click guard in `packages/client/src/marker/usePlacingMode.ts`:
  - Repaired the dead place-button check: `dataset.commentsPlace` → `dataset.airsidePlace`
    (rebrand left the guard reading the pre-ADR-0038 key, so it was never set).
  - Extended the chrome skip to `target.closest('[data-airside-overlay], [data-airside-chrome]')`.
- Marked the widget chrome with `data-airside-chrome`:
  - `packages/client/src/ui/Launcher.tsx` (launcher root) — this is the load-bearing fix; real
    clicks land on the inner `<span>`, so only `closest()` catches the place/panel buttons.
  - `packages/client/src/panel/PanelDrawer.tsx` (`Dialog.Content`; Radix forwards data-attrs through
    the portal, as the existing `data-testid` proves).
- Added an end-to-end integration case to `packages/client/src/marker/MarkerLayer.test.tsx`
  (`renderLayer` harness) proving the reported symptom: in place mode, the ☰ button opens the
  sidebar, clicking inside the sidebar interacts with it, and clicking the active place button exits
  place mode — none drop a draft.
- Added changeset `.changeset/fix-place-mode-chrome-guard.md` (`@airnauts/airside-client`, patch).

## Decisions
- Used a shared `data-airside-chrome` marker (distinct from the `pointer-events-none`
  `data-airside-overlay` on the pin layer / draft popover) for interactive widget chrome, and made
  the guard skip both — matches the issue's proposed fix.
- Kept the repaired `dataset.airsidePlace` check even though the chrome marker on the launcher makes
  it largely redundant (clicks usually hit the inner span): matches the issue's "repair" wording and
  is harmless belt-and-suspenders.
- Scope limited to launcher + panel, per the issue. Other interactive chrome (toast, identity modal)
  is not reachable as a place-mode bail-out control today — see Follow-ups.

## Verification   (exact commands + results)
- RED (before fix): `pnpm --filter @airnauts/airside-client exec vitest run src/marker/usePlacingMode.test.tsx`
  → 2 failed, 1 passed (chrome guards failed on the `SET_DRAFT` assertion; positive control passed).
- GREEN (after fix): `pnpm --filter @airnauts/airside-client test` → 54 files, 322 tests passed.
- Marker subset: `pnpm --filter @airnauts/airside-client exec vitest run src/marker` → 3 files, 19 passed.
- Lint (biome ci): `pnpm lint` → exit 0 (29 pre-existing warnings, 0 errors).

## Follow-ups / not done
- Only the launcher and panel are marked as chrome. If other interactive widget surfaces (e.g. the
  toast, identity modal) ever become reachable as place-mode bail-out controls, they should get the
  same `data-airside-chrome` marker; not needed for this fix.

_Automated by airside-builder for #33._
