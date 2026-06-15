# Thread-toolbar Overflow Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the descriptor-driven `thread-toolbar` actions in the thread header into a single `⋯` overflow menu placed between Resolve and `✕`, in both the popover and sidebar variants.

**Architecture:** Rewrite `ThreadActions` from an inline button row into a Radix `DropdownMenu` (one `menuitem` per action). Reorder the header group in `ThreadConversation` so `⋯` sits left of `✕`. Behavior contracts are unchanged: same props, same `null`-when-empty, same `controller.runAction` + toast-on-failure, same `runningActionId` busy state.

**Tech Stack:** React 19, `@radix-ui/react-dropdown-menu` (new), Tailwind v4 (`cmnt:` prefix), Vitest + Testing Library (`fireEvent`, jsdom 26).

**Spec:** `docs/superpowers/specs/2026-06-15-thread-overflow-menu-design.md`

**Working dir:** the `thread-overflow-menu` git worktree. Its `node_modules` is a real directory (not symlinked to main), so `pnpm add` / `pnpm test` operate locally. Run all commands from the worktree root unless a path says otherwise.

---

## File Structure

- **Modify** `packages/client/package.json` — add the `@radix-ui/react-dropdown-menu` dependency.
- **Rewrite** `packages/client/src/ui/ThreadActions.tsx` — overflow menu instead of a button row. Same public props.
- **Modify** `packages/client/src/ui/ThreadConversation.tsx:144-164` — reorder header right-group to `[Resolve] [⋯] [✕]`.
- **Rewrite tests** `packages/client/src/ui/ThreadActions.test.tsx` — open the menu before asserting on items.
- **Check** `packages/client/src/ui/ThreadConversation.test.tsx` — update any assertion that depends on an inline action button.
- **Create** `.changeset/<name>.md` — `minor` bump for `@airnauts/comments-client`.

No changes to `core`, `server`, the Jira package, or the `slot`/`presentation` schema.

---

## Task 1: Add the dropdown-menu dependency

**Files:**
- Modify: `packages/client/package.json` (dependencies)
- Modify: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Install the package into the client workspace**

Run:
```bash
pnpm --filter @airnauts/comments-client add @radix-ui/react-dropdown-menu
```
Expected: `package.json` gains `"@radix-ui/react-dropdown-menu": "^2.x.x"` under `dependencies`; `pnpm-lock.yaml` updates. (It is major 2.x — newer than the 1.x `react-popover`/`react-dialog`; that is correct, not a mistake.)

- [ ] **Step 2: Verify it resolves**

Run:
```bash
ls packages/client/node_modules/@radix-ui/react-dropdown-menu/package.json
```
Expected: the path exists (no error).

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "build(client): add @radix-ui/react-dropdown-menu"
```

---

## Task 2: Rewrite ThreadActions as an overflow menu (TDD)

The existing tests assert directly on action buttons (`getByRole('button', { name: /create issue/i })`). With a menu, actions are not in the DOM until the `⋯` trigger opens. Radix `DropdownMenu` opens on `pointerDown`; jsdom 26 plus the existing `test-setup.ts` pointer-capture mocks make `fireEvent.pointerDown` work. Menu items get `role="menuitem"`.

**Fallback if `fireEvent.pointerDown` does not open the menu** (the menu items never appear in Step 4): make `openMenu()` fire the keyboard path instead, which is independent of pointer quirks:
```ts
function openMenu() {
  const trigger = screen.getByRole('button', { name: /more actions/i })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
}
```
Do NOT add `@testing-library/user-event` — the project doesn't use it and one of the two `fireEvent` approaches above is sufficient.

**Files:**
- Test (rewrite): `packages/client/src/ui/ThreadActions.test.tsx`
- Rewrite: `packages/client/src/ui/ThreadActions.tsx`

- [ ] **Step 1: Replace the test file with the menu-aware version**

Replace the entire contents of `packages/client/src/ui/ThreadActions.test.tsx` with:

```tsx
// packages/client/src/ui/ThreadActions.test.tsx
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import type { Controller } from '../threads/controller'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useDispatch } from '../threads/useThreads'
import { ThreadActions } from './ThreadActions'
import { ToastProvider } from './toast'

const toolbarAction = (over: Partial<ThreadActionDescriptor> = {}): ThreadActionDescriptor => ({
  id: 'jira.createIssue',
  provider: 'jira',
  label: 'Create issue',
  slot: 'thread-toolbar',
  ...over,
})

const metadataAction = (over: Partial<ThreadActionDescriptor> = {}): ThreadActionDescriptor => ({
  id: 'jira.openIssue',
  provider: 'jira',
  label: 'Open in Jira',
  slot: 'thread-metadata',
  ...over,
})

const stubController = (over: Partial<Controller> = {}) =>
  ({ runAction: vi.fn().mockResolvedValue(true), ...over }) as unknown as Controller

const stubClient = () => ({ getThread: vi.fn() }) as never

/** Open the ⋯ overflow menu. Radix opens on pointerdown (jsdom pointer mocks live in test-setup). */
function openMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: /more actions/i }))
}

describe('ThreadActions', () => {
  it('renders a ⋯ trigger and shows toolbar actions (only) once opened', () => {
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions
          id="a"
          actions={[toolbarAction(), metadataAction()]}
          controller={stubController()}
        />
      </ThreadsProvider>,
    )
    // Closed: no menu items yet.
    expect(screen.queryByRole('menuitem', { name: /create issue/i })).not.toBeInTheDocument()
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).toBeInTheDocument()
    // thread-metadata actions never appear in the toolbar overflow.
    expect(screen.queryByRole('menuitem', { name: /open in jira/i })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no toolbar actions', () => {
    const { container } = render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[metadataAction()]} controller={stubController()} />
      </ThreadsProvider>,
    )
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('selecting an item calls controller.runAction with the thread id and action id', () => {
    const controller = stubController()
    render(
      <ThreadsProvider client={stubClient()}>
        <ThreadActions id="a" actions={[toolbarAction()]} controller={controller} />
      </ThreadsProvider>,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /create issue/i }))
    expect(controller.runAction).toHaveBeenCalledWith('a', 'jira.createIssue')
  })

  it('shows a toast when runAction resolves false', async () => {
    const controller = stubController({ runAction: vi.fn().mockResolvedValue(false) })
    render(
      <WidgetProvider>
        <ToastProvider>
          <ThreadsProvider client={stubClient()}>
            <ThreadActions id="a" actions={[toolbarAction()]} controller={controller} />
          </ThreadsProvider>
        </ToastProvider>
      </WidgetProvider>,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /create issue/i }))
    expect(await screen.findByText(/create issue failed/i)).toBeInTheDocument()
  })

  it('disables the menu item while its action is running', () => {
    function Harness() {
      const dispatch = useDispatch()
      return (
        <>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'ACTION_RUNNING', id: 'a', actionId: 'jira.createIssue' })
            }
          >
            mark-running
          </button>
          <ThreadActions id="a" actions={[toolbarAction()]} controller={stubController()} />
        </>
      )
    }
    render(
      <ThreadsProvider client={stubClient()}>
        <Harness />
      </ThreadsProvider>,
    )
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).not.toHaveAttribute(
      'data-disabled',
    )
    fireEvent.click(screen.getByText('mark-running'))
    openMenu()
    expect(screen.getByRole('menuitem', { name: /create issue/i })).toHaveAttribute('data-disabled')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm --filter @airnauts/comments-client test -- ThreadActions
```
Expected: FAIL — current `ThreadActions` renders `<button>`s, so `getByRole('button', { name: /more actions/i })` is not found (no `⋯` trigger).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `packages/client/src/ui/ThreadActions.tsx` with:

```tsx
// packages/client/src/ui/ThreadActions.tsx
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { usePortalContainer } from '../app/providers'
import type { Controller } from '../threads/controller'
import { useThreadActions } from '../threads/useThreads'
import { Button } from './Button'
import { useToast } from './toast'

/**
 * Overflow menu for descriptor-driven `thread-toolbar` actions. Renders a single `⋯`
 * trigger; each action becomes a menu item. No provider-specific knowledge — `actions`
 * and `controller` come from the parent; the running-action id is read from
 * {@link useThreadActions} so the matching item shows progress and is disabled. Returns
 * `null` when no action targets the toolbar slot (so the header shows no `⋯`).
 */
export function ThreadActions({
  id,
  actions,
  controller,
}: {
  id: string
  actions: ThreadActionDescriptor[]
  controller: Controller
}) {
  const toast = useToast()
  const container = usePortalContainer()
  const { runningActionId } = useThreadActions(id)
  const toolbar = actions.filter((a) => a.slot === 'thread-toolbar')
  if (toolbar.length === 0) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions">
          ⋯
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container ?? undefined}>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="cmnt:z-[var(--cmnt-z-surface)] cmnt:min-w-44 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-lg cmnt:py-1 cmnt:text-[13px] cmnt:text-gray-900 cmnt:shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          {toolbar.map((action) => {
            const running = runningActionId === action.id
            return (
              <DropdownMenu.Item
                key={action.id}
                disabled={running}
                onSelect={async () => {
                  const ok = await controller.runAction(id, action.id)
                  if (!ok) toast(`${action.label} failed`)
                }}
                className="cmnt:flex cmnt:items-center cmnt:gap-2 cmnt:px-3 cmnt:py-1.5 cmnt:cursor-pointer cmnt:outline-none cmnt:hover:bg-gray-100 cmnt:data-[highlighted]:bg-gray-100 cmnt:data-[disabled]:opacity-50 cmnt:data-[disabled]:cursor-default"
              >
                {running && (
                  <span aria-hidden="true" className="cmnt:mr-0.5">
                    …
                  </span>
                )}
                {action.presentation?.icon && (
                  <span aria-hidden="true">{action.presentation.icon}</span>
                )}
                {action.label}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

Notes for the implementer:
- `Button` (`./Button`) already `forwardRef`s and spreads `{...rest}`, so it is a valid `DropdownMenu.Trigger asChild` child — no wrapper needed.
- `onSelect` is async; the menu closes after select (Radix default). `runAction` continues running after close; the busy/disabled state is visible only if the menu is reopened during the brief run — that is intended (per spec).
- The menu portals into `usePortalContainer()`, which lives inside `[data-comments-root]`; the pin popover's `onInteractOutside` guard therefore keeps the popover open when the menu is used.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm --filter @airnauts/comments-client test -- ThreadActions
```
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/ThreadActions.tsx packages/client/src/ui/ThreadActions.test.tsx
git commit -m "feat(client): collapse thread-toolbar actions into a ⋯ overflow menu"
```

---

## Task 3: Reorder the header so ⋯ sits between Resolve and ✕

**Files:**
- Modify: `packages/client/src/ui/ThreadConversation.tsx:144-164`
- Check/Modify: `packages/client/src/ui/ThreadConversation.test.tsx`

- [ ] **Step 1: Check the conversation test for inline-action assumptions**

Run:
```bash
grep -n "ThreadActions\|Create issue\|Create Jira\|runAction\|More actions\|toolbar" packages/client/src/ui/ThreadConversation.test.tsx
```
Expected: note any test that asserts an action renders as a visible button. If found, in that test open the menu first (`fireEvent.pointerDown(screen.getByRole('button', { name: /more actions/i }))`) and assert on `getByRole('menuitem', ...)`. If there are no such assertions, make no change to the test file in this step.

- [ ] **Step 2: Reorder the header right-hand group**

In `packages/client/src/ui/ThreadConversation.tsx`, the header right group currently is (around lines 144-164):

```tsx
        <div className="cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-gray-500">
          <ThreadActions id={id} actions={actions} controller={controller} />
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={cn(resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600')}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </Button>
          {variant === 'popover' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => controller.close()}
            >
              ✕
            </Button>
          )}
        </div>
```

Replace it with the same elements reordered so `ThreadActions` (the `⋯` menu) comes after Resolve and before Close:

```tsx
        <div className="cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-gray-500">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={cn(resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600')}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </Button>
          <ThreadActions id={id} actions={actions} controller={controller} />
          {variant === 'popover' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => controller.close()}
            >
              ✕
            </Button>
          )}
        </div>
```

- [ ] **Step 3: Run the conversation tests**

Run:
```bash
pnpm --filter @airnauts/comments-client test -- ThreadConversation
```
Expected: PASS. (If a test failed because it expected an inline action button, apply the menu-open fix from Step 1, then re-run.)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/ui/ThreadConversation.tsx packages/client/src/ui/ThreadConversation.test.tsx
git commit -m "feat(client): place the ⋯ thread-action menu between Resolve and Close"
```

---

## Task 4: Full client verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite**

Run:
```bash
pnpm --filter @airnauts/comments-client test
```
Expected: PASS, no regressions.

- [ ] **Step 2: Typecheck and lint the client**

Run:
```bash
pnpm --filter @airnauts/comments-client typecheck && pnpm lint
```
Expected: no type errors; Biome (`pnpm lint` = biome ci) passes. Fix any issues, then re-run. (Biome is the strict gate; `cmnt:`-prefixed classes are not lint targets.)

- [ ] **Step 3: Commit any lint/type fixups (only if Step 2 changed files)**

```bash
git add -A && git commit -m "chore(client): lint/type fixups for overflow menu"
```

---

## Task 5: Changeset

**Files:**
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Create the changeset by hand**

Create `.changeset/thread-overflow-menu.md` with:

```markdown
---
"@airnauts/comments-client": minor
---

Thread header now collapses integration thread-actions (e.g. "Create Jira issue") into a single ⋯ overflow menu beside Resolve, so the header stays compact as more integrations are added.
```

(Pre-1.0 policy: a user-facing UI change + new dependency is a `minor` bump. Only `@airnauts/comments-client` changed.)

- [ ] **Step 2: Commit**

```bash
git add .changeset/thread-overflow-menu.md
git commit -m "chore: changeset for thread-action overflow menu"
```

---

## Manual verification (after all tasks)

Not automatable in jsdom — do this once in the running app (`examples/nextjs-host` with `JIRA_API_TOKEN` set, or any thread with a `thread-toolbar` action):

- [ ] Open a pin popover on a thread with a Jira action → header shows `[✓ Resolve] [⋯] [✕]`; the `⋯` opens a menu containing "Create Jira issue".
- [ ] Keyboard: focus `⋯`, press Enter/Arrow → menu opens and items are highlightable with arrow keys; Esc closes the menu but leaves the popover open; focus returns to `⋯`.
- [ ] Selecting "Create Jira issue" runs the action, the menu closes, and on success the Jira link chip appears (action then hides itself); on failure a toast shows.
- [ ] A thread with no integration actions shows `[✓ Resolve] [✕]` — no `⋯`.
- [ ] The sidebar/panel detail view shows the same `⋯` menu (no `✕` there).
```
