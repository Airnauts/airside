# Shared `Button` component — design

**Date:** 2026-06-03
**Status:** approved (pending spec review)

## Problem

The widget UI (`@airnauts/comments-client`) hand-rolls **17 raw `<button>`
elements** across nine files. The same identity classes
(`border-0 cursor-pointer text-white bg-blue-600 …`) are copy-pasted at every
call site, so a styling change means editing N places and the buttons drift.
ADR-0005 names "shadcn/ui (Radix + Tailwind)" as the UI stack, but in practice
only the Radix *overlay* primitives (Dialog, Popover) are used; simple elements
like buttons were never unified.

This refactor introduces one shared `Button` that owns button *identity*
(color, border, radius, font, base layout) so call sites stop repeating it.

## Scope

A shared `Button` covers the **true buttons** only. Genuinely-different widgets
stay bespoke (forcing them into a Button API would be lossy).

**Migrates (8 buttons):**

| Call site | variant | size | notes |
|---|---|---|---|
| `Launcher` "+ Comment" | primary | md | `placing` toggles bg via `className` |
| `LoginLauncher` "Log In" | primary | md | keeps its `shadow-[…]` via `className` |
| `Composer` "Send" | primary | sm | `canSend` toggles bg/cursor via `className`; uses native `disabled` |
| `ThreadCard` "Resolve/Reopen" | outline | sm | `resolved` toggles text color via `className` |
| `Composer` "Cancel" | outline | sm | |
| `Launcher` ☰ (open panel) | ghost | icon | keeps `hover:bg-gray-100` via `className` |
| `ThreadCard` ✕ (close) | ghost | icon | hit target grows to 28px |
| `Composer` 📎 (attach) | ghost | icon | hit target grows to 28px |

**Left bespoke (out of scope):**

- `Pin` — a Radix `Popover.Trigger asChild` with ref-forwarding and a pile of
  `data-*` anchor attributes; it is the anchoring element, not a generic button.
- `Launcher` "Show resolved" — `role="switch"` with a toggle track; semantically
  a Switch, not a button.
- `CommentList` "Retry" — styled as a link (the `LINK` constant), not a button.
- `Attachment` remove ✕ (`bg-gray-900 text-white`) and Retry overlay
  (`bg-red-500/15 text-red-700`) — `absolute`-positioned colored overlays that
  override bg/text, so they would fight any variant.

## Component API

`packages/client/src/ui/Button.tsx`, styled with the existing `cn()` from
`lib/cn.ts`. **No new dependency** — a plain variant/size lookup record (not
`class-variance-authority`) keeps it consistent with the codebase and adds
nothing to the bundle (the widget has a hard ~300 kB brotli budget).

```tsx
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: 'primary' | 'outline' | 'ghost'
  size: 'sm' | 'md' | 'icon'
}
```

- **Base** (always applied):
  `cmnt:inline-flex cmnt:items-center cmnt:justify-center cmnt:font-semibold cmnt:cursor-pointer cmnt:disabled:cursor-default`
  plus `cmnt:transition-colors`.
- `type="button"` is defaulted (overridable).
- `className` is merged **last** via `cn()`, so it wins on conflicts. This is
  where stateful and layout classes live (the `placing`/`canSend`/`resolved`
  toggles, the `shadow`, the ☰ hover, any positioning) — variant + size set the
  skeleton, `className` carries the per-call deltas.
- All `aria-*`, `data-*`, `onClick`, `disabled`, and `ref` pass through via
  `...rest` (ref via `forwardRef` for parity with other `ui/` components, even
  though no in-scope call site needs it today).

### Variants — the duplicated identity classes

| variant | classes |
|---|---|
| primary | `cmnt:text-white cmnt:bg-blue-600 cmnt:border-0` |
| outline | `cmnt:bg-white cmnt:border cmnt:border-gray-300 cmnt:text-gray-600` |
| ghost | `cmnt:bg-transparent cmnt:border-0 cmnt:text-gray-500` |

> Per the widget Tailwind v4 conventions, use `cmnt:border-0` (not
> `border-none`, which poisons the style var) — see
> `reference_widget_tailwind_v4_gotchas`.

### Sizes — standard Tailwind spacing; rounding follows size

| size | classes | maps to |
|---|---|---|
| `sm` | `cmnt:px-3 cmnt:py-1 cmnt:text-xs cmnt:rounded-md` | Resolve/Reopen, Cancel, Send |
| `md` | `cmnt:px-4 cmnt:py-2 cmnt:text-sm cmnt:rounded-full` | "+ Comment", Log In (launcher pills) |
| `icon` | `cmnt:w-7 cmnt:h-7 cmnt:rounded-full` | ☰, ThreadCard ✕, Composer 📎 |

Rounding is a deterministic function of size (`sm` → `rounded-md`, `md`/`icon`
→ `rounded-full`), so no separate radius prop is needed. No arbitrary pixel
values: every token is on the Tailwind scale (`w-7`/`h-7` = 28 px).

## Accepted visual deltas

This is a near-pure refactor; the only intentional pixel shifts come from
snapping bespoke values onto the Tailwind scale (you approved adjusting padding
to minimize the number of sizes):

- "Resolve/Reopen": `px-2 py-[3px] text-[11px]` → `px-3 py-1 text-xs` (a few px larger).
- "Send"/"Cancel": `px-[11px] py-[5px]` → `px-3 py-1` (~1 px).
- "+ Comment": `px-3.5` → `px-4` (2 px wider); `text-[13px]` → `text-sm` (1 px).
- ThreadCard ✕ and Composer 📎: small bespoke hit areas → 28 px `icon` square
  (larger, more clickable target).

**No focus ring is added** — today no button has a `focus-visible` ring; keeping
it that way makes this a behavior-preserving refactor. Adding focus-visible
styling is a deliberate follow-up, not part of this change.

## Testing

Client/widget testing follows architecture §9 (not strict TDD), but the existing
component tests are the safety net for this refactor:

- New `packages/client/src/ui/Button.test.tsx`: renders each
  variant/size, asserts the variant + size class set is applied, that
  `className` is merged and wins, that `type="button"` is the default, and that
  `onClick`/`disabled`/`aria-*`/`data-*` pass through.
- The existing tests for each migrated call site (`Launcher.test.tsx`,
  `LoginLauncher.test.tsx`, `ThreadCard`/`ThreadPopover.test.tsx`,
  `Composer.test.tsx`) must stay green unchanged — they assert behavior
  (`data-testid`, `aria-*`, click handlers, disabled), which the migration
  preserves. If any test asserts a literal class string, update it to match the
  shared component (and note it).
- `pnpm --filter @airnauts/comments-client test` and `pnpm lint` (Biome ci) are
  the gates.

## Changeset

`@airnauts/comments-client` gets a **patch** changeset (internal refactor, no
public API or behavior change). Summary written for the changelog reader, e.g.
"Unify widget buttons onto a shared Button component (no visible behavior
change)."

## Out of scope / follow-ups

- Focus-visible ring across buttons (a11y improvement).
- Migrating the bespoke widgets (Pin, Switch, Retry link, Attachment overlays).
- A `size` standardization pass on the launcher pills vs in-panel buttons beyond
  what is needed here.
