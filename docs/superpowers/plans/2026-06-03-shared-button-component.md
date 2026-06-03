# Shared Button Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 8 hand-rolled `<button>` elements in the widget with one shared `Button` component that owns button identity (color/border/radius/font/layout), eliminating copy-pasted class strings.

**Architecture:** A single `Button` (`packages/client/src/ui/Button.tsx`) composes a base class string + a `variant` lookup (`primary`/`outline`/`ghost`) + a `size` lookup (`sm`/`md`/`icon`) via the existing `cn()` helper, with `className` merged **last** so call sites can override (verified: `tailwind-merge` dedupes `cmnt:`-prefixed classes, so a later `cmnt:bg-blue-800` beats the variant's `cmnt:bg-blue-600`). Stateful/positional classes (`placing`, `canSend`, `resolved`, shadows, hover) stay at the call site as `className`.

**Tech Stack:** TypeScript, React 19 (`forwardRef`), Tailwind v4 with the `cmnt:` prefix via `cn()` (clsx + tailwind-merge), Vitest + `@testing-library/react` (jsdom), Biome.

**Spec:** [`docs/superpowers/specs/2026-06-03-shared-button-component-design.md`](../specs/2026-06-03-shared-button-component-design.md)

---

## File Structure

- **Create** `packages/client/src/ui/Button.tsx` — the shared component, its `BASE`/`VARIANTS`/`SIZES` constants, and exported `ButtonProps`/`ButtonVariant`/`ButtonSize` types. Single responsibility: render a styled `<button>`.
- **Create** `packages/client/src/ui/Button.test.tsx` — unit tests for the component contract (defaults, variant/size classes, className-wins, prop passthrough).
- **Modify** `packages/client/src/ui/Launcher.tsx` — migrate the ☰ open-panel button (ghost/icon) and the "+ Comment" button (primary/md). Leave the `role="switch"` Resolved toggle untouched.
- **Modify** `packages/client/src/ui/LoginLauncher.tsx` — migrate the "Log In" button (primary/md).
- **Modify** `packages/client/src/ui/Composer.tsx` — migrate the 📎 attach button (ghost/icon), "Cancel" (outline/sm), and "Send" (primary/sm).
- **Modify** `packages/client/src/ui/ThreadCard.tsx` — migrate "Resolve/Reopen" (outline/sm) and the ✕ close button (ghost/icon).
- **Create** `.changeset/<name>.md` — patch changeset for `@airnauts/comments-client`.

**Left bespoke (do NOT touch):** `Pin.tsx` (Radix trigger), the Launcher Resolved `role="switch"`, `CommentList` Retry link, and the two `Attachment` overlay buttons.

**Conventions:** Use `cmnt:border-0` (never `border-none` — it poisons the Tailwind style var in this widget). All run commands assume cwd `packages/client` unless noted; the worktree already has real (non-symlinked) `node_modules`.

---

## Task 1: Create the `Button` component (TDD)

**Files:**
- Create: `packages/client/src/ui/Button.tsx`
- Test: `packages/client/src/ui/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/ui/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(
      <Button variant="primary" size="sm">
        Go
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button')
  })

  it('applies the variant and size class sets', () => {
    render(
      <Button variant="primary" size="md">
        Go
      </Button>,
    )
    const cls = screen.getByRole('button').className
    expect(cls).toContain('cmnt:bg-blue-600') // primary
    expect(cls).toContain('cmnt:text-white') // primary
    expect(cls).toContain('cmnt:rounded-full') // md
    expect(cls).toContain('cmnt:px-4') // md
    expect(cls).toContain('cmnt:font-semibold') // base
  })

  it('merges className and lets it win on a conflicting utility', () => {
    render(
      <Button variant="primary" size="sm" className="cmnt:bg-blue-800">
        Go
      </Button>,
    )
    const cls = screen.getByRole('button').className
    expect(cls).toContain('cmnt:bg-blue-800')
    expect(cls).not.toContain('cmnt:bg-blue-600') // tailwind-merge drops the variant default
  })

  it('passes through onClick, disabled, aria-*, and data-*', () => {
    const onClick = vi.fn()
    render(
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled
        aria-label="Close"
        data-testid="x"
      />,
    )
    const btn = screen.getByTestId('x')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-label', 'Close')
    expect(btn.className).toContain('cmnt:bg-transparent') // ghost
    expect(btn.className).toContain('cmnt:w-7') // icon
  })

  it('honors an explicit type override', () => {
    render(
      <Button variant="outline" size="sm" type="submit">
        Submit
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-client test -- Button`
Expected: FAIL — `Failed to resolve import './Button'` (component does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/client/src/ui/Button.tsx`:

```tsx
// packages/client/src/ui/Button.tsx
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/cn'

export type ButtonVariant = 'primary' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'icon'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant
  size: ButtonSize
}

const BASE =
  'cmnt:inline-flex cmnt:items-center cmnt:justify-center cmnt:font-semibold cmnt:cursor-pointer cmnt:transition-colors cmnt:disabled:cursor-default'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'cmnt:text-white cmnt:bg-blue-600 cmnt:border-0',
  outline: 'cmnt:bg-white cmnt:border cmnt:border-gray-300 cmnt:text-gray-600',
  ghost: 'cmnt:bg-transparent cmnt:border-0 cmnt:text-gray-500',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'cmnt:px-3 cmnt:py-1 cmnt:text-xs cmnt:rounded-md',
  md: 'cmnt:px-4 cmnt:py-2 cmnt:text-sm cmnt:rounded-full',
  icon: 'cmnt:w-7 cmnt:h-7 cmnt:rounded-full',
}

/** The widget's single button primitive. `variant` sets colour/border identity,
 *  `size` sets padding/text/radius; pass `className` for stateful or positional
 *  overrides (it is merged last and wins on conflicts). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  )
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-client test -- Button`
Expected: PASS (all 5 tests). The `className`-wins test confirms `tailwind-merge` dedupes the `cmnt:`-prefixed `bg-blue-*` group.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/Button.tsx packages/client/src/ui/Button.test.tsx
git commit -m "feat(client): add shared Button component (variant + size)"
```

---

## Task 2: Migrate `Launcher` (☰ ghost/icon + "+ Comment" primary/md)

**Files:**
- Modify: `packages/client/src/ui/Launcher.tsx`

- [ ] **Step 1: Confirm the existing Launcher tests pass first (baseline)**

Run: `pnpm --filter @airnauts/comments-client test -- Launcher`
Expected: PASS. (Establishes the behavior baseline before refactoring.)

- [ ] **Step 2: Add the Button import**

In `packages/client/src/ui/Launcher.tsx`, the import block is currently:

```tsx
// packages/client/src/ui/Launcher.tsx
import { cn } from '../lib/cn'
```

Change it to:

```tsx
// packages/client/src/ui/Launcher.tsx
import { Button } from './Button'
import { cn } from '../lib/cn'
```

- [ ] **Step 3: Replace the ☰ open-panel button**

Replace this block:

```tsx
      <button
        type="button"
        aria-label="Open comments panel"
        data-testid="comments-panel-open"
        onClick={onTogglePanel}
        className="cmnt:inline-flex cmnt:items-center cmnt:justify-center cmnt:w-7 cmnt:h-7 cmnt:rounded-full cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:text-gray-500 cmnt:hover:bg-gray-100"
      >
        <span aria-hidden={true}>☰</span>
      </button>
```

with:

```tsx
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open comments panel"
        data-testid="comments-panel-open"
        onClick={onTogglePanel}
        className="cmnt:hover:bg-gray-100"
      >
        <span aria-hidden={true}>☰</span>
      </Button>
```

- [ ] **Step 4: Replace the "+ Comment" button**

Replace this block:

```tsx
      <button
        type="button"
        data-comments-place
        data-testid="comments-place"
        aria-pressed={placing}
        onClick={onTogglePlace}
        className={cn(
          'cmnt:rounded-full cmnt:px-3.5 cmnt:py-2 cmnt:text-white cmnt:border-none cmnt:cursor-pointer cmnt:text-[13px] cmnt:font-semibold',
          placing ? 'cmnt:bg-blue-800' : 'cmnt:bg-blue-600',
        )}
      >
        {placing ? 'Click to comment…' : `+ Comment${openCount ? ` (${openCount})` : ''}`}
      </button>
```

with:

```tsx
      <Button
        variant="primary"
        size="md"
        data-comments-place
        data-testid="comments-place"
        aria-pressed={placing}
        onClick={onTogglePlace}
        className={cn(placing && 'cmnt:bg-blue-800')}
      >
        {placing ? 'Click to comment…' : `+ Comment${openCount ? ` (${openCount})` : ''}`}
      </Button>
```

Note: `cn()` is still imported and used (for the Resolved switch track at lines ~42-51 and the `placing` override here), so the import stays.

- [ ] **Step 5: Run the Launcher tests**

Run: `pnpm --filter @airnauts/comments-client test -- Launcher`
Expected: PASS (unchanged — tests assert `data-testid`, `aria-pressed`, and click behavior, all preserved).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/ui/Launcher.tsx
git commit -m "refactor(client): use shared Button in Launcher"
```

---

## Task 3: Migrate `LoginLauncher` ("Log In" primary/md)

**Files:**
- Modify: `packages/client/src/ui/LoginLauncher.tsx`

- [ ] **Step 1: Confirm the existing tests pass first (baseline)**

Run: `pnpm --filter @airnauts/comments-client test -- LoginLauncher`
Expected: PASS.

- [ ] **Step 2: Add the Button import**

In `packages/client/src/ui/LoginLauncher.tsx`, after the top comment line add the import. The file currently starts:

```tsx
// packages/client/src/ui/LoginLauncher.tsx

export type LoginLauncherProps = {
```

Change to:

```tsx
// packages/client/src/ui/LoginLauncher.tsx
import { Button } from './Button'

export type LoginLauncherProps = {
```

- [ ] **Step 3: Replace the "Log In" button**

Replace this block:

```tsx
      <button
        type="button"
        aria-label="Log in"
        data-testid="comments-login"
        onClick={onLogIn}
        className="cmnt:inline-flex cmnt:items-center cmnt:gap-1.5 cmnt:rounded-full cmnt:px-4 cmnt:py-2 cmnt:bg-blue-600 cmnt:text-white cmnt:border-none cmnt:cursor-pointer cmnt:text-[13px] cmnt:font-semibold cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </button>
```

with:

```tsx
      <Button
        variant="primary"
        size="md"
        aria-label="Log in"
        data-testid="comments-login"
        onClick={onLogIn}
        className="cmnt:gap-1.5 cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </Button>
```

Note: `cmnt:gap-1.5` (icon + label spacing) and the drop shadow are call-specific, so they stay in `className`. The base already provides `inline-flex items-center justify-center`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @airnauts/comments-client test -- LoginLauncher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/LoginLauncher.tsx
git commit -m "refactor(client): use shared Button in LoginLauncher"
```

---

## Task 4: Migrate `Composer` (📎 ghost/icon, Cancel outline/sm, Send primary/sm)

**Files:**
- Modify: `packages/client/src/ui/Composer.tsx`

- [ ] **Step 1: Confirm the existing Composer tests pass first (baseline)**

Run: `pnpm --filter @airnauts/comments-client test -- Composer`
Expected: PASS.

- [ ] **Step 2: Add the Button import**

In `packages/client/src/ui/Composer.tsx`, the imports currently include:

```tsx
import { cn } from '../lib/cn'
import { PendingAttachment, type PendingStatus } from './Attachment'
```

Add the Button import directly below `cn`:

```tsx
import { cn } from '../lib/cn'
import { Button } from './Button'
import { PendingAttachment, type PendingStatus } from './Attachment'
```

- [ ] **Step 3: Replace the 📎 attach button**

Replace this block:

```tsx
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-base cmnt:text-gray-400"
        >
          📎
        </button>
```

with:

```tsx
        <Button
          variant="ghost"
          size="icon"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="cmnt:text-base cmnt:text-gray-400"
        >
          📎
        </Button>
```

Note: `cmnt:text-gray-400` overrides the ghost default `text-gray-500`, and `cmnt:text-base` keeps the emoji sizing — both via `className` (merged last, so they win).

- [ ] **Step 4: Replace the "Cancel" button**

Replace this block:

```tsx
          <button
            type="button"
            onClick={onCancel}
            className="cmnt:bg-white cmnt:border cmnt:border-gray-300 cmnt:rounded-md cmnt:px-[11px] cmnt:py-[5px] cmnt:text-xs cmnt:font-semibold cmnt:text-gray-600 cmnt:cursor-pointer"
          >
            Cancel
          </button>
```

with:

```tsx
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
```

- [ ] **Step 5: Replace the "Send" button**

Replace this block:

```tsx
        <button
          type="button"
          onClick={onSendClick}
          disabled={!canSend}
          className={cn(
            'cmnt:text-white cmnt:rounded-md cmnt:px-[11px] cmnt:py-[5px] cmnt:text-xs cmnt:font-semibold cmnt:border-none',
            canSend
              ? 'cmnt:bg-blue-600 cmnt:cursor-pointer'
              : 'cmnt:bg-[#93b4f5] cmnt:cursor-default',
          )}
        >
          Send
        </button>
```

with:

```tsx
        <Button
          variant="primary"
          size="sm"
          onClick={onSendClick}
          disabled={!canSend}
          className={cn(!canSend && 'cmnt:bg-[#93b4f5]')}
        >
          Send
        </Button>
```

Note: the primary variant supplies `bg-blue-600`/`text-white`; when `!canSend` the `cmnt:bg-[#93b4f5]` override wins (merged last), and the base's `cmnt:disabled:cursor-default` + the native `disabled` attribute replace the old explicit `cursor-default`. `cn` is still used elsewhere? No other `cn` usage remains in this file after this change **except** this line — keep the `cn` import (still referenced here).

- [ ] **Step 6: Run the Composer tests**

Run: `pnpm --filter @airnauts/comments-client test -- Composer`
Expected: PASS. The class assertions in `Composer.test.tsx` (lines 28-29) target the text `<input>` (`cmnt:min-w-0`, `cmnt:flex-1`), which is unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/ui/Composer.tsx
git commit -m "refactor(client): use shared Button in Composer"
```

---

## Task 5: Migrate `ThreadCard` (Resolve/Reopen outline/sm + ✕ close ghost/icon)

**Files:**
- Modify: `packages/client/src/ui/ThreadCard.tsx`

- [ ] **Step 1: Confirm the related tests pass first (baseline)**

Run: `pnpm --filter @airnauts/comments-client test -- ThreadPopover DetachedThread`
Expected: PASS. (ThreadCard is rendered through ThreadPopover/DetachedThread; there is no standalone `ThreadCard.test.tsx`.)

- [ ] **Step 2: Add the Button import**

In `packages/client/src/ui/ThreadCard.tsx`, the imports currently include:

```tsx
import { cn } from '../lib/cn'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { CommentList } from './CommentList'
```

Add the Button import directly below `cn`:

```tsx
import { cn } from '../lib/cn'
import { Button } from './Button'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { CommentList } from './CommentList'
```

- [ ] **Step 3: Replace the "Resolve/Reopen" button**

Replace this block:

```tsx
          <button
            type="button"
            onClick={toggleStatus}
            className={cn(
              'cmnt:border cmnt:border-gray-300 cmnt:rounded-md cmnt:px-2 cmnt:py-[3px] cmnt:text-[11px] cmnt:font-semibold cmnt:bg-white cmnt:cursor-pointer',
              resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600',
            )}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </button>
```

with:

```tsx
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={cn(resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600')}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </Button>
```

Note: the outline variant default `text-gray-600` is overridden by the `resolved`-conditional color (merged last, so it wins).

- [ ] **Step 4: Replace the ✕ close button**

Replace this block:

```tsx
          <button
            type="button"
            aria-label="Close"
            onClick={() => controller.close()}
            className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:px-1.5 cmnt:py-0.5"
          >
            ✕
          </button>
```

with:

```tsx
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => controller.close()}
          >
            ✕
          </Button>
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @airnauts/comments-client test -- ThreadPopover DetachedThread`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/ui/ThreadCard.tsx
git commit -m "refactor(client): use shared Button in ThreadCard"
```

---

## Task 6: Add the changeset

**Files:**
- Create: `.changeset/shared-button.md`

- [ ] **Step 1: Write the changeset file**

Create `.changeset/shared-button.md` (repo root):

```markdown
---
"@airnauts/comments-client": patch
---

Unify widget buttons onto a shared Button component. No visible behavior change.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/shared-button.md
git commit -m "chore: changeset for shared Button refactor"
```

---

## Task 7: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite**

Run: `pnpm --filter @airnauts/comments-client test`
Expected: PASS — all suites green, including the new `Button` tests and every migrated call site.

- [ ] **Step 2: Run the lint/format gate**

Run: `pnpm lint`
Expected: PASS (Biome ci). If Biome reports import ordering on the added `import { Button }` lines, run `pnpm lint --write` (or the repo's format script) and re-run `pnpm lint`, then amend the relevant commit.

- [ ] **Step 3: Typecheck / build the client**

Run: `pnpm --filter @airnauts/comments-client build`
Expected: PASS — no TypeScript errors; `ButtonProps`/variant/size types resolve.

- [ ] **Step 4: Sanity-grep for leftover raw buttons in migrated files**

Run: `grep -rn "<button" packages/client/src/ui/Launcher.tsx packages/client/src/ui/LoginLauncher.tsx packages/client/src/ui/Composer.tsx packages/client/src/ui/ThreadCard.tsx`
Expected: exactly **one** match — the `role="switch"` Resolved toggle in `Launcher.tsx` (intentionally left bespoke). `LoginLauncher.tsx`, `Composer.tsx`, and `ThreadCard.tsx` should have no `<button>` left. Confirm the single hit is the switch and not a missed migration. (The other bespoke raw buttons live in `Pin.tsx`, `CommentList.tsx`, and `Attachment.tsx`, which this grep does not cover.)

---

## Notes / accepted deltas (from the spec)

- Pixel shifts from snapping to the Tailwind scale: Resolve grows ~4px, Send/Cancel ~1px, "+ Comment" 2px wider + 1px larger text, and the ✕/📎 icon buttons grow to a 28px square hit target. All approved in the spec.
- No `focus-visible` ring is added (behavior-preserving refactor); it is a documented follow-up.
- `Pin`, the Resolved switch, the Retry link, and the two `Attachment` overlay buttons are intentionally left bespoke.
