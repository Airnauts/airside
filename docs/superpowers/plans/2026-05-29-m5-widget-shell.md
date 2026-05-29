# M5 — Widget Shell, Isolation & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount an isolated, key-gated, identity-aware widget on any page that round-trips a placeholder marker (create + read a thread) against a live in-memory API — the runtime skeleton M6/M7/M8 build on.

**Architecture:** `@comments/client` gains a vanilla `comments.init()` entry that gates on a URL key, mounts a light-DOM host root, injects precompiled Tailwind CSS, and renders a React tree (error boundary → portal/toast providers → identity modal + placeholder marker layer) using its **own bundled React**. A thin `@comments/client/react` `<CommentsLayer/>` wrapper uses the **host's** React (peer). A typed API client (types from `@comments/core`) talks the M2a contract; create-thread is optimistic with rollback.

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`), React 19, `@radix-ui/react-dialog`, Tailwind v4 (`@tailwindcss/cli`), tsup (two configs), Vitest + jsdom + @testing-library/react, the M3 in-memory dev server (`@comments/server/dev`).

---

## Conventions & gotchas (read once before starting)

- **`verbatimModuleSyntax: true`** (from `tsconfig.base.json`): every type-only import/export MUST use `import type` / `export type`. Mixed value+type imports must split the type out.
- **`noUncheckedIndexedAccess: true`**: indexing arrays yields `T | undefined`. Prefer `.map`/`.find`; guard index access.
- **Client testing is NOT strict TDD** (architecture §9, CLAUDE.md): pure modules (gate, config, identity, api client, stub-anchor) are written test-first; React components and build/tooling steps are implemented then covered by RTL/run-checks. Every task still ends green with a run command.
- **Tailwind prefix `cmnt:`**: our compiled stylesheet is injected into the host's **light DOM**, so unprefixed utilities would style the host page. Every Tailwind utility class in widget source is written `cmnt:<utility>` (e.g. `cmnt:rounded-full`). **Functional layout uses inline `style={}`** (deterministic in jsdom); Tailwind classes are used sparingly to exercise + prove the pipeline.
- **Dev server has NO base path**: `@comments/server`'s router matches operation paths directly (`/threads`). So the API client `endpoint` for the playground/test is the server root (e.g. `http://127.0.0.1:4321`), and the client appends `/threads`. (A real Next.js mount at `/api/comments` is M4's concern; the client simply appends operation paths to whatever `endpoint` it's given.)
- **`checkOrigin` throws if the `Origin` header is missing.** Browsers send it automatically; node `fetch` does not. The API client exposes an optional `fetch` seam so the round-trip test can inject `Origin`.
- **Run a single client test** with: `pnpm --filter @comments/client exec vitest run src/<path>`. The `test` script runs `build:css` first so the generated CSS module exists.
- Work happens in `packages/client/` unless a path says otherwise. Commit after every task.

---

## File structure (what gets created)

```
packages/client/
  package.json                      # MODIFY: deps + build/test scripts
  tsconfig.json                     # MODIFY: jsx, exclude *.test.tsx
  tsup.config.ts                    # MODIFY: two configs (widget bundles React; wrapper externals it)
  vitest.config.ts                  # MODIFY: plugin-react + setupFiles
  scripts/build-css.mjs             # CREATE: Tailwind CLI -> inlined generated .ts
  src/
    test-setup.ts                   # CREATE: jsdom shims, jest-dom, RTL cleanup
    index.ts                        # MODIFY: comments.init() shell (keeps anchor exports)
    react.ts                        # MODIFY: <CommentsLayer/> wrapper (peer React)
    config.ts                       # CREATE: InitOptions, pageKey, captureContext
    gate.ts                         # CREATE: isActivated()
    lib/cn.ts                       # CREATE: className helper
    identity/
      storage.ts                    # CREATE: load/save identity
      IdentityModal.tsx             # CREATE: Radix Dialog email modal
    api/
      errors.ts                     # CREATE: ApiError
      client.ts                     # CREATE: createApiClient (7 typed methods)
    marker/
      stub-anchor.ts                # CREATE: schema-valid placeholder anchor
      MarkerLayer.tsx               # CREATE: placeholder pin + optimistic create
    ui/
      toast.tsx                     # CREATE: minimal in-host toast
    error-boundary.tsx              # CREATE: WidgetErrorBoundary
    app/
      providers.tsx                 # CREATE: portal + toasts container context
      app.tsx                       # CREATE: WidgetApp (composition + identity flow)
      mount.tsx                     # CREATE: host root + CSS + React root + teardown
      widget.css                    # CREATE: Tailwind v4 entry (no-preflight + prefix)
      widget-css.generated.ts       # GENERATED (git-ignored) by build:css
examples/playground/                # CREATE: throwaway Vite demo + dev-server boot
pnpm-workspace.yaml                 # MODIFY: enable examples/*
.gitignore                          # MODIFY: ignore widget-css.generated.ts
docs/adr.md                         # MODIFY: append ADR-0014
docs/milestones.md                  # MODIFY: add design-spec ref to M5
```

---

## Task 1: Client dependencies, tsconfig JSX, gitignore

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add dependencies and scripts to `packages/client/package.json`**

Replace the `scripts`, `dependencies`, and `devDependencies` blocks (keep `name`, `version`, `private`, `type`, `exports`, `files`, `size-limit` as-is):

```jsonc
  "scripts": {
    "build:css": "node scripts/build-css.mjs",
    "build": "pnpm build:css && tsup && tsc --build",
    "typecheck": "tsc --build",
    "test": "pnpm build:css && vitest run",
    "size": "size-limit"
  },
  "dependencies": {
    "@comments/core": "workspace:*",
    "@radix-ui/react-dialog": "^1.1.6",
    "clsx": "^2.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@size-limit/preset-small-lib": "^11.1.6",
    "@tailwindcss/cli": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^26.0.0",
    "size-limit": "^11.1.6",
    "tailwindcss": "^4.0.0"
  }
```

> Note: `react`/`react-dom` live in `dependencies` because the vanilla widget **bundles** them. The `@comments/client/react` wrapper treats them as the host's React via tsup `external` (Task 18). A formal `peerDependencies` split is a publish-time concern (deferred); for this private workspace, deps-only is correct and avoids pnpm peer churn.

- [ ] **Step 2: Add JSX + test-file exclusion to `packages/client/tsconfig.json`**

Add `"jsx": "react-jsx"` to `compilerOptions` and add `"src/**/*.test.tsx"` to `exclude`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts", "src/**/*.test.tsx"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Ignore the generated CSS module in `.gitignore`**

Append under the "Build tooling" section:

```gitignore
# M5 widget: precompiled Tailwind inlined as a TS string module
packages/client/src/app/widget-css.generated.ts
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: completes; resolves `react`, `@radix-ui/react-dialog`, `tailwindcss`, etc.

- [ ] **Step 5: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json .gitignore pnpm-lock.yaml
git commit -m "M5: client deps (React, Radix, Tailwind, RTL) + JSX tsconfig"
```

---

## Task 2: Vitest + React Testing Library setup

**Files:**
- Modify: `packages/client/vitest.config.ts`
- Create: `packages/client/src/test-setup.ts`
- Test: `packages/client/src/setup-smoke.test.tsx`

- [ ] **Step 1: Configure vitest with the React plugin and setup file**

`packages/client/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'client',
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 2: Write the test setup (jsdom shims, matchers, cleanup)**

`packages/client/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom is missing a few APIs Radix touches.
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const) {
  if (!(method in Element.prototype)) {
    ;(Element.prototype as unknown as Record<string, () => void>)[method] = () => {}
  }
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      },
    }) as unknown as MediaQueryList
}
```

- [ ] **Step 3: Write a smoke test that proves JSX + RTL render works**

`packages/client/src/setup-smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('renders JSX and finds it via RTL', () => {
    render(<div>hello m5</div>)
    expect(screen.getByText('hello m5')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm --filter @comments/client exec vitest run src/setup-smoke.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/client/vitest.config.ts packages/client/src/test-setup.ts packages/client/src/setup-smoke.test.tsx
git commit -m "M5: vitest + RTL setup (jsdom shims, jest-dom, cleanup)"
```

---

## Task 3: Tailwind CSS pipeline (precompile → inlined .ts)

**Files:**
- Create: `packages/client/src/app/widget.css`
- Create: `packages/client/scripts/build-css.mjs`

- [ ] **Step 1: Write the Tailwind entry (no preflight + `cmnt` prefix)**

`packages/client/src/app/widget.css`:

```css
/* Tailwind v4 entry for the widget.
   - Preflight (base reset) is intentionally NOT imported: we live in the host's
     light DOM and must not reset host elements.
   - prefix(cmnt) namespaces every utility (cmnt:flex) and variable (--cmnt-*) so
     our injected stylesheet cannot style the host page. */
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme) prefix(cmnt);
@import "tailwindcss/utilities.css" layer(utilities) prefix(cmnt);

/* Scan widget source (relative to this file = src/app) for prefixed classes. */
@source "../**/*.{ts,tsx}";
```

- [ ] **Step 2: Write the build script (compile, then inline as a string module)**

`packages/client/scripts/build-css.mjs`:

```js
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SRC = 'src/app/widget.css'
const OUT_TS = 'src/app/widget-css.generated.ts'

const tmp = mkdtempSync(join(tmpdir(), 'cmnt-css-'))
const outCss = join(tmp, 'widget.compiled.css')

try {
  // @tailwindcss/cli exposes the `tailwindcss` binary.
  execFileSync('pnpm', ['exec', 'tailwindcss', '-i', SRC, '-o', outCss, '--minify'], {
    stdio: 'inherit',
  })
  const css = readFileSync(outCss, 'utf8')
  const banner = '// AUTO-GENERATED by scripts/build-css.mjs — do not edit. Run `pnpm build:css`.\n'
  writeFileSync(OUT_TS, `${banner}export const widgetCss = ${JSON.stringify(css)}\n`)
  console.log(`[build-css] wrote ${OUT_TS} (${css.length} bytes of CSS)`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
```

- [ ] **Step 3: Run the build and inspect the output**

Run: `pnpm --filter @comments/client build:css`
Expected: prints `[build-css] wrote src/app/widget-css.generated.ts (... bytes of CSS)`; the file exists and starts with the banner + `export const widgetCss = "..."`.

> If the CSS is suspiciously tiny / empty, content scanning failed — confirm the `@source` line in `widget.css`. (At this point no `cmnt:` classes exist in source yet, so a small theme-only output is expected; later tasks add classes that expand it.)

- [ ] **Step 4: Commit (script + entry only — generated file is git-ignored)**

```bash
git add packages/client/src/app/widget.css packages/client/scripts/build-css.mjs
git commit -m "M5: Tailwind v4 pipeline — precompile to inlined .ts (no preflight, cmnt prefix)"
```

---

## Task 4: `config.ts` — init options, pageKey, capture context

**Files:**
- Create: `packages/client/src/config.ts`
- Test: `packages/client/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCaptureContext, DEFAULT_KEY_PARAM, resolvePageKey } from './config'

describe('config', () => {
  it('exposes the default key param name', () => {
    expect(DEFAULT_KEY_PARAM).toBe('comments-key')
  })

  it('resolves pageKey via core normalization by default', () => {
    expect(resolvePageKey({ key: 'k', endpoint: 'e' }, 'https://x.com/a/?q=1#h')).toBe(resolvePageKey({ key: 'k', endpoint: 'e' }, 'https://x.com/a'))
  })

  it('uses a custom pageKey function when provided', () => {
    const opts = { key: 'k', endpoint: 'e', pageKey: () => 'fixed' }
    expect(resolvePageKey(opts, 'https://x.com/anything')).toBe('fixed')
  })

  it('builds a schema-valid capture context from a window', () => {
    const win = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, navigator: { userAgent: 'UA' } } as unknown as Window
    expect(buildCaptureContext(win)).toEqual({ viewportW: 1280, viewportH: 720, devicePixelRatio: 2, userAgent: 'UA' })
  })
})
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `pnpm --filter @comments/client exec vitest run src/config.test.ts`
Expected: FAIL — cannot find `./config`.

- [ ] **Step 3: Implement `config.ts`**

```ts
import { type CaptureContext, normalizePageKey, type Provenance } from '@comments/core'

export type Features = {
  screenshots?: boolean
  textAnchors?: boolean
}

export type InitOptions = {
  key: string
  endpoint: string
  pageKey?: (url: string) => string
  keyParam?: string
  features?: Features
  provenance?: Provenance
}

export const DEFAULT_KEY_PARAM = 'comments-key'

export function resolvePageKey(opts: InitOptions, url: string): string {
  return opts.pageKey ? opts.pageKey(url) : normalizePageKey(url)
}

export function buildCaptureContext(win: Window = window): CaptureContext {
  return {
    viewportW: Math.max(1, Math.round(win.innerWidth)),
    viewportH: Math.max(1, Math.round(win.innerHeight)),
    devicePixelRatio: win.devicePixelRatio || 1,
    userAgent: win.navigator.userAgent,
  }
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @comments/client exec vitest run src/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/config.ts packages/client/src/config.test.ts
git commit -m "M5: config — InitOptions, resolvePageKey, buildCaptureContext"
```

---

## Task 5: `gate.ts` — activation gate

**Files:**
- Create: `packages/client/src/gate.ts`
- Test: `packages/client/src/gate.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isActivated } from './gate'

describe('isActivated', () => {
  it('activates when the default param is present and equals the key', () => {
    expect(isActivated({ search: '?comments-key=secret', key: 'secret' })).toBe(true)
  })

  it('does not activate when the param is absent', () => {
    expect(isActivated({ search: '', key: 'secret' })).toBe(false)
    expect(isActivated({ search: '?other=1', key: 'secret' })).toBe(false)
  })

  it('does not activate when the param value differs from the key', () => {
    expect(isActivated({ search: '?comments-key=wrong', key: 'secret' })).toBe(false)
  })

  it('honors a custom param name', () => {
    expect(isActivated({ search: '?ck=secret', key: 'secret', keyParam: 'ck' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter @comments/client exec vitest run src/gate.test.ts`
Expected: FAIL — cannot find `./gate`.

- [ ] **Step 3: Implement `gate.ts`**

```ts
import { DEFAULT_KEY_PARAM } from './config'

export type GateInput = {
  search: string
  key: string
  keyParam?: string
}

/** Activated iff the configured URL param is present AND equals the init key. */
export function isActivated({ search, key, keyParam = DEFAULT_KEY_PARAM }: GateInput): boolean {
  return new URLSearchParams(search).get(keyParam) === key
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @comments/client exec vitest run src/gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/gate.ts packages/client/src/gate.test.ts
git commit -m "M5: activation gate — isActivated (param present AND equals key)"
```

---

## Task 6: `identity/storage.ts` — self-asserted email persistence

**Files:**
- Create: `packages/client/src/identity/storage.ts`
- Test: `packages/client/src/identity/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/identity/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { loadIdentity, saveIdentity } from './storage'

describe('identity storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(loadIdentity()).toBeNull()
  })

  it('round-trips an identity', () => {
    saveIdentity({ email: 'a@b.com', name: 'Ada' })
    expect(loadIdentity()).toEqual({ email: 'a@b.com', name: 'Ada' })
  })

  it('omits a missing name', () => {
    saveIdentity({ email: 'a@b.com' })
    expect(loadIdentity()).toEqual({ email: 'a@b.com', name: undefined })
  })

  it('returns null on malformed json', () => {
    localStorage.setItem('comments:identity', '{not json')
    expect(loadIdentity()).toBeNull()
  })

  it('returns null when email is missing', () => {
    localStorage.setItem('comments:identity', JSON.stringify({ name: 'no email' }))
    expect(loadIdentity()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter @comments/client exec vitest run src/identity/storage.test.ts`
Expected: FAIL — cannot find `./storage`.

- [ ] **Step 3: Implement `identity/storage.ts`**

```ts
export type Identity = {
  email: string
  name?: string
}

const STORAGE_KEY = 'comments:identity'

export function loadIdentity(store: Storage = localStorage): Identity | null {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof (parsed as { email?: unknown }).email === 'string') {
      const { email, name } = parsed as { email: string; name?: unknown }
      return { email, name: typeof name === 'string' ? name : undefined }
    }
    return null
  } catch {
    return null
  }
}

export function saveIdentity(identity: Identity, store: Storage = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify({ email: identity.email, name: identity.name }))
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @comments/client exec vitest run src/identity/storage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/identity/storage.ts packages/client/src/identity/storage.test.ts
git commit -m "M5: identity storage — localStorage load/save"
```

---

## Task 7: API client + typed errors

**Files:**
- Create: `packages/client/src/api/errors.ts`
- Create: `packages/client/src/api/client.ts`
- Test: `packages/client/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test (mocked fetch)**

`packages/client/src/api/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FetchLike } from './client'
import { createApiClient } from './client'
import { ApiError } from './errors'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createApiClient', () => {
  it('sends the key header and builds the URL for createThread', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ id: 't1', comments: [] }, 201)
    }
    const client = createApiClient({ endpoint: 'http://x/api/', key: 'k', fetch: fakeFetch })
    const body = {
      pageUrl: 'https://h/p',
      anchor: { schemaVersion: 1, selectors: ['body', 'body'], signals: { tag: 'body', classes: [], siblingIndex: 0, ancestorTrail: [] }, offset: { fx: 0.5, fy: 0.5 } },
      comment: { text: 'hi' },
      author: { email: 'a@b.com' },
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'u' },
    } as Parameters<typeof client.createThread>[0]
    await client.createThread(body)
    expect(calls[0]?.url).toBe('http://x/api/threads') // trailing slash on endpoint normalized away
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['x-comments-key']).toBe('k')
  })

  it('builds list query strings', async () => {
    const calls: string[] = []
    const fakeFetch: FetchLike = async (url) => {
      calls.push(url)
      return jsonResponse({ threads: [], nextCursor: null })
    }
    const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
    await client.listThreads({ pageKey: 'h/p', status: 'open' })
    expect(calls[0]).toBe('http://x/threads?pageKey=h%2Fp&status=open')
  })

  it('maps a non-2xx response to ApiError', async () => {
    const fakeFetch: FetchLike = async () => jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'bad' } }, 400)
    const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
    await expect(client.getThread('t1')).rejects.toBeInstanceOf(ApiError)
    await expect(client.getThread('t1')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' })
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter @comments/client exec vitest run src/api/client.test.ts`
Expected: FAIL — cannot find `./client`.

- [ ] **Step 3: Implement `api/errors.ts`**

```ts
import type { ErrorCode } from '@comments/core'

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode | 'UNKNOWN'
  readonly details?: unknown

  constructor(status: number, code: ErrorCode | 'UNKNOWN', message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
```

- [ ] **Step 4: Implement `api/client.ts`**

```ts
import {
  type AddCommentBody,
  type Attachment,
  type Comment,
  type CreateThreadBody,
  KEY_HEADER_NAME,
  type RefreshAnchorBody,
  type SetThreadStatusBody,
  type Thread,
  type ThreadListItem,
  type ThreadListResponse,
  type ThreadStatus,
} from '@comments/core'
import { ApiError } from './errors'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ApiClientOptions = {
  endpoint: string
  key: string
  fetch?: FetchLike
}

export type ListParams = {
  pageKey?: string
  status?: ThreadStatus
  sort?: 'updatedAt'
  cursor?: string
}

export interface ApiClient {
  createThread(body: CreateThreadBody): Promise<Thread>
  listThreads(params?: ListParams): Promise<ThreadListResponse>
  getThread(id: string): Promise<Thread>
  addComment(id: string, body: AddCommentBody): Promise<Comment>
  setThreadStatus(id: string, body: SetThreadStatusBody): Promise<Thread>
  refreshAnchor(id: string, body: RefreshAnchorBody): Promise<ThreadListItem>
  upload(file: File): Promise<Attachment>
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.endpoint.replace(/\/+$/, '')
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))

  async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
    const headers: Record<string, string> = { [KEY_HEADER_NAME]: opts.key }
    let payload: BodyInit | undefined
    if (isForm) {
      payload = body as FormData
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await doFetch(`${base}${path}`, { method, headers, body: payload })
    const text = await res.text()
    const json: unknown = text ? JSON.parse(text) : undefined
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
      throw new ApiError(
        res.status,
        (err?.code as ApiError['code']) ?? 'UNKNOWN',
        err?.message ?? res.statusText,
        err?.details,
      )
    }
    return json as T
  }

  function qs(params?: ListParams): string {
    if (!params) return ''
    const sp = new URLSearchParams()
    if (params.pageKey) sp.set('pageKey', params.pageKey)
    if (params.status) sp.set('status', params.status)
    if (params.sort) sp.set('sort', params.sort)
    if (params.cursor) sp.set('cursor', params.cursor)
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  const id = (raw: string) => encodeURIComponent(raw)

  return {
    createThread: (body) => request<Thread>('POST', '/threads', body),
    listThreads: (params) => request<ThreadListResponse>('GET', `/threads${qs(params)}`),
    getThread: (threadId) => request<Thread>('GET', `/threads/${id(threadId)}`),
    addComment: (threadId, body) => request<Comment>('POST', `/threads/${id(threadId)}/comments`, body),
    setThreadStatus: (threadId, body) => request<Thread>('PATCH', `/threads/${id(threadId)}`, body),
    refreshAnchor: (threadId, body) => request<ThreadListItem>('PATCH', `/threads/${id(threadId)}/anchor`, body),
    upload: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return request<Attachment>('POST', '/uploads', fd, true)
    },
  }
}
```

- [ ] **Step 5: Run it (passes)**

Run: `pnpm --filter @comments/client exec vitest run src/api/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/api/
git commit -m "M5: typed API client (7 ops, key header, error mapping, fetch seam)"
```

---

## Task 8: `marker/stub-anchor.ts` — schema-valid placeholder anchor

**Files:**
- Create: `packages/client/src/marker/stub-anchor.ts`
- Test: `packages/client/src/marker/stub-anchor.test.ts`

- [ ] **Step 1: Write the failing test (validate against the real schema)**

`packages/client/src/marker/stub-anchor.test.ts`:

```ts
import { Anchor, ANCHOR_SCHEMA_VERSION } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { makeStubAnchor } from './stub-anchor'

describe('makeStubAnchor', () => {
  it('produces an anchor that parses against the core Anchor schema', () => {
    const parsed = Anchor.safeParse(makeStubAnchor())
    expect(parsed.success).toBe(true)
  })

  it('uses the current write-time schema version and no selection', () => {
    const a = makeStubAnchor()
    expect(a.schemaVersion).toBe(ANCHOR_SCHEMA_VERSION)
    expect(a.selection).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter @comments/client exec vitest run src/marker/stub-anchor.test.ts`
Expected: FAIL — cannot find `./stub-anchor`.

- [ ] **Step 3: Implement `marker/stub-anchor.ts`**

```ts
import { type Anchor, ANCHOR_SCHEMA_VERSION } from '@comments/core'

/**
 * A minimal, schema-valid anchor for the M5 placeholder marker. It is NOT a real
 * fingerprint — real DOM capture (from `src/anchor/extract.ts`) is wired in M6.
 */
export function makeStubAnchor(): Anchor {
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: ['body', 'body'],
    signals: { tag: 'body', classes: [], siblingIndex: 0, ancestorTrail: [] },
    offset: { fx: 0.5, fy: 0.5 },
  }
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @comments/client exec vitest run src/marker/stub-anchor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/marker/stub-anchor.ts packages/client/src/marker/stub-anchor.test.ts
git commit -m "M5: schema-valid placeholder stub anchor"
```

---

## Task 9: API round-trip integration test (the exit-criterion proof)

**Files:**
- Test: `packages/client/src/api/round-trip.test.ts`

This test boots a real `@comments/server` over the M3 dev server and proves create + read end-to-end over HTTP. It needs `@comments/server` as a client devDependency.

- [ ] **Step 1: Add `@comments/server` to client devDependencies**

In `packages/client/package.json`, add to `devDependencies`:

```jsonc
    "@comments/server": "workspace:*",
```

Run: `pnpm install`
Expected: completes.

- [ ] **Step 2: Write the round-trip test**

`packages/client/src/api/round-trip.test.ts`:

```ts
import { createCommentsServer, InMemoryRepository, type StorageAdapter } from '@comments/server'
import { createDevServer, type DevServerHandle } from '@comments/server/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCaptureContext } from '../config'
import { makeStubAnchor } from '../marker/stub-anchor'
import type { FetchLike } from './client'
import { createApiClient } from './client'

const KEY = 'dev-key'
const ORIGIN = 'http://localhost'

// Storage is required by the server constructor even though M5 never uploads.
const storageStub: StorageAdapter = {
  async put(blob) {
    return { url: `mem://${blob.name}`, key: blob.name, size: 0 }
  },
}

// Browsers send Origin automatically; node fetch does not, and checkOrigin rejects
// a missing Origin. Inject it here to simulate the browser.
const fetchWithOrigin: FetchLike = (input, init) =>
  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: ORIGIN } })

let dev: DevServerHandle
let endpoint: string

beforeAll(async () => {
  const server = createCommentsServer({
    secretKey: KEY,
    projectId: 'p1',
    allowedOrigins: [ORIGIN],
    repository: new InMemoryRepository(),
    storage: storageStub,
    rateLimit: false,
  })
  dev = createDevServer((req) => server.handle(req), { port: 0 })
  const { port } = await dev.listen()
  endpoint = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await dev.close()
})

describe('API client round-trip against the in-memory dev server', () => {
  it('creates a thread and reads it back', async () => {
    const client = createApiClient({ endpoint, key: KEY, fetch: fetchWithOrigin })

    const created = await client.createThread({
      pageUrl: 'https://example.com/page',
      pageKey: 'example.com/page',
      anchor: makeStubAnchor(),
      comment: { text: 'hello from M5' },
      author: { email: 'reviewer@example.com' },
      captureContext: buildCaptureContext({
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 1,
        navigator: { userAgent: 'test' },
      } as unknown as Window),
    })

    expect(created.id).toBeTruthy()

    const list = await client.listThreads({ pageKey: 'example.com/page' })
    expect(list.threads.map((t) => t.id)).toContain(created.id)

    const got = await client.getThread(created.id)
    expect(got.comments[0]?.text).toBe('hello from M5')
  })

  it('rejects a bad key with a 401 ApiError', async () => {
    const client = createApiClient({ endpoint, key: 'wrong-key', fetch: fetchWithOrigin })
    await expect(client.listThreads({ pageKey: 'x' })).rejects.toMatchObject({ status: 401 })
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/api/round-trip.test.ts`
Expected: PASS (2 tests). If `@comments/server`/`@comments/core` are not built, run `pnpm --filter @comments/server... build` first (turbo `test` handles this in the full run).

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json packages/client/src/api/round-trip.test.ts pnpm-lock.yaml
git commit -m "M5: API client round-trip proof against in-memory dev server"
```

---

## Task 10: Providers (portal + toasts containers) + toast

**Files:**
- Create: `packages/client/src/lib/cn.ts`
- Create: `packages/client/src/app/providers.tsx`
- Create: `packages/client/src/ui/toast.tsx`
- Test: `packages/client/src/ui/toast.test.tsx`

- [ ] **Step 1: Implement the className helper**

`packages/client/src/lib/cn.ts`:

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Implement the containers provider**

`packages/client/src/app/providers.tsx`:

```tsx
import { createContext, type ReactNode, useContext, useState } from 'react'

type Containers = {
  portal: HTMLElement | null
  toasts: HTMLElement | null
}

const ContainerContext = createContext<Containers>({ portal: null, toasts: null })

export function usePortalContainer(): HTMLElement | null {
  return useContext(ContainerContext).portal
}

export function useToastsContainer(): HTMLElement | null {
  return useContext(ContainerContext).toasts
}

export function WidgetProvider({ children }: { children: ReactNode }) {
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  const [toasts, setToasts] = useState<HTMLElement | null>(null)

  return (
    <ContainerContext.Provider value={{ portal, toasts }}>
      {children}
      <div data-portal-container ref={setPortal} style={{ position: 'absolute' }} />
      <div
        data-toasts-container
        ref={setToasts}
        style={{ position: 'absolute', bottom: 16, right: 16, pointerEvents: 'none' }}
      />
    </ContainerContext.Provider>
  )
}
```

- [ ] **Step 3: Implement the minimal toast**

`packages/client/src/ui/toast.tsx`:

```tsx
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToastsContainer } from '../app/providers'

type ToastItem = { id: number; message: string }
type ToastFn = (message: string) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

let nextToastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const container = useToastsContainer()

  const push = useCallback<ToastFn>((message) => {
    const id = nextToastId++
    setItems((prev) => [...prev, { id, message }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {container &&
        createPortal(
          items.map((t) => (
            <div
              key={t.id}
              role="status"
              data-comments-toast
              style={{ pointerEvents: 'auto', background: '#1f2937', color: '#fff', padding: '8px 12px', borderRadius: 8, marginTop: 8 }}
            >
              {t.message}
            </div>
          )),
          container,
        )}
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 4: Write the test**

`packages/client/src/ui/toast.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { ToastProvider, useToast } from './toast'

function Pusher({ message }: { message: string }) {
  const toast = useToast()
  useEffect(() => toast(message), [toast, message])
  return null
}

describe('toast', () => {
  it('renders a pushed toast into the toasts container', async () => {
    render(
      <WidgetProvider>
        <ToastProvider>
          <Pusher message="something failed" />
        </ToastProvider>
      </WidgetProvider>,
    )
    expect(await screen.findByText('something failed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/ui/toast.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/ packages/client/src/app/providers.tsx packages/client/src/ui/
git commit -m "M5: containers provider + minimal in-host toast"
```

---

## Task 11: Identity modal (Radix Dialog)

**Files:**
- Create: `packages/client/src/identity/IdentityModal.tsx`
- Test: `packages/client/src/identity/IdentityModal.test.tsx`

- [ ] **Step 1: Implement the modal**

`packages/client/src/identity/IdentityModal.tsx`:

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { type FormEvent, useState } from 'react'
import { usePortalContainer } from '../app/providers'
import type { Identity } from './storage'

export type IdentityModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (identity: Identity) => void
}

export function IdentityModal({ open, onOpenChange, onSubmit }: IdentityModalProps) {
  const container = usePortalContainer()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    onSubmit({ email: trimmed, name: name.trim() || undefined })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            minWidth: 320,
            pointerEvents: 'auto',
          }}
        >
          <Dialog.Title style={{ marginTop: 0 }}>Enter your email</Dialog.Title>
          <Dialog.Description>Used only to label your comments. No verification, and no email is ever sent.</Dialog.Description>
          <form onSubmit={submit}>
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ display: 'block', width: '100%', margin: '12px 0', padding: 8 }}
            />
            <input
              aria-label="Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              style={{ display: 'block', width: '100%', margin: '12px 0', padding: 8 }}
            />
            <button type="submit">Start commenting</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Write the test**

`packages/client/src/identity/IdentityModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { IdentityModal } from './IdentityModal'

describe('IdentityModal', () => {
  it('submits the entered email (and optional name)', () => {
    const onSubmit = vi.fn()
    render(
      <WidgetProvider>
        <IdentityModal open onOpenChange={() => {}} onSubmit={onSubmit} />
      </WidgetProvider>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rev@example.com' } })
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Rev' } })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    expect(onSubmit).toHaveBeenCalledWith({ email: 'rev@example.com', name: 'Rev' })
  })

  it('does not submit when email is empty', () => {
    const onSubmit = vi.fn()
    render(
      <WidgetProvider>
        <IdentityModal open onOpenChange={() => {}} onSubmit={onSubmit} />
      </WidgetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/identity/IdentityModal.test.tsx`
Expected: PASS (2 tests). (If the Dialog warns about a missing Description, it's wired above — no warning expected.)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/identity/IdentityModal.tsx packages/client/src/identity/IdentityModal.test.tsx
git commit -m "M5: identity modal (Radix Dialog, portal-contained)"
```

---

## Task 12: Widget error boundary

**Files:**
- Create: `packages/client/src/error-boundary.tsx`
- Test: `packages/client/src/error-boundary.test.tsx`

- [ ] **Step 1: Implement the error boundary**

`packages/client/src/error-boundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/** Contains any widget render crash so it never propagates to the host page. */
export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[comments] widget error (contained):', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.hasError ? null : this.props.children
  }
}
```

- [ ] **Step 2: Write the test**

`packages/client/src/error-boundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetErrorBoundary } from './error-boundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('WidgetErrorBoundary', () => {
  // React logs caught errors to console.error; silence for a clean run.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing instead of crashing when a child throws', () => {
    render(
      <div>
        <span>host stays</span>
        <WidgetErrorBoundary>
          <Boom />
        </WidgetErrorBoundary>
      </div>,
    )
    // The boundary rendered null; the sibling (host) content is unaffected.
    expect(screen.getByText('host stays')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/error-boundary.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/error-boundary.tsx packages/client/src/error-boundary.test.tsx
git commit -m "M5: widget error boundary (host-crash containment)"
```

---

## Task 13: Marker layer (placeholder pin + optimistic create + rollback)

**Files:**
- Create: `packages/client/src/marker/MarkerLayer.tsx`
- Test: `packages/client/src/marker/MarkerLayer.test.tsx`

- [ ] **Step 1: Implement the marker layer**

`packages/client/src/marker/MarkerLayer.tsx`:

```tsx
import type { Provenance } from '@comments/core'
import { useEffect, useState } from 'react'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { useToast } from '../ui/toast'
import { makeStubAnchor } from './stub-anchor'

type Pin = { id: string; pending: boolean }

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
}

let nextTempId = 0

export function MarkerLayer({ client, pageKey, pageUrl, identity, onNeedIdentity, provenance }: MarkerLayerProps) {
  const [pins, setPins] = useState<Pin[]>([])
  const toast = useToast()

  useEffect(() => {
    let active = true
    client
      .listThreads({ pageKey })
      .then((res) => {
        if (active) setPins(res.threads.map((t) => ({ id: t.id, pending: false })))
      })
      .catch(() => {
        // Reads are non-fatal in M5; the panel/orphan UX is M6+.
      })
    return () => {
      active = false
    }
  }, [client, pageKey])

  async function place(who: Identity) {
    const tempId = `optimistic-${nextTempId++}`
    setPins((prev) => [...prev, { id: tempId, pending: true }])
    try {
      const thread = await client.createThread({
        pageUrl,
        pageKey,
        anchor: makeStubAnchor(),
        comment: { text: 'Placeholder comment' },
        author: { email: who.email, name: who.name },
        captureContext: buildCaptureContext(),
        provenance,
      })
      setPins((prev) => prev.map((p) => (p.id === tempId ? { id: thread.id, pending: false } : p)))
    } catch (err) {
      setPins((prev) => prev.filter((p) => p.id !== tempId))
      toast(err instanceof ApiError ? err.message : 'Failed to create comment')
    }
  }

  function onPlaceClick() {
    if (identity) place(identity)
    else onNeedIdentity((who) => place(who))
  }

  return (
    <>
      <div data-comments-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {pins.map((pin, i) => (
          <div
            key={pin.id}
            data-comments-pin
            title={pin.id}
            style={{
              position: 'absolute',
              top: 16 + i * 28,
              left: 16,
              width: 20,
              height: 20,
              borderRadius: '9999px',
              background: pin.pending ? '#9ca3af' : '#2563eb',
              pointerEvents: 'auto',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        data-comments-place
        onClick={onPlaceClick}
        className="cmnt:rounded-full cmnt:shadow-lg"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          padding: '8px 14px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        + Comment
      </button>
    </>
  )
}
```

- [ ] **Step 2: Write the test (mock ApiClient)**

`packages/client/src/marker/MarkerLayer.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { WidgetProvider } from '../app/providers'
import type { Identity } from '../identity/storage'
import { ToastProvider } from '../ui/toast'
import { MarkerLayer } from './MarkerLayer'

const IDENTITY: Identity = { email: 'rev@example.com' }

function mockClient(over: Partial<ApiClient> = {}): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
    ...over,
  } as ApiClient
}

function renderLayer(client: ApiClient, identity: Identity | null, onNeedIdentity = vi.fn()) {
  return render(
    <WidgetProvider>
      <ToastProvider>
        <MarkerLayer client={client} pageKey="h/p" pageUrl="https://h/p" identity={identity} onNeedIdentity={onNeedIdentity} />
      </ToastProvider>
    </WidgetProvider>,
  )
}

describe('MarkerLayer', () => {
  it('optimistically adds a pin and reconciles to the server id on success', async () => {
    const client = mockClient()
    renderLayer(client, IDENTITY)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(client.createThread).toHaveBeenCalledOnce()
  })

  it('rolls back the pin and shows a toast on failure', async () => {
    const client = mockClient({
      createThread: vi.fn(async () => {
        throw new ApiError(400, 'VALIDATION_FAILED', 'nope')
      }),
    })
    renderLayer(client, IDENTITY)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-comments-pin]')).toBeNull())
  })

  it('requests identity when none is set', () => {
    const onNeedIdentity = vi.fn()
    renderLayer(mockClient(), null, onNeedIdentity)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(onNeedIdentity).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/marker/MarkerLayer.tsx packages/client/src/marker/MarkerLayer.test.tsx
git commit -m "M5: placeholder marker layer (optimistic create + rollback)"
```

---

## Task 14: `app/app.tsx` — widget composition + identity flow

**Files:**
- Create: `packages/client/src/app/app.tsx`
- Test: `packages/client/src/app/app.test.tsx`

- [ ] **Step 1: Implement the top-level app**

`packages/client/src/app/app.tsx`:

```tsx
import { useRef, useState } from 'react'
import { type ApiClient, createApiClient } from '../api/client'
import { type InitOptions, resolvePageKey } from '../config'
import { WidgetErrorBoundary } from '../error-boundary'
import { IdentityModal } from '../identity/IdentityModal'
import { type Identity, loadIdentity, saveIdentity } from '../identity/storage'
import { MarkerLayer } from '../marker/MarkerLayer'
import { ToastProvider } from '../ui/toast'
import { WidgetProvider } from './providers'

export type WidgetAppProps = {
  options: InitOptions
  /** Test seam: inject a client instead of constructing one from `options`. */
  client?: ApiClient
}

export function WidgetApp({ options, client: injected }: WidgetAppProps) {
  const [client] = useState<ApiClient>(() => injected ?? createApiClient({ endpoint: options.endpoint, key: options.key }))
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity())
  const [modalOpen, setModalOpen] = useState(false)
  const resumeRef = useRef<((identity: Identity) => void) | null>(null)

  const pageUrl = window.location.href
  const pageKey = resolvePageKey(options, pageUrl)

  function onNeedIdentity(resume: (identity: Identity) => void) {
    resumeRef.current = resume
    setModalOpen(true)
  }

  function onSubmitIdentity(who: Identity) {
    saveIdentity(who)
    setIdentity(who)
    setModalOpen(false)
    const resume = resumeRef.current
    resumeRef.current = null
    resume?.(who)
  }

  return (
    <WidgetErrorBoundary>
      <WidgetProvider>
        <ToastProvider>
          <MarkerLayer
            client={client}
            pageKey={pageKey}
            pageUrl={pageUrl}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            provenance={options.provenance}
          />
          <IdentityModal open={modalOpen} onOpenChange={setModalOpen} onSubmit={onSubmitIdentity} />
        </ToastProvider>
      </WidgetProvider>
    </WidgetErrorBoundary>
  )
}
```

- [ ] **Step 2: Write the test (identity-gated create flow, end to end in jsdom)**

`packages/client/src/app/app.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

function mockClient(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as ApiClient
}

describe('WidgetApp', () => {
  beforeEach(() => localStorage.clear())

  it('prompts for identity on first placement, then creates after submit', async () => {
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    // Identity modal appears.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rev@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(client.createThread).toHaveBeenCalledOnce()
    // Identity persisted for next time.
    expect(localStorage.getItem('comments:identity')).toContain('rev@example.com')
  })

  it('skips the modal when identity is already stored', async () => {
    localStorage.setItem('comments:identity', JSON.stringify({ email: 'known@example.com' }))
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @comments/client exec vitest run src/app/app.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/app/app.tsx packages/client/src/app/app.test.tsx
git commit -m "M5: WidgetApp composition + identity-gated create flow"
```

---

## Task 15: `app/mount.tsx` — host root, CSS injection, React root, teardown

**Files:**
- Create: `packages/client/src/app/mount.tsx`
- Test: `packages/client/src/app/mount.test.tsx`

- [ ] **Step 1: Implement mount (requires the generated CSS — run `build:css` if not yet present)**

`packages/client/src/app/mount.tsx`:

```tsx
import { createRoot, type Root } from 'react-dom/client'
import type { InitOptions } from '../config'
import { WidgetApp } from './app'
import { widgetCss } from './widget-css.generated'

export type WidgetHandle = {
  destroy(): void
}

export function mount(options: InitOptions): WidgetHandle {
  const host = document.createElement('div')
  host.setAttribute('data-comments-root', '')
  // `all: revert` first neutralizes inherited host styles; the following longhands
  // re-establish only the few we need (longhands after a shorthand win in CSS).
  host.style.cssText = 'all: revert; position: fixed; inset: 0; pointer-events: none; z-index: 2147483600;'

  const style = document.createElement('style')
  style.setAttribute('data-comments-style', '')
  style.textContent = widgetCss
  host.appendChild(style)

  const mountNode = document.createElement('div')
  mountNode.style.cssText = 'position: absolute; inset: 0; pointer-events: none;'
  host.appendChild(mountNode)

  document.body.appendChild(host)

  const root: Root = createRoot(mountNode)
  root.render(<WidgetApp options={options} />)

  return {
    destroy() {
      root.unmount()
      host.remove()
    },
  }
}
```

- [ ] **Step 2: Write the test**

`packages/client/src/app/mount.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from './mount'

describe('mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('injects a single host root with the compiled stylesheet and tears down cleanly', () => {
    const handle = mount({ key: 'k', endpoint: 'http://x' })

    const host = document.querySelector('[data-comments-root]')
    expect(host).not.toBeNull()
    const style = host?.querySelector('[data-comments-style]')
    // Prefixed Tailwind output is present (proves the CSS pipeline ran).
    expect(style?.textContent).toContain('cmnt')
    // The place button rendered inside the host.
    expect(host?.querySelector('[data-comments-place]')).not.toBeNull()

    handle.destroy()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
```

- [ ] **Step 3: Ensure CSS is built, then run**

Run: `pnpm --filter @comments/client build:css && pnpm --filter @comments/client exec vitest run src/app/mount.test.tsx`
Expected: PASS (1 test). The `cmnt` assertion passes because `MarkerLayer` uses `cmnt:rounded-full`/`cmnt:shadow-lg`, which Tailwind emits.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/app/mount.tsx packages/client/src/app/mount.test.tsx
git commit -m "M5: mount — light-DOM host root + CSS injection + React root + teardown"
```

---

## Task 16: `index.ts` — `comments.init()` shell

**Files:**
- Modify: `packages/client/src/index.ts`
- Test: `packages/client/src/init.test.ts`

- [ ] **Step 1: Rewrite `index.ts` (keep `packageName` + anchor exports)**

`packages/client/src/index.ts`:

```ts
import { type InitOptions, DEFAULT_KEY_PARAM } from './config'
import { isActivated } from './gate'

export const packageName = '@comments/client'

export * from './anchor'
export type { InitOptions } from './config'
export { DEFAULT_KEY_PARAM } from './config'

export type CommentsHandle = {
  destroy(): void
}

const NOOP_HANDLE: CommentsHandle = { destroy() {} }

/**
 * Mount the widget if a valid key is present in the URL; otherwise a no-op.
 * Async by contract so a future lazy-load split can return a Promise without a
 * breaking change. In M5 the app is statically bundled (no code-splitting); the
 * gate still keeps the widget inert (never mounts) when the key is absent.
 */
export async function init(options: InitOptions): Promise<CommentsHandle> {
  if (typeof window === 'undefined') return NOOP_HANDLE
  if (!isActivated({ search: window.location.search, key: options.key, keyParam: options.keyParam ?? DEFAULT_KEY_PARAM })) {
    return NOOP_HANDLE
  }
  const { mount } = await import('./app/mount')
  return mount(options)
}

export const comments = { init }
```

> Note: `await import('./app/mount')` here is a normal dynamic import for ergonomics; with code-splitting OFF (Task 18) tsup inlines it into `index.js` rather than emitting a separate chunk. Either way `init` stays async.

- [ ] **Step 2: Write the test**

`packages/client/src/init.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init } from './index'

describe('comments.init', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })
  afterEach(() => {
    history.replaceState({}, '', '/')
  })

  it('is a no-op when the key param is absent', async () => {
    history.replaceState({}, '', '/?nothing=1')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).toBeNull()
    handle.destroy() // must not throw
  })

  it('mounts when the key param matches', async () => {
    history.replaceState({}, '', '/?comments-key=secret')
    const handle = await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).not.toBeNull()
    handle.destroy()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })

  it('does not mount when the key param differs', async () => {
    history.replaceState({}, '', '/?comments-key=wrong')
    await init({ key: 'secret', endpoint: 'http://x' })
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
```

- [ ] **Step 3: Run it (plus the existing barrel test still passes)**

(The generated CSS from Task 15 must be present — `init` → `mount` imports it; if starting fresh run `pnpm --filter @comments/client build:css` first.)

Run: `pnpm --filter @comments/client exec vitest run src/init.test.ts src/index.test.ts`
Expected: PASS (3 + 2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/index.ts packages/client/src/init.test.ts
git commit -m "M5: comments.init() shell — gate then mount (async, inert without key)"
```

---

## Task 17: `react.ts` — `<CommentsLayer/>` wrapper (peer React)

**Files:**
- Modify: `packages/client/src/react.ts`
- Test: `packages/client/src/react.test.tsx`

React reserves the `key` prop, so a host cannot pass `key` as data. The wrapper's
secret prop is therefore `commentsKey`, mapped to `init`'s `key` option.

- [ ] **Step 1: Rewrite `react.ts`** (`CommentsLayer` returns `null` — no JSX, so it stays a `.ts` file)

`packages/client/src/react.ts`:

```ts
import { useEffect } from 'react'
import { type CommentsHandle, comments, type InitOptions } from './index'

export const packageName = '@comments/client/react'

export type CommentsLayerProps = Omit<InitOptions, 'key'> & {
  /** The secret key (React reserves the `key` prop name, so it is `commentsKey` here). */
  commentsKey: string
}

/** Thin wrapper for React hosts: calls comments.init() in an effect and tears down on unmount. */
export function CommentsLayer({ commentsKey, ...rest }: CommentsLayerProps): null {
  useEffect(() => {
    let handle: CommentsHandle | null = null
    let cancelled = false
    comments.init({ key: commentsKey, ...rest }).then((h) => {
      if (cancelled) h.destroy()
      else handle = h
    })
    return () => {
      cancelled = true
      handle?.destroy()
    }
    // Re-init only when the connection identity changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional connection-scoped deps
  }, [commentsKey, rest.endpoint, rest.keyParam])
  return null
}
```

- [ ] **Step 2: Replace `react.test.ts` with `react.test.tsx`** (keeps the packageName smoke check, adds mount/cleanup)

`packages/client/src/react.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CommentsLayer, packageName } from './react'

describe('@comments/client/react', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    history.replaceState({}, '', '/?comments-key=secret')
  })
  afterEach(() => history.replaceState({}, '', '/'))

  it('exposes its subpath package name', () => {
    expect(packageName).toBe('@comments/client/react')
  })

  it('mounts the widget on render and removes it on unmount', async () => {
    const { unmount } = render(<CommentsLayer commentsKey="secret" endpoint="http://x" />)
    // init() is async; wait a couple microtasks for the mount to land.
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('[data-comments-root]')).not.toBeNull()
    unmount()
    expect(document.querySelector('[data-comments-root]')).toBeNull()
  })
})
```

- [ ] **Step 3: Run it** (the generated CSS from Task 15 must be present; if starting fresh run `pnpm --filter @comments/client build:css` first)

Run: `pnpm --filter @comments/client exec vitest run src/react.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/react.ts packages/client/src/react.test.tsx
git rm packages/client/src/react.test.ts
git commit -m "M5: <CommentsLayer/> wrapper (peer React, commentsKey prop, mount/cleanup)"
```

---

## Task 18: Two-config tsup build (widget bundles React; wrapper externals it)

**Files:**
- Modify: `packages/client/tsup.config.ts`

- [ ] **Step 1: Rewrite `tsup.config.ts` as two configs**

```ts
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Vanilla widget: self-contained, bundles its OWN React + all UI deps.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    noExternal: [/.*/],
    clean: ['dist/**/*.js', 'dist/**/*.js.map'],
  },
  {
    // React wrapper: uses the HOST's React (peer) and references the sibling
    // widget bundle at runtime — it must NOT re-bundle React or the widget.
    entry: { react: 'src/react.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['react', 'react-dom'],
    esbuildOptions(options) {
      // Keep the sibling widget bundle external so it is loaded at runtime, not re-bundled.
      options.external = [...(options.external ?? []), './index.js']
    },
    clean: false,
  },
])
```

> The wrapper source imports `comments`/types from `./index`. Because the emitted `react.js` references `./index.js` and we mark that path external, the wrapper stays tiny and the single self-contained widget (with its bundled React) is the only widget implementation.

- [ ] **Step 2: Build and verify the outputs**

Run: `pnpm --filter @comments/client build`
Expected: build:css runs, then tsup emits `dist/index.js` and `dist/react.js`, then `tsc --build` emits `.d.ts`. No errors.

- [ ] **Step 3: Inspect that the dual-React boundary holds**

Run: `node -e "const fs=require('fs');const r=fs.readFileSync('packages/client/dist/react.js','utf8');console.log('react.js bytes:', r.length);console.log('references sibling widget:', r.includes('./index.js'));console.log('does NOT inline createRoot:', !r.includes('createRoot'));"`
Expected: `react.js` is small (single-digit KB), references `./index.js`, and does NOT inline `createRoot` (that lives in `index.js`). Also confirm React is present in the widget:
Run: `node -e "const fs=require('fs');console.log('index.js has React runtime:', fs.readFileSync('packages/client/dist/index.js','utf8').includes('createRoot'));"`
Expected: `true`.

> If `react.js` turns out to inline the widget/React (relative external not honored), fall back to importing the wrapper's runtime dependency via the package self-reference `@comments/client` and marking that external instead. Re-run the inspection.

- [ ] **Step 4: Commit**

```bash
git add packages/client/tsup.config.ts
git commit -m "M5: tsup two-config — widget bundles React, wrapper externals it"
```

---

## Task 19: Throwaway playground (Vite page + dev-server boot)

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `examples/playground/package.json`
- Create: `examples/playground/vite.config.ts`
- Create: `examples/playground/index.html`
- Create: `examples/playground/src/main.tsx`
- Create: `examples/playground/dev-server.mjs`
- Create: `examples/playground/README.md`

- [ ] **Step 1: Enable `examples/*` in the workspace**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  # examples/* holds dev-only demos. M5 adds a throwaway widget playground;
  # M9 replaces it with the real sample Next.js host app.
  - 'examples/*'
```

- [ ] **Step 2: Playground package manifest**

`examples/playground/package.json`:

```json
{
  "name": "@comments/playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:server": "node dev-server.mjs"
  },
  "dependencies": {
    "@comments/client": "workspace:*",
    "@comments/server": "workspace:*"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 3: Vite config**

`examples/playground/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
```

- [ ] **Step 4: HTML host page**

`examples/playground/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Comments widget playground</title>
  </head>
  <body>
    <h1>Host page</h1>
    <p>Open this page with <code>?comments-key=dev-key</code> to activate the widget.</p>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Mount script**

`examples/playground/src/main.tsx`:

```tsx
import { comments } from '@comments/client'

void comments.init({
  key: 'dev-key',
  endpoint: 'http://127.0.0.1:4321',
})
```

- [ ] **Step 6: Dev-server boot script (in-memory backend)**

`examples/playground/dev-server.mjs`:

```js
import { createCommentsServer, InMemoryRepository } from '@comments/server'
import { createDevServer } from '@comments/server/dev'

const storageStub = {
  async put(blob) {
    return { url: `mem://${blob.name}`, key: blob.name, size: 0 }
  },
}

const server = createCommentsServer({
  secretKey: 'dev-key',
  projectId: 'playground',
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  repository: new InMemoryRepository(),
  storage: storageStub,
  rateLimit: false,
})

const dev = createDevServer((req) => server.handle(req), { port: 4321 })
const { port } = await dev.listen()
console.log(`[playground] in-memory comments API on http://127.0.0.1:${port}`)
```

- [ ] **Step 7: README with run instructions**

`examples/playground/README.md`:

```markdown
# Widget playground (throwaway)

Manual visual proof for M5. **Not** shipped; M9 replaces this with the real
`examples/` Next.js host app + Playwright e2e.

## Run

1. Build the workspace packages the playground imports:
   ```bash
   pnpm --filter @comments/core --filter @comments/server --filter @comments/client build
   ```
2. In one terminal, start the in-memory API:
   ```bash
   pnpm --filter @comments/playground dev:server
   ```
3. In another, start the page:
   ```bash
   pnpm --filter @comments/playground dev
   ```
4. Open <http://localhost:5173/?comments-key=dev-key>. Without the key param the
   page is untouched (widget inert). With it: a **+ Comment** button appears,
   the first click prompts for your email, and placing a marker creates a thread
   you can see persist across a reload.
```

- [ ] **Step 8: Install the new workspace package**

Run: `pnpm install`
Expected: resolves `@comments/playground` and its vite devDeps.

- [ ] **Step 9: Smoke-check the dev server boots (then stop it)**

Run: `pnpm --filter @comments/core --filter @comments/server --filter @comments/client build && timeout 3 pnpm --filter @comments/playground dev:server || true`
Expected: prints `[playground] in-memory comments API on http://127.0.0.1:4321` before the timeout stops it.

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml examples/playground pnpm-lock.yaml
git commit -m "M5: throwaway widget playground (Vite page + in-memory dev server)"
```

---

## Task 20: ADR-0014 + spec/milestone doc updates

**Files:**
- Modify: `docs/adr.md`
- Modify: `docs/milestones.md`

- [ ] **Step 1: Append ADR-0014 to `docs/adr.md`** (after ADR-0013)

```markdown

---

## ADR-0014 — Widget runtime delivery: bundled-React widget + peer-React wrapper, Tailwind precompiled to a string

- **Date:** 2026-05-29
- **Status:** accepted

**Context.** M5 builds the widget runtime that realizes ADR-0002 (self-contained
vanilla mount + own bundled React + thin React wrapper), ADR-0005 (shadcn/Radix),
and ADR-0006 (light-DOM isolation). Three realization choices are hard to reverse
and shape M6–M8: how React is bundled across the two entry points, how the
widget's Tailwind CSS reaches the page, and the resulting dual-React boundary.

**Decision.**
- **Two tsup configs.** `@comments/client` (vanilla `comments.init()`) bundles its
  **own React** and all UI deps into `dist/index.js` — host-agnostic.
  `@comments/client/react` (`<CommentsLayer/>`) marks `react`/`react-dom`
  **external** (the host's React) and references the sibling widget bundle at
  runtime, so there is exactly one widget implementation. This is the **dual-React
  boundary**: the wrapper's own hooks run on host React; the widget renders its own
  React tree via a separate `createRoot`. They never share a tree, so two React
  instances coexist safely. The wrapper's secret prop is `commentsKey` (React
  reserves `key`).
- **No code-splitting in M5.** `init()` keeps an **async signature** (so a future
  lazy-download split can land without an API break), but the app + React are
  statically bundled. The activation gate still makes the widget **inert** (never
  mounts, renders, or fetches) when the URL key is absent. Splitting for download
  savings is deferred to when bundle size is calibrated (M9).
- **Tailwind v4 precompiled to a string.** A `build:css` step runs the Tailwind CLI
  on a no-preflight, `cmnt`-prefixed entry and inlines the output into a generated
  `.ts` module (`export const widgetCss`). `mount()` injects it into a `<style>` in
  the light-DOM host root. A plain `.ts` string module resolves identically in the
  tsup build and the jsdom tests — no esbuild/vitest CSS-loader config in two
  places. The `cmnt:` prefix prevents our injected utilities (which live in the
  host's light DOM) from styling host elements.

**Consequences.**
- Host-framework-agnostic vanilla widget and an ergonomic React wrapper, with no
  "invalid hook call" risk from mixed React instances.
- The generated CSS module is git-ignored and produced ahead of `tsup`/`tsc`/
  `vitest`; running tests/builds requires the Tailwind dev dependency.
- Bundle size is intentionally unoptimized in M5 (no split, widget carries React);
  this is an accepted, documented deferral, not a regression.
- Re-introducing a lazy-download split later is non-breaking because `init()` is
  already async.
```

- [ ] **Step 2: Add the design-spec ref to M5 in `docs/milestones.md`**

In the M5 section, change the `**Refs.**` line to include the design spec (matching how M2a references its spec):

```markdown
**Refs.** Design [`specs/2026-05-29-m5-widget-shell-design.md`](../superpowers/specs/2026-05-29-m5-widget-shell-design.md);
Spec §3, §8; ADR-0002, ADR-0005, ADR-0006, ADR-0014.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr.md docs/milestones.md
git commit -m "M5: ADR-0014 (widget runtime delivery) + milestone spec ref"
```

---

## Task 21: Full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS across all packages (client now typechecks `.tsx` + the generated CSS module — `build` ran first via turbo's `typecheck → build` dependency).

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: PASS — including the client's new gate/config/identity/api/round-trip/component tests and the existing backend suites.

- [ ] **Step 3: Build everything**

Run: `pnpm build`
Expected: PASS; `packages/client/dist/{index,react}.js` + `.d.ts` present.

- [ ] **Step 4: Lint/format**

Run: `pnpm lint`
Expected: PASS (Biome). If Biome flags import ordering or the `useExhaustiveDependencies` line, fix imports and confirm the single `biome-ignore` in `react.ts` is intact; re-run.

- [ ] **Step 5: Export-map check**

Run: `pnpm check:exports`
Expected: PASS — `@comments/client` (`.`) and `@comments/client/react` resolve.

- [ ] **Step 6: Commit any fixups**

```bash
git add -A
git commit -m "M5: lint/typecheck fixups; full suite green"
```

---

## Self-review notes (spec coverage)

- Light-DOM mount / `all: revert` / no-preflight / prefix / portal+toasts containers → Tasks 3, 10, 15 (ADR-0006).
- shadcn/Radix (Dialog) + cn util → Tasks 10, 11 (ADR-0005).
- React error boundary → Task 12.
- Activation gate (present AND equals key, configurable param) → Tasks 5, 16 (PRD §6.1).
- Self-asserted email identity + localStorage, no verification/send → Tasks 6, 11, 14 (PRD §6.1).
- Typed API client (7 ops, key header, optimistic create + rollback) → Tasks 7, 13.
- `<CommentsLayer/>` peer-React wrapper → Task 17 (ADR-0002).
- Placeholder marker round-trip against live API → Tasks 8, 9, 13, 19 (exit criterion).
- Two-config bundling / dual-React / Tailwind-to-string → Tasks 3, 18 + ADR-0014.
- Throwaway playground + Vitest round-trip; Playwright deferred to M9 → Tasks 9, 19.
- Bundle-size budgets untouched (deferred) → size-limit config left as-is throughout.
