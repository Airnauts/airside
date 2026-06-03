# M10 — Verification & Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the M9 manual smoke checklist as a headless Playwright e2e suite (full v1 loop incl. reload + DOM-mutation re-anchor/orphan), wire it into CI, confirm the bundle budget, and add a tag-triggered npm release workflow.

**Architecture:** A new `examples/nextjs-host/e2e/` Playwright project boots the existing host app via `next start` with a hermetic env (no `MONGODB_URI`/`BLOB_READ_WRITE_TOKEN` → in-memory repo + local-fs uploads). Tests drive the **already-built** widget through user-facing locators (`getByRole`/`getByLabel`/`getByText`) plus the widget's existing `data-testid` hooks — **no widget source changes**. One host-app change adds a server-rendered `?variant=` mutation surface to the article page so reload-time DOM mutation can be exercised. CI gains an `e2e` job; a self-contained `release.yml` publishes on `v*` tags.

**Tech Stack:** Playwright (`@playwright/test`), Next.js 15 App Router (host app), pnpm workspaces + turbo, Changesets, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-06-02-m10-verification-release-design.md`](../specs/2026-06-02-m10-verification-release-design.md)

---

## Key facts the engineer needs (verified against the code)

- **Activation:** open any route with `?comments-key=dev-key`. The widget persists the key to `localStorage` and strips the param (ADR-0018). The host app mounts `<CommentsLayer commentsKey="dev-key" endpoint="/api/comments" features={{ screenshots: true, textAnchors: true }}/>` in `examples/nextjs-host/app/components/comments-mount.tsx`.
- **pageKey ignores query/hash:** `normalizePageKey` returns `${origin}${pathname}` (`packages/core/src/pageKey.ts`). So `/article` and `/article?variant=wrapped` are the **same** page — a thread placed on `/article` loads on the variant. This is what makes the mutation test work.
- **Place flow (`packages/client/src/marker/MarkerLayer.tsx:150-192`):** clicking the place button toggles `placing`. While placing, a capture-phase `click` listener fires; if `window.getSelection()` is **non-collapsed** it captures a **text** anchor (`captureSelection`), otherwise an **element** anchor (`captureElement`) from `elementFromPoint`. A draft popover (`data-testid="comments-draft"`, draft pin `data-testid="comments-draft-pin"`) opens with a `Composer`; submitting creates the thread and renders a real pin (`data-testid="comments-pin"`).
  - **Element anchor** → Playwright `.click()` on the target (selection is collapsed, so it falls to the element branch).
  - **Text anchor** → a **drag-select** via `page.mouse.down/move/up` across the target's bounding box; the `click` fires on mouseup with the selection intact → selection branch. A plain `.click()` would collapse the selection on mousedown and wrongly produce an element anchor.
- **Existing widget `data-testid`s (use, don't add):** `comments-place` (Launcher place button), `comments-pin`, `comments-pin-pulse` (focused), `comments-draft`, `comments-draft-pin`, `comments-panel-open`, `comments-panel`, `comments-panel-row` (+ `data-thread-id`), `comments-panel-loading`, `comments-panel-empty`, `comments-needs-review`, `comments-panel-loadmore`, `comments-highlight`, `comments-detached`, `comments-draft`, `composer-file`, `attachment-spinner`, `comments-skeleton`.
- **User-facing locators for the un-testid'd controls:** identity modal = `getByRole('dialog')`; email = `getByLabel('Email')`; identity submit = `getByRole('button', { name: 'Start commenting' })`; composer textarea = `getByRole('textbox')` (its `aria-label` is the placeholder); send = `getByRole('button', { name: 'Send' })`; resolve/reopen = `getByRole('button', { name: /Resolve|Reopen/ })`; show-resolved = `getByRole('switch')`.
- **Host app package:** name `@airnauts/comments-nextjs-host`, scripts `dev`/`build`/`start` (`examples/nextjs-host/package.json`). It is `private` and in the Changesets `ignore` list.
- **Build→e2e order:** the e2e exercises the **built** widget dist served by `next start`. The Playwright `webServer` builds the host app (and its workspace deps) before starting, so a fresh widget build is always served. In CI, `pnpm build` runs earlier in the job, so the webServer build is a turbo cache hit.

---

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `examples/nextjs-host/app/article/page.tsx` | **Modify** — add server-rendered `?variant=` mutation surface | 2 |
| `examples/nextjs-host/playwright.config.ts` | **Create** — Chromium project + hermetic `webServer` | 3 |
| `examples/nextjs-host/package.json` | **Modify** — `@playwright/test` devDep + `test:e2e` script | 3 |
| `examples/nextjs-host/e2e/fixtures/screenshot.png` | **Create** — tiny PNG for the upload test | 3 |
| `examples/nextjs-host/e2e/helpers.ts` | **Create** — shared `activate()`, `placeElementPin()`, `placeTextSelection()`, locator helpers | 4 |
| `examples/nextjs-host/e2e/smoke.spec.ts` | **Create** — activation + identity + single-page loop (comment→reply→attach→resolve→reopen→reload) | 5 |
| `examples/nextjs-host/e2e/anchoring.spec.ts` | **Create** — reload re-anchor, text-selection highlight, DOM-mutation re-anchor/orphan | 6 |
| `examples/nextjs-host/e2e/panel.spec.ts` | **Create** — cross-page panel navigation + focus + orphan listing | 7 |
| `.github/workflows/ci.yml` | **Modify** — add `e2e` job | 8 |
| `.github/workflows/release.yml` | **Create** — self-contained tag-triggered publish | 9 |
| `RELEASING.md` | **Create** — release runbook | 9 |
| `docs/milestones.md` | **Modify** — M10 → done; add M11 (deferred deploy/adoption) | 10 |
| `docs/adr.md` | **Modify** — ADR for the e2e/release tooling choice | 11 |

---

## Task 1: Scaffold the e2e workspace (Playwright install + config + fixture)

**Files:**
- Modify: `examples/nextjs-host/package.json`
- Create: `examples/nextjs-host/playwright.config.ts`
- Create: `examples/nextjs-host/e2e/fixtures/screenshot.png`
- Create: `examples/nextjs-host/.gitignore` (append Playwright artifacts)

- [ ] **Step 1: Add Playwright as a dev dependency of the host app**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host add -D @playwright/test
```
Expected: `@playwright/test` appears under `devDependencies` in `examples/nextjs-host/package.json`; lockfile updates.

- [ ] **Step 2: Install the Chromium browser binary**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host exec playwright install --with-deps chromium
```
Expected: Chromium downloads (no error). On macOS `--with-deps` is a no-op; that's fine.

- [ ] **Step 3: Add the `test:e2e` script**

In `examples/nextjs-host/package.json`, add to `scripts`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write the Playwright config**

Create `examples/nextjs-host/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // in-memory repo is a single shared store; keep tests serial
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build the host app (+ workspace deps) via turbo, then serve the production build.
    // Force the hermetic fallbacks regardless of any local .env.local.
    command:
      `pnpm --dir ../.. turbo run build --filter=@airnauts/comments-nextjs-host... && ` +
      `pnpm --filter @airnauts/comments-nextjs-host exec next start -p ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { MONGODB_URI: '', BLOB_READ_WRITE_TOKEN: '', PORT: String(PORT) },
  },
})
```
Note: `MONGODB_URI: ''` is falsy, so `route.ts` selects `memoryRepository()`; `BLOB_READ_WRITE_TOKEN: ''` selects `fileSystemStorage`. Port 3100 avoids colliding with a dev server on 3000. The host app's `allowedOrigins` includes only `:3000` — see Step 6.

- [ ] **Step 5: Create the upload fixture (a tiny valid PNG)**

Run (generates a 1×1 PNG without needing image tooling):
```bash
mkdir -p examples/nextjs-host/e2e/fixtures && \
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\x0a-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' \
> examples/nextjs-host/e2e/fixtures/screenshot.png && \
file examples/nextjs-host/e2e/fixtures/screenshot.png
```
Expected: `screenshot.png: PNG image data, 1 x 1 ...`.

- [ ] **Step 6: Allow the e2e origin in the host app**

The widget's API calls are same-origin to `http://localhost:3100`, but `createCommentsRoute`'s `allowedOrigins` (in `examples/nextjs-host/app/api/comments/[...path]/route.ts`) lists only `:3000`. Same-origin browser GETs omit `Origin` (allowed by ADR-0017), but mutations (POST/PATCH) send `Origin: http://localhost:3100` and would 403. Add the e2e origin:
```ts
allowedOrigins: [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
],
```

- [ ] **Step 7: Ignore Playwright artifacts**

Append to `examples/nextjs-host/.gitignore`:
```
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 8: Verify Playwright is wired (no tests yet)**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host exec playwright test --list
```
Expected: exits 0 with "Total: 0 tests" (or "No tests found") — config loads without error.

- [ ] **Step 9: Commit**

```bash
git add examples/nextjs-host/package.json examples/nextjs-host/playwright.config.ts \
  examples/nextjs-host/e2e/fixtures/screenshot.png examples/nextjs-host/.gitignore \
  examples/nextjs-host/app/api/comments/'[...path]'/route.ts pnpm-lock.yaml
git commit -m "test(e2e): scaffold Playwright for nextjs-host (chromium, hermetic webServer)"
```

---

## Task 2: Add the `?variant=` mutation surface to the article page

**Files:**
- Modify: `examples/nextjs-host/app/article/page.tsx`

The mutation test anchors an **element pin** on a plain `<li>` (a list item with no `id`/`data-testid`, so re-match exercises real structural+quote scoring rather than a stable-attribute shortcut). Variants mutate the DOM around/including it.

- [ ] **Step 1: Rewrite the article page to render variants from `searchParams` (Next 15 async)**

Replace `examples/nextjs-host/app/article/page.tsx` with:
```tsx
import { SiteNav } from '../components/site-nav'

// Test-support only (M10 e2e): ?variant mutates the DOM at render time so a reload can
// exercise re-anchor (reordered/renamed/wrapped) and orphan (removed). Not a product feature.
type Variant = 'reordered' | 'renamed' | 'wrapped' | 'removed'
const VARIANTS: Variant[] = ['reordered', 'renamed', 'wrapped', 'removed']

function asVariant(v: string | string[] | undefined): Variant | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return VARIANTS.includes(s as Variant) ? (s as Variant) : undefined
}

const ITEMS = [
  'Structural selectors locate likely candidates quickly.',
  'Content signals (tag, text, attributes) disambiguate near-matches.',
  'A quote with prefix and suffix re-finds selected text after edits.',
]

export default async function ArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[] }>
}) {
  const variant = asVariant((await searchParams).variant)

  // The mutation anchor target is the SECOND list item. Build the <ul> per variant.
  const items = variant === 'reordered' ? [...ITEMS].reverse() : ITEMS
  const list = (
    <ul className={variant === 'renamed' ? 'mutated-list' : undefined}>
      {items.map((text) =>
        variant === 'removed' && text === ITEMS[1] ? null : <li key={text}>{text}</li>,
      )}
    </ul>
  )

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.6 }}>
      <SiteNav />
      <article>
        <h1>Designing for durable anchors</h1>
        <p>
          An anchor is a promise: this comment belongs <em>here</em>, and it should still belong
          here after the page changes. Honoring that promise is the whole game.
        </p>
        <h2>{variant === 'renamed' ? 'Selectors alone fall short' : 'Selectors are not enough'}</h2>
        <p>
          A CSS selector breaks the moment a wrapper appears or a class is renamed. Durable
          anchoring blends structural selectors with content signals and a quote of the surrounding
          text, then scores candidates when the fast path misses.
        </p>
        {variant === 'wrapped' ? <div className="extra-wrapper">{list}</div> : list}
        <h2>When to orphan</h2>
        <p>
          If nothing scores above threshold, the anchor is orphaned rather than placed wrongly. A
          confidently wrong pin is worse than an honest &quot;needs review.&quot;
        </p>
      </article>
    </main>
  )
}
```
Notes: `reordered` reverses sibling order; `renamed` changes a nearby `<h2>`'s text and adds a class to the `<ul>` (attribute mutation); `wrapped` adds an enclosing `<div>`; `removed` drops the anchored 2nd `<li>` (→ orphan). The default (no variant) renders the original DOM used for capture.

- [ ] **Step 2: Verify the host app still builds with the async page**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host build
```
Expected: build succeeds (Next 15 accepts `searchParams: Promise<…>`).

- [ ] **Step 3: Manually eyeball each variant (optional sanity, no assertion yet)**

Run `pnpm --filter @airnauts/comments-nextjs-host dev` and open `/article`, `/article?variant=reordered`, `?variant=renamed`, `?variant=wrapped`, `?variant=removed`. Confirm the list reorders / heading renames / wrapper appears / 2nd item disappears. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add examples/nextjs-host/app/article/page.tsx
git commit -m "examples(nextjs-host): add ?variant DOM-mutation surface to article (e2e test-support)"
```

---

## Task 3: Write the shared e2e helpers

**Files:**
- Create: `examples/nextjs-host/e2e/helpers.ts`

These encapsulate activation, identity, and the two anchor-placement gestures so each spec stays readable.

- [ ] **Step 1: Write the helpers**

Create `examples/nextjs-host/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test'

export const KEY_PARAM = 'comments-key=dev-key'

/** Open a route with the activation key and wait for the widget to mount. */
export async function activate(page: Page, path = '/') {
  const sep = path.includes('?') ? '&' : '?'
  await page.goto(`${path}${sep}${KEY_PARAM}`)
  // Launcher place button proves the widget activated.
  await expect(page.getByTestId('comments-place')).toBeVisible()
}

/** Fill the self-asserted email identity modal if it is showing. Idempotent. */
export async function ensureIdentity(page: Page, email = 'reviewer@example.com') {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Start commenting' }).click()
    await expect(dialog).toBeHidden()
  }
}

/** Enter place mode, click an element target, fill the draft composer, submit. */
export async function placeElementPin(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  await page.getByText(targetText, { exact: false }).first().click()
  await ensureIdentity(page) // identity modal can interrupt the first draft
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('comments-pin').first()).toBeVisible()
}

/** Enter place mode, DRAG-select text within an element, then the place click fires
 *  on mouseup with the selection intact → text (selection) anchor. */
export async function placeTextSelection(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  const el = page.getByText(targetText, { exact: false }).first()
  const box = await el.boundingBox()
  if (!box) throw new Error(`no bounding box for "${targetText}"`)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 4, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 4, y, { steps: 12 })
  await page.mouse.up()
  await ensureIdentity(page)
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
}

/** Open the thread popover by clicking its pin. */
export async function openThread(page: Page) {
  await page.getByTestId('comments-pin').first().click()
}
```
Note: `ensureIdentity` is called after the first place gesture because the identity modal opens on the first attempt to comment (not at activation). It is idempotent for later tests in the same context (identity is remembered in `localStorage`).

- [ ] **Step 2: Typecheck the helpers (compiles under the host app tsconfig)**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host exec tsc --noEmit -p tsconfig.json
```
Expected: no type errors. (If the host app's tsconfig excludes `e2e/`, this is a no-op for these files — that's acceptable; Playwright type-checks at run time.)

- [ ] **Step 3: Commit**

```bash
git add examples/nextjs-host/e2e/helpers.ts
git commit -m "test(e2e): shared helpers — activate, identity, element/text placement"
```

---

## Task 4: Single-page loop spec (place → comment → reply → attach → resolve → reopen → reload)

**Files:**
- Create: `examples/nextjs-host/e2e/smoke.spec.ts`

Covers the M5 activation+identity and M7 commenting-loop exit criteria.

- [ ] **Step 1: Write the failing spec**

Create `examples/nextjs-host/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { activate, openThread, placeElementPin } from './helpers'
import path from 'node:path'

test.describe('single-page commenting loop', () => {
  test('activate, identity, comment, reply, attach, resolve, reopen, reload', async ({ page }) => {
    await activate(page, '/article')

    // Place an element pin + first comment (identity modal handled inside).
    await placeElementPin(page, 'Content signals', 'First comment on the list item')
    await expect(page.getByTestId('comments-pin')).toHaveCount(1)

    // Open the thread and reply.
    await openThread(page)
    await expect(page.getByText('First comment on the list item')).toBeVisible()
    const replyBox = page.getByRole('textbox')
    await replyBox.fill('A reply to the first comment')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('A reply to the first comment')).toBeVisible()

    // Attach a screenshot via the hidden file input, assert the attachment renders.
    await page.getByTestId('composer-file').setInputFiles(
      path.join(__dirname, 'fixtures', 'screenshot.png'),
    )
    // Upload spinner appears then resolves to an attachment element.
    await expect(page.getByTestId('attachment-spinner')).toHaveCount(0, { timeout: 15_000 })
    const attachment = page.locator('[data-testid^="attachment"], img[src*="/uploads/"]').first()
    await expect(attachment).toBeVisible()

    // Resolve → reopen.
    await page.getByRole('button', { name: /Resolve/ }).click()
    await expect(page.getByRole('button', { name: /Reopen/ })).toBeVisible()
    await page.getByRole('button', { name: /Reopen/ }).click()
    await expect(page.getByRole('button', { name: /Resolve/ })).toBeVisible()

    // Reload: the pin re-anchors and the comment persists.
    await page.reload()
    await expect(page.getByTestId('comments-pin')).toHaveCount(1)
    await openThread(page)
    await expect(page.getByText('First comment on the list item')).toBeVisible()
    await expect(page.getByText('A reply to the first comment')).toBeVisible()
  })
})
```
Note on the attachment assertion: we assert the attachment **element** is present and survives — not that the PNG bytes 200 from `/uploads/` (runtime-written `public/` files aren't guaranteed to be served by `next start`; the upload record + UI is the behavior under test). The `img[src*="/uploads/"]` half of the OR matches the rendered attachment even if the byte fetch is broken.

- [ ] **Step 2: Run the spec — expect it to drive the full loop and pass**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host test:e2e -- smoke.spec.ts
```
Expected: the webServer builds + starts, the test passes. **If it fails, debug with `--headed --debug` and the trace** (`playwright-report/`). Likely first-run issues to check: (a) the identity modal selector/text matches the real modal; (b) the composer `getByRole('textbox')` resolves to exactly one element when the draft is open; (c) the reply composer is the active textbox after `openThread`. Adjust the helpers/locators (not the widget) until green.

- [ ] **Step 3: Commit**

```bash
git add examples/nextjs-host/e2e/smoke.spec.ts
git commit -m "test(e2e): single-page loop — comment, reply, attach, resolve, reopen, reload"
```

---

## Task 5: Anchoring spec (reload re-anchor, text-selection highlight, DOM-mutation re-anchor/orphan)

**Files:**
- Create: `examples/nextjs-host/e2e/anchoring.spec.ts`

Covers the M6 anchoring exit criteria — the riskiest behavior and the reason this milestone exists.

- [ ] **Step 1: Write the text-selection re-anchor test**

Create `examples/nextjs-host/e2e/anchoring.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { activate, placeTextSelection } from './helpers'

test.describe('anchoring', () => {
  test('text selection: highlight renders and re-renders after reload', async ({ page }) => {
    await activate(page, '/article')
    await placeTextSelection(page, 'Honoring that promise is the whole game', 'Comment on a quote')
    // A selection anchor renders a highlight rect.
    await expect(page.getByTestId('comments-highlight').first()).toBeVisible()

    await page.reload()
    // Highlight re-renders against the unchanged DOM.
    await expect(page.getByTestId('comments-highlight').first()).toBeVisible()
  })
```

- [ ] **Step 2: Add the DOM-mutation re-anchor cases (reorder / rename / wrap → pin survives)**

Append inside the `describe`:
```ts
  for (const variant of ['reordered', 'renamed', 'wrapped'] as const) {
    test(`element pin re-anchors after ?variant=${variant}`, async ({ page }) => {
      await activate(page, '/article')
      await placeElementPin(page, 'Content signals', `pin for ${variant}`)
      await expect(page.getByTestId('comments-pin')).toHaveCount(1)

      // Reload the mutated variant; same pageKey (query is stripped), so the thread loads
      // and must re-anchor against the mutated DOM.
      await page.goto(`/article?variant=${variant}`)
      await expect(page.getByTestId('comments-place')).toBeVisible() // widget active via localStorage
      await expect(page.getByTestId('comments-pin')).toHaveCount(1)
      await expect(page.getByTestId('comments-detached')).toHaveCount(0)
    })
  }
```
Add the `placeElementPin` import:
```ts
import { activate, placeElementPin, placeTextSelection } from './helpers'
```

- [ ] **Step 3: Add the orphan case (remove → detached / needs-review)**

Append inside the `describe`, then close it:
```ts
  test('element pin orphans after ?variant=removed', async ({ page }) => {
    await activate(page, '/article')
    await placeElementPin(page, 'Content signals', 'pin that will orphan')
    await expect(page.getByTestId('comments-pin')).toHaveCount(1)

    await page.goto('/article?variant=removed')
    await expect(page.getByTestId('comments-place')).toBeVisible()
    // The anchored <li> is gone → no positioned pin; the thread surfaces as detached
    // and/or in the panel's needs-review section.
    await expect(page.getByTestId('comments-pin')).toHaveCount(0)
    const detached = page.getByTestId('comments-detached')
    await page.getByTestId('comments-panel-open').click()
    const needsReview = page.getByTestId('comments-needs-review')
    await expect(detached.or(needsReview).first()).toBeVisible()
  })
})
```

- [ ] **Step 4: Run the anchoring spec**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host test:e2e -- anchoring.spec.ts
```
Expected: all cases pass. **Debug notes:** the in-memory store is shared across tests in one run; each test places its own pin, but threads from prior tests on `/article` persist in the store and will also load. If a test sees more than one pin, scope assertions to the thread it created (assert `>= 1` re-anchored and `0` detached for that thread by body text) instead of exact `toHaveCount(1)`. Prefer making the store fresh per test (Task 7 adds an isolation note) if cross-test bleed causes flake.

- [ ] **Step 5: Commit**

```bash
git add examples/nextjs-host/e2e/anchoring.spec.ts
git commit -m "test(e2e): anchoring — text highlight, DOM-mutation re-anchor + orphan"
```

---

## Task 6: Cross-page panel spec (navigate + focus + orphan listing)

**Files:**
- Create: `examples/nextjs-host/e2e/panel.spec.ts`

Covers the M8 panel exit criteria.

- [ ] **Step 1: Write the panel navigation + focus test**

Create `examples/nextjs-host/e2e/panel.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { activate, placeElementPin } from './helpers'

test.describe('cross-page panel', () => {
  test('lists threads across pages; selecting one navigates and focuses its pin', async ({ page }) => {
    // Thread on the pricing page.
    await activate(page, '/pricing')
    await placeElementPin(page, 'Starter', 'Comment on the Starter plan')

    // Thread on the article page.
    await activate(page, '/article')
    await placeElementPin(page, 'Content signals', 'Comment on the article')

    // Open the panel; both threads are listed.
    await page.getByTestId('comments-panel-open').click()
    await expect(page.getByTestId('comments-panel')).toBeVisible()
    const rows = page.getByTestId('comments-panel-row')
    await expect(rows).toHaveCount(2)

    // Select the pricing thread → navigates to /pricing and focuses the pin.
    const pricingRow = rows.filter({ hasText: 'Starter' }).first()
    await pricingRow.click()
    await expect(page).toHaveURL(/\/pricing/)
    // The focused pin renders its pulse element.
    await expect(page.getByTestId('comments-pin-pulse')).toBeVisible()
  })
})
```
Note: `PanelRow` text comes from the thread body/page; `filter({ hasText })` targets the right row. If the panel row shows page URL rather than body text, change the filter to `hasText: '/pricing'`.

- [ ] **Step 2: Run the panel spec**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host test:e2e -- panel.spec.ts
```
Expected: pass. If `toHaveCount(2)` is flaky due to store bleed from other spec files, run this file in isolation (Playwright runs files serially with `workers: 1`) or assert `>= 2` and filter to the rows under test.

- [ ] **Step 3: Run the FULL e2e suite to confirm all specs pass together**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host test:e2e
```
Expected: all specs green. Resolve any cross-test store-bleed flake now (scope assertions to created threads, or document that the suite assumes a fresh server per `test:e2e` invocation — which CI provides).

- [ ] **Step 4: Commit**

```bash
git add examples/nextjs-host/e2e/panel.spec.ts
git commit -m "test(e2e): cross-page panel — list, navigate, focus pin"
```

---

## Task 7: Add the `e2e` job to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add an `e2e` job after the existing `ci` job**

Append to `.github/workflows/ci.yml` (a second job; keep the existing `ci` job unchanged):
```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.17.0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Install Playwright Chromium
        run: pnpm --filter @airnauts/comments-nextjs-host exec playwright install --with-deps chromium

      - name: Run e2e
        run: pnpm --filter @airnauts/comments-nextjs-host test:e2e

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: examples/nextjs-host/playwright-report/
          retention-days: 7
```
Note: this job runs `pnpm build` so the webServer's turbo build is a cache hit and the in-memory/local-uploads fallback is used (no `MONGODB_URI`/`BLOB_READ_WRITE_TOKEN` in the job env). The bundle-size budget stays in the existing `ci` job's `pnpm size` step (confirm-only, 300 kB — unchanged).

- [ ] **Step 2: Validate the workflow YAML locally**

Run:
```bash
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); require('child_process').execSync('python3 -c \"import sys,yaml,io; yaml.safe_load(open(\'.github/workflows/ci.yml\'))\"'); console.log('yaml ok')" 2>/dev/null || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add headless Playwright e2e job (chromium, hermetic)"
```

---

## Task 8: Self-contained release workflow + runbook

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `RELEASING.md`

- [ ] **Step 1: Write the release workflow**

Create `.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # npm provenance (optional but recommended)
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.17.0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Gate (lint, typecheck, build, test)
        run: pnpm lint && pnpm typecheck && pnpm build && pnpm test

      - name: Publish to npm
        run: pnpm exec changeset publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```
Note: self-contained because tag pushes never trigger `ci.yml`. `changeset publish` publishes only packages whose `package.json` version is not already on the registry; examples + `test-support` are in the Changesets `ignore` list.

- [ ] **Step 2: Write the release runbook**

Create `RELEASING.md`:
```markdown
# Releasing `@airnauts/comments-*`

Packages are published to npm by `.github/workflows/release.yml`, triggered by pushing
a `v*` tag. Versioning is managed by Changesets.

## Prerequisite (one-time)

Add an `NPM_TOKEN` Actions secret (org or repo) with **publish** rights to the
`@airnauts` scope: repo → Settings → Secrets and variables → Actions → New secret.

## Cutting a release

1. Ensure `main` is green and all intended changesets are merged.
2. Bump versions + changelogs from the pending changesets:
   ```bash
   pnpm version-packages   # = changeset version
   ```
   For the **first release**, all 8 public packages go `0.0.0 → 0.1.0` (two pending
   `minor` changesets: `initial-release` + `uniform-adapter-construction`).
3. Commit the version bump:
   ```bash
   git add -A && git commit -m "chore(release): vX.Y.Z"
   ```
4. Tag and push:
   ```bash
   git tag vX.Y.Z      # match the bumped version, e.g. v0.1.0
   git push && git push --tags
   ```
5. The `Release` workflow runs the gates and `changeset publish`, publishing the 8
   public packages. Verify on npm: `npm view @airnauts/comments-core version`.

## Public packages (8)

`core`, `client`, `server`, `next`, `adapter-memory`, `adapter-mongo`, `storage-fs`,
`storage-vercel-blob`. The examples and `test-support` are private / Changesets-ignored.
```

- [ ] **Step 3: Validate the release YAML**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml RELEASING.md
git commit -m "ci: tag-triggered npm release workflow + RELEASING runbook"
```

---

## Task 9: Update milestones (M10 → done; add M11) and ADR

**Files:**
- Modify: `docs/milestones.md`
- Modify: `docs/adr.md`

- [ ] **Step 1: Mark M10 delivered and link the spec/plan**

In `docs/milestones.md`, update the M10 section: change its scope line to reflect the slimmed delivery (verification + release; deploy/adoption → M11), and add a **Refs** line linking this spec and plan (mirror how M8/M9 cite their design + plan). Update the dependency graph footer to show `M11` after `M10`.

- [ ] **Step 2: Add the M11 milestone (the deferred tail)**

Append a new section after M10 in `docs/milestones.md`:
```markdown
## M11 — Dogfood deployment & real-project adoption  ·  Integration  ·  M

**Goal.** Meet PRD §7's adoption bar in production: a live deployment and real use.

**In scope.** A **Vercel + MongoDB Atlas + Vercel Blob** dogfood deployment of
`examples/nextjs-host` (or a thin equivalent); the published `@airnauts/comments-*`
packages consumed from npm (not workspace); **integration into at least one real
project** in place of Vercel Comments; capture time-to-integrate and re-anchor
reliability across repeated redeploys.

**Out of scope.** New features, schemas, or endpoints.

**Depends on.** M10 (e2e green + packages publishable).

**Exit criteria (PRD §7).** Time-to-integrate measured in minutes; comments reliably
re-anchor across repeated redeploys (the dogfood project); our team adopts it on at
least one real project in place of Vercel Comments.

**Refs.** PRD §7; Spec §9.
```

- [ ] **Step 3: Add an ADR for the verification + release tooling**

In `docs/adr.md`, append a new record (next number in sequence, status accepted, today's date) capturing: **Playwright (Chromium-only, hermetic in-memory host app) for e2e**, **tag-triggered Changesets publish** for releases, and the decision to **drive the widget via user-facing locators + existing testids (no new widget test hooks)**. Context: M10 needed automated verification + a publish path; forces were CI hermeticity, honoring the "no package-code" scope, and manual release control. Consequences: cross-browser + Mongo-backed e2e and the live dogfood deploy are deferred to M11; releases require a manual version+tag step (no auto Version PR). Follow the existing ADR format (Title/Date/Status/Context/Decision/Consequences); do not edit prior records.

- [ ] **Step 4: Commit**

```bash
git add docs/milestones.md docs/adr.md
git commit -m "docs(M10): mark verification+release delivered; add M11 (deploy/adoption); ADR"
```

---

## Task 10: Full green sweep + finish

**Files:** none (verification + integration)

- [ ] **Step 1: Run the complete local pipeline (mirrors CI)**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm size && pnpm check:exports
```
Expected: all green. (`pnpm size` confirms the client bundle under 300 kB.)

- [ ] **Step 2: Run the full e2e suite once more from a clean state**

Run:
```bash
pnpm --filter @airnauts/comments-nextjs-host test:e2e
```
Expected: all specs pass headless.

- [ ] **Step 3: Confirm no widget source changed (scope check)**

Run:
```bash
git diff --name-only main...HEAD -- packages/client/src packages/core/src packages/server/src
```
Expected: **empty** — M10 added no package source changes (only the host app variant, e2e, CI, docs). If non-empty, reconcile against the spec's "no package-code" scope or update the spec.

- [ ] **Step 4: Finish the development branch**

Use the `superpowers:finishing-a-development-branch` skill to merge `m10-verification-spec` into `main` (this repo develops on `main` until beta, per CLAUDE.md). Before merging, `git merge --ff-only main` is not needed (the worktree already merged origin/main); resolve any drift, then fast-forward `main` to this branch or merge with a message.

---

## Self-review notes (author)

- **Spec coverage:** §1 e2e suite → Tasks 1,3,4,5,6; §2 variants → Task 2; §3 CI + confirm-only size → Task 7 (size stays in existing `ci` job); §4 release + runbook → Task 8; exit-criteria M11 addition → Task 9. All spec sections map to a task.
- **No widget testids added** — locators are user-facing + existing testids only (Task 10 Step 3 enforces this), keeping the spec's "no package-code" scope honest.
- **Mutation target is a plain `<li>`** (no id/testid) so re-match exercises real scoring.
- **Release is self-contained** (Task 8) — it re-runs gates because tag pushes don't trigger `ci.yml`.
- **Upload assertion** targets the attachment element's presence/persistence, not served bytes.
- **Known flake risk:** the in-memory store is shared across tests within one `test:e2e` run (`workers: 1`, serial). Tasks 5–6 call out scoping assertions to created threads if cross-test bleed appears; CI starts a fresh server per run.
