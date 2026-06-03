# Login Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the entire commenting UI behind an up-front self-asserted "Log In" step — a logged-out user sees only a "Log In" button; pins and all controls appear only after logging in.

**Architecture:** `WidgetApp` already owns `identity` state. Gate the tree on it in one place: when `identity == null`, render only a new `LoginLauncher` + the (reused) `IdentityModal`; otherwise render today's full tree (`MarkerLayer` + `PanelDrawer`). Hiding is achieved by *not mounting* `MarkerLayer`/`PanelDrawer`, so no pins, place mode, panel, or network fetch happen until login. "Login" is the existing name/email step reframed — no new auth, backend, or schema change.

**Tech Stack:** React 19, Radix UI (Dialog/Popover), Vitest + @testing-library/react (jsdom), Playwright (e2e), Tailwind v4 (`cmnt:` prefix), Changesets.

**Spec:** `docs/superpowers/specs/2026-06-03-login-gate-design.md`

**Working dir:** worktree `login-gate` (branch `worktree-login-gate`, off `main`). Run all commands from `packages/client` unless noted.

---

### Task 1: `LoginLauncher` component

The logged-out entry point — a fixed bottom-right pill with one "Log In" button. Lives at app level (the full `Launcher` is inside `MarkerLayer`, which is unmounted when logged out).

**Files:**
- Create: `packages/client/src/ui/LoginLauncher.tsx`
- Test: `packages/client/src/ui/LoginLauncher.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/ui/LoginLauncher.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginLauncher } from './LoginLauncher'

describe('LoginLauncher', () => {
  it('renders a Log In button and calls onLogIn when clicked', () => {
    const onLogIn = vi.fn()
    render(<LoginLauncher onLogIn={onLogIn} />)
    const btn = screen.getByTestId('comments-login')
    expect(btn).toHaveAccessibleName('Log in')
    fireEvent.click(btn)
    expect(onLogIn).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/ui/LoginLauncher.test.tsx`
Expected: FAIL — `Failed to resolve import "./LoginLauncher"`.

- [ ] **Step 3: Write the component**

Create `packages/client/src/ui/LoginLauncher.tsx`:

```tsx
// packages/client/src/ui/LoginLauncher.tsx

export type LoginLauncherProps = {
  /** Open the login (identity) modal. */
  onLogIn: () => void
}

/** Logged-out entry point: a fixed pill with a single "Log In" button. Rendered at app
 *  level because the full Launcher lives inside MarkerLayer, which is unmounted until login. */
export function LoginLauncher({ onLogIn }: LoginLauncherProps) {
  return (
    <div className="cmnt:fixed cmnt:bottom-4 cmnt:right-4 cmnt:flex cmnt:items-center cmnt:pointer-events-auto">
      <button
        type="button"
        aria-label="Log in"
        data-testid="comments-login"
        onClick={onLogIn}
        className="cmnt:inline-flex cmnt:items-center cmnt:gap-1.5 cmnt:rounded-full cmnt:px-4 cmnt:py-2 cmnt:bg-blue-600 cmnt:text-white cmnt:border-none cmnt:cursor-pointer cmnt:text-[13px] cmnt:font-semibold cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/ui/LoginLauncher.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/LoginLauncher.tsx packages/client/src/ui/LoginLauncher.test.tsx
git commit -m "feat(client): add LoginLauncher (logged-out Log In button)"
```

---

### Task 2: Reframe `IdentityModal` copy as the login screen

The modal is reused as the login screen. Update its title and submit-button copy, and the two assertions that key off the old button text.

**Files:**
- Modify: `packages/client/src/identity/IdentityModal.tsx`
- Modify: `packages/client/src/identity/IdentityModal.test.tsx`

- [ ] **Step 1: Update the test first (new expected copy)**

In `packages/client/src/identity/IdentityModal.test.tsx`, replace **both** occurrences of
`{ name: /start commenting/i }` with `{ name: /log in/i }`. The two lines become:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
```

(They are on lines 17 and 29.)

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/identity/IdentityModal.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name /log in/i` (button still says "Start commenting").

- [ ] **Step 3: Update the component copy**

In `packages/client/src/identity/IdentityModal.tsx`:

Change the title:
```tsx
          <Dialog.Title className="cmnt:mt-0">Log in to comment</Dialog.Title>
```
Change the submit button label:
```tsx
            <button
              type="submit"
              className="cmnt:bg-blue-600 cmnt:text-white cmnt:rounded-md cmnt:px-3 cmnt:py-2 cmnt:border-none cmnt:cursor-pointer"
            >
              Log in
            </button>
```
(Leave `Dialog.Description` — the "label your comments / no verification" copy — unchanged.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/identity/IdentityModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/identity/IdentityModal.tsx packages/client/src/identity/IdentityModal.test.tsx
git commit -m "feat(client): reframe identity modal as the login screen"
```

---

### Task 3: Gate `WidgetApp` on identity (+ integration tests, + repair existing tests)

The core change. Gate the tree, add login-gate integration tests, and repair the existing
`app.test.tsx` / `mount.test.tsx` assertions that assumed a logged-out user sees the full UI
— all in one commit so the suite stays green.

**Files:**
- Modify: `packages/client/src/app/app.tsx`
- Create: `packages/client/src/app/app.login-gate.test.tsx`
- Rewrite: `packages/client/src/app/app.test.tsx`
- Modify: `packages/client/src/app/mount.test.tsx`

- [ ] **Step 1: Write the failing login-gate integration tests**

Create `packages/client/src/app/app.login-gate.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

const IDENTITY_KEY = 'comments:identity'

// A thread anchored to #t so that, once logged in, the runtime places it and a pin renders.
function clientWithOneThread(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({
      threads: [
        {
          id: 'th1',
          status: 'open',
          anchorState: 'anchored',
          unresolvedCount: 1,
          commentCount: 1,
          createdBy: { email: 'ann@example.com', name: 'Ann' },
          anchor: {
            schemaVersion: 1,
            selectors: ['#t', '#t'],
            signals: {
              tag: 'p',
              classes: ['lead'],
              siblingIndex: 0,
              ancestorTrail: ['main'],
              textSnippet: 'gated target text',
            },
            offset: { fx: 0.5, fy: 0.5 },
          },
        },
      ],
      nextCursor: null,
    })),
    getThread: vi.fn(),
    addComment: vi.fn(),
    createThread: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as unknown as ApiClient
}

function seedPage() {
  document.body.innerHTML = '<main><p id="t" class="lead">gated target text</p></main>'
  mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
}

describe('login gate', () => {
  beforeEach(() => localStorage.clear())

  it('shows only Log In when logged out — no pins, place, panel, or fetch', async () => {
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    expect(await screen.findByTestId('comments-login')).toBeInTheDocument()
    expect(screen.queryByTestId('comments-place')).not.toBeInTheDocument()
    expect(screen.queryByTestId('comments-panel-open')).not.toBeInTheDocument()
    expect(screen.queryByTestId('comments-pin')).not.toBeInTheDocument()
    expect(client.listThreads).not.toHaveBeenCalled()
  })

  it('logging in unlocks the full UI and loads pins', async () => {
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(await screen.findByTestId('comments-login'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'rev@example.com' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /log in/i }))

    expect(await screen.findByTestId('comments-place')).toBeInTheDocument()
    expect(await screen.findByTestId('comments-pin')).toBeInTheDocument()
    expect(localStorage.getItem(IDENTITY_KEY)).toContain('rev@example.com')
  })

  it('boots straight into the full UI when identity is already stored', async () => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: 'known@example.com' }))
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    expect(await screen.findByTestId('comments-place')).toBeInTheDocument()
    expect(screen.queryByTestId('comments-login')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the new tests, verify they fail**

Run: `npx vitest run src/app/app.login-gate.test.tsx`
Expected: FAIL — `comments-login` is never found (WidgetApp still renders the full UI when logged out; there is no LoginLauncher yet).

- [ ] **Step 3: Gate `WidgetApp` on identity**

In `packages/client/src/app/app.tsx`:

Add the import (next to the other `../ui` / component imports):
```tsx
import { LoginLauncher } from '../ui/LoginLauncher'
```

Replace the `<MarkerLayer ... /> <PanelDrawer ... />` block inside `<PanelProvider>` with a
conditional on `identity` (everything else in the return stays the same):

```tsx
            <PanelProvider client={client}>
              {identity ? (
                <>
                  <MarkerLayer
                    client={client}
                    pageKey={pageKey}
                    pageUrl={pageUrl}
                    resolvePageKey={(url) => resolvePageKey(options, url)}
                    identity={identity}
                    onNeedIdentity={onNeedIdentity}
                    provenance={options.provenance}
                  />
                  <PanelDrawer resolvePageKey={(url) => resolvePageKey(options, url)} />
                </>
              ) : (
                <LoginLauncher onLogIn={() => setModalOpen(true)} />
              )}
            </PanelProvider>
```

(The `IdentityModal` below it, the providers around it, and `onSubmitIdentity`/`onNeedIdentity`/
`resumeRef` are unchanged. The lazy `onNeedIdentity` path stays as an inert fallback.)

- [ ] **Step 4: Run the new tests, verify they pass**

Run: `npx vitest run src/app/app.login-gate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Repair `app.test.tsx` (it assumed logged-out = full UI)**

Replace the entire contents of `packages/client/src/app/app.test.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

function mockClient(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(
      async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>,
    ),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as ApiClient
}

// Logged-in state: seed identity so WidgetApp renders the full commenting UI (past the gate).
function login() {
  localStorage.setItem('comments:identity', JSON.stringify({ email: 'known@example.com' }))
}

function clickTarget() {
  const target = document.createElement('p')
  target.id = 'place-target'
  document.body.appendChild(target)
  target.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      x: 0,
      y: 0,
      right: 100,
      bottom: 20,
      toJSON: () => ({}),
    }) as DOMRect
  return target
}

describe('WidgetApp', () => {
  beforeEach(() => localStorage.clear())

  it('creates a comment for a logged-in user without prompting again', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    const target = clickTarget()

    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.click(target, { clientX: 50, clientY: 10 })
    fireEvent.change(await screen.findByPlaceholderText(/add a comment/i), {
      target: { value: 'Looks good' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(client.createThread).toHaveBeenCalledOnce())
    expect(client.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        author: expect.objectContaining({ email: 'known@example.com' }),
        comment: expect.objectContaining({ text: 'Looks good' }),
      }),
    )
    // No identity prompt — the user is already logged in.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    target.remove()
  })

  it('re-lists threads when the SPA route changes the pageKey', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'https://api.test' }} client={client} />)
    await waitFor(() => expect(client.listThreads).toHaveBeenCalledTimes(1))
    history.pushState({}, '', '/another-path')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(client.listThreads.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('renders the launcher with accessible controls when logged in', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    expect(await screen.findByTestId('comments-place')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /resolved/i })).toBeInTheDocument()
  })

  it('renders the Launcher panel button when logged in', () => {
    login()
    render(<WidgetApp options={{ key: 'k', endpoint: 'https://api.test' }} client={mockClient()} />)
    expect(screen.getByTestId('comments-panel-open')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Repair `mount.test.tsx` (logged-out host now shows the Log In button)**

In `packages/client/src/app/mount.test.tsx`, in the second test, replace:

```tsx
    // The place button rendered inside the host.
    expect(host?.querySelector('[data-comments-place]')).not.toBeNull()
```
with:
```tsx
    // The widget rendered its logged-out entry point (the Log In button) inside the host.
    expect(host?.querySelector('[data-testid="comments-login"]')).not.toBeNull()
```

- [ ] **Step 7: Run the full client suite, verify green**

Run (from `packages/client`): `pnpm test`
Expected: all test files pass (includes the new `app.login-gate.test.tsx`, rewritten
`app.test.tsx`, updated `mount.test.tsx`).

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/app/app.tsx \
        packages/client/src/app/app.login-gate.test.tsx \
        packages/client/src/app/app.test.tsx \
        packages/client/src/app/mount.test.tsx
git commit -m "feat(client): gate the commenting UI behind login"
```

---

### Task 4: Update Playwright e2e for up-front login

The e2e flow assumed a logged-out user could place a pin and was prompted on Send. With the
gate, the user must log in first. Update the helpers and the smoke spec.

> **Cannot be run locally** in this worktree (`@playwright/test` isn't installed and the
> suite needs a built widget + `next start`). These edits are validated by the CI `e2e` job.
> Make the edits, do **not** block on a local run.

**Files:**
- Modify: `examples/nextjs-host/e2e/helpers.ts`
- Modify: `examples/nextjs-host/e2e/smoke.spec.ts`

- [ ] **Step 1: Update `activate`, add `login`, drop `ensureIdentity`**

In `examples/nextjs-host/e2e/helpers.ts`:

Change `activate` to prove activation via the logged-out Log In button:
```ts
export async function activate(page: Page, path = '/', ns = '') {
  await page.goto(urlFor(path, { ns, 'comments-key': DEV_KEY }))
  // Logged out: the Log In button proves the widget activated.
  await expect(page.getByTestId('comments-login')).toBeVisible()
}
```

Replace the `ensureIdentity` helper with a `login` helper:
```ts
/** Log in with a self-asserted email so the full commenting UI unlocks. Idempotent: a no-op
 *  if the Log In button isn't showing (already logged in). */
export async function login(page: Page, email = 'reviewer@example.com') {
  const trigger = page.getByTestId('comments-login')
  if (!(await trigger.isVisible().catch(() => false))) return
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await dialog.getByRole('button', { name: 'Log in' }).click()
  // The full launcher proves login completed.
  await expect(page.getByTestId('comments-place')).toBeVisible()
}
```

In `placeElementPin`, remove the identity step (login already happened up front) — delete:
```ts
    // The first submit triggers the identity gate; on submit it resumes and posts.
    await ensureIdentity(page)
```
so the tail reads:
```ts
  await draft.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('comments-pin').first()).toBeVisible()
}
```

In `placeTextSelection`, likewise delete:
```ts
  // The first submit triggers the identity gate; on submit it resumes and posts.
  await ensureIdentity(page)
```

- [ ] **Step 2: Update the smoke spec to log in first**

In `examples/nextjs-host/e2e/smoke.spec.ts`:

Update the import:
```ts
import { activate, login, openThread, placeElementPin } from './helpers'
```
Add a login step immediately after `activate`:
```ts
    await activate(page, '/article', 'smoke')
    await login(page)
```

- [ ] **Step 3: Commit**

```bash
git add examples/nextjs-host/e2e/helpers.ts examples/nextjs-host/e2e/smoke.spec.ts
git commit -m "test(e2e): log in up front before commenting"
```

---

### Task 5: Changeset

**Files:**
- Create: `.changeset/login-gate.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/login-gate.md`:
```md
---
"@airnauts/comments-client": minor
---

Gate the commenting UI behind a "Log in" step. A logged-out reviewer now sees only a Log In
button; placing comments, pins, and the panel appear after entering a name/email up front
(self-asserted, as before — no verification). Identity is remembered, so return visits skip
the prompt.
```

- [ ] **Step 2: Verify the changeset**

Run (from repo root): `pnpm changeset status --verbose`
Expected: `@airnauts/comments-client` bumped **minor**; no errors.

- [ ] **Step 3: Commit**

```bash
git add .changeset/login-gate.md
git commit -m "chore: changeset for login gate"
```

---

### Task 6: Full verification

- [ ] **Step 1: Full client test suite (builds CSS first)**

Run (from `packages/client`): `pnpm test`
Expected: all files pass. Confirm these are green: `app.login-gate.test.tsx`,
`app.test.tsx`, `mount.test.tsx`, `IdentityModal.test.tsx`, `LoginLauncher.test.tsx`,
`react.test.tsx`.

- [ ] **Step 2: Typecheck the client package**

Run (from `packages/client`): `pnpm typecheck`
Expected: exit 0, no output (tsc --build clean).

- [ ] **Step 3: Lint the changed files**

Run (from worktree root):
```bash
npx biome check \
  packages/client/src/ui/LoginLauncher.tsx \
  packages/client/src/ui/LoginLauncher.test.tsx \
  packages/client/src/identity/IdentityModal.tsx \
  packages/client/src/identity/IdentityModal.test.tsx \
  packages/client/src/app/app.tsx \
  packages/client/src/app/app.login-gate.test.tsx \
  packages/client/src/app/app.test.tsx \
  packages/client/src/app/mount.test.tsx
```
Expected: "No fixes applied" / no errors. (If Biome reports import-order, apply its safe fix and re-run.)

- [ ] **Step 4: Note the e2e status in the PR**

The Playwright suite (`examples/nextjs-host`) can't run in this worktree (no
`@playwright/test`, needs a built widget + `next start`). State in the PR description that
e2e changes (Task 4) are validated by the CI `e2e` job.

---

## Self-Review notes

- **Spec coverage:** logged-out-shows-only-Log-In (Task 3 test 1), login-unlocks-and-loads-pins
  (Task 3 test 2), boot-with-stored-identity (Task 3 test 3), LoginLauncher (Task 1), modal
  reframe (Task 2), no-logout/persisted-identity (Task 3 test 3 + design), changeset minor
  (Task 5). All covered.
- **Ripple covered:** `app.test.tsx` (rewritten to log in first), `mount.test.tsx` (asserts
  the Log In button), `IdentityModal.test.tsx` (button copy), e2e helpers/smoke (Task 4).
- **Name consistency:** `data-testid="comments-login"`, `onLogIn`, button name `/log in/i`,
  title "Log in to comment", `localStorage` key `comments:identity` — used identically across
  component, tests, and e2e.
- **Disambiguation:** the login-gate "unlocks" test scopes the modal submit via
  `within(getByRole('dialog'))` because the logged-out launcher button (aria-label "Log in")
  and the modal submit ("Log in") both match `/log in/i`.
