# Thread-toolbar overflow menu

**Date:** 2026-06-15
**Status:** Approved (brainstorm)

## Problem

The thread header's right-hand group renders one inline button per `thread-toolbar`
action ahead of the Resolve and close (`✕`) buttons. With the Jira integration adding
a wide "Create Jira issue" button, the bar is crowded; a second integration would
overflow it.

## Goal

Collapse the descriptor-driven `thread-toolbar` actions into a single `⋯` overflow
menu placed between Resolve and `✕`, in both the popover and sidebar variants. Resolve
stays a one-tap button (the highest-frequency action); `✕` stays popover-only as today.

## Decisions

- **What collapses:** only the integration (`thread-toolbar`) actions. Resolve/Reopen
  stays a visible button. (Brainstorm option A.)
- **Variant scope:** both the pin popover and the sidebar/panel variant.
- **Empty state:** when a thread has zero `thread-toolbar` actions, `ThreadActions`
  returns `null` — no `⋯`; header is `[Resolve] [✕]` (popover) / `[Resolve]` (sidebar).
- **Primitive:** add `@radix-ui/react-dropdown-menu` (same Radix family already used),
  for proper menu semantics: `role=menu`, arrow-key roving, typeahead, Esc /
  click-outside, focus return.
- **Primary emphasis in menu:** out of scope for v1 — `presentation.style` no longer
  maps to a button variant; all items render uniformly.
- **Success feedback:** unchanged — no new "issue created" toast. Success surfaces via
  the `ThreadMetadata` link chip and the action hiding itself through its `visibleWhen`.

## Components

### `ThreadConversation.tsx` (header layout)

Reorder the right-hand group from `[actions] [Resolve] [✕]` to
`[Resolve] [⋯] [✕]` — move `<ThreadActions>` to *after* the Resolve button. No other
header change. `✕` remains rendered only for `variant === 'popover'`.

### `ThreadActions.tsx` (rewrite)

Same props (`id`, `actions`, `controller`), same filter (`slot === 'thread-toolbar'`),
same `null` return when the toolbar set is empty. Render instead of a button row:

- **Trigger:** `<Button variant="ghost" size="icon" aria-label="More actions">⋯</Button>`
  wrapped in `DropdownMenu.Trigger asChild` (`Button` forwards its ref and spreads
  `{...rest}`, so it is a valid `asChild` child).
- **Content:** `DropdownMenu.Portal` with `container` from `usePortalContainer()` →
  `DropdownMenu.Content` → one `DropdownMenu.Item` per action. Each item shows the
  optional `presentation.icon` then `action.label`.
- **Run:** an item's `onSelect` calls `controller.runAction(id, action.id)` and toasts
  `"${action.label} failed"` when it returns `false` (unchanged behavior).
- **Running state:** keep reading `runningActionId` from `useThreadActions`. The matching
  item renders a `…` spinner prefix and is `disabled` (visible if the menu is reopened
  during the brief async run). Selecting an item closes the menu (Radix default).

### Dismissal interaction

The menu content is portaled under `[data-comments-root]`. The pin popover's existing
`onInteractOutside` guard keeps the popover open for interactions within that root, so
opening the menu or selecting an item does not collapse the popover. `Esc` closes the
topmost layer first (menu), then the popover, via Radix's dismissable-layer stack.
`onCloseAutoFocus` returns focus to the `⋯` trigger.

## Dependency

Add `@radix-ui/react-dropdown-menu` to `packages/client/package.json` (resolves to
`^2.x` — its own major line, newer than the `^1.x` `react-popover` / `react-dialog`).

## Testing (TDD)

Update `ThreadActions.test.tsx`:

- renders the `⋯` trigger when ≥1 `thread-toolbar` action; returns `null` (no `⋯`) when none;
- opening the menu reveals each action's label;
- selecting an item calls `controller.runAction(id, actionId)` and toasts on `false`;
- the running action renders a busy/disabled item.

Check `ThreadConversation.test.tsx` for assertions on inline action buttons and update
them to the menu.

## Out of scope

No change to `core` descriptors, the server, the Jira package, or the
`slot`/`presentation` schema. Composer, comment list, and the metadata chip are
untouched.

## Release

`@airnauts/comments-client` is publishable → a `minor` changeset (pre-1.0 policy:
user-facing UI change plus a new dependency), with a changelog-reader-facing summary.
