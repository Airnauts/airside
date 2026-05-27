# M2a — Core: Domain & HTTP Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@comments/core` into the frozen, isomorphic HTTP contract both tracks code against — branded IDs, entity zod schemas, the anchor schema, a declarative operation table, generated OpenAPI 3.1, and pure `pageKey` normalization.

**Architecture:** A single pure-TS package (no DOM, no I/O). All domain shapes are Zod 4 schemas; one declarative `operations` table references them and drives OpenAPI generation (via `zod-openapi` 5) and, later, M3's router. Everything re-exports through one barrel that *is* the frozen surface.

**Tech Stack:** TypeScript 5.7 (ESM, `verbatimModuleSyntax`), **Zod 4**, **zod-openapi 5**, **@scalar/openapi-parser** (dev, OpenAPI 3.1 validation in tests), **tsx** (dev, runs the emit script), Vitest (node env), tsup + `tsc -b`, Biome.

**Source of truth:** [`docs/superpowers/specs/2026-05-27-m2a-core-contract-design.md`](../specs/2026-05-27-m2a-core-contract-design.md) · architecture §5–§7 · ADR-0004/0007/0008/0009.

## Conventions (apply to every task)

- **Biome style:** single quotes, **no semicolons**, 2-space indent, width 100. Write code this way; run `pnpm format` before each commit so `pnpm lint` (`biome ci`) stays green.
- **`verbatimModuleSyntax` is on:** import types with `import type { … }`. Import the zod value with `import { z } from 'zod'`.
- **`noUncheckedIndexedAccess` is on:** indexing arrays / `Record<string, …>` yields `T | undefined`; guard with `?? {}` or narrowing. (Indexing `Record<ErrorCode, number>` with an `ErrorCode` value stays `number`.)
- **Tests are colocated** as `*.test.ts` next to the file. `core`'s tsconfig excludes test files from `tsc`, so type errors in tests won't fail typecheck — keep tests simple and assertion-driven.
- **Per-task verify commands:**
  - one test file: `pnpm --filter @comments/core exec vitest run src/<path>.test.ts`
  - typecheck: `pnpm --filter @comments/core typecheck`
- **Every commit message ends with this trailer** (shown in full in Task 1; abbreviated as "+ trailer" afterward):
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Commit straight to `main` (CLAUDE.md: no feature-branch/PR workflow before beta).

## File structure (locked here)

| File | Responsibility |
|---|---|
| `packages/core/src/pageKey.ts` | `normalizePageKey()` + `PageKeyFn` type |
| `packages/core/src/ids.ts` | branded id schemas + inferred types |
| `packages/core/src/schemas/common.ts` | `Email`, `IsoTimestamp`, `Cursor` |
| `packages/core/src/schemas/anchor.ts` | `Signals`, `Selection`, `Anchor`, `ANCHOR_SCHEMA_VERSION` |
| `packages/core/src/schemas/capture.ts` | `CaptureContext`, `Provenance` |
| `packages/core/src/schemas/comment.ts` | `Author`, `Attachment`, `Comment` |
| `packages/core/src/schemas/thread.ts` | `ThreadStatus`, `AnchorState`, `ThreadListItem`, `Thread` |
| `packages/core/src/contract/errors.ts` | `ERROR_CODES`, `ErrorCode`, `ErrorResponse`, `ERROR_STATUS` |
| `packages/core/src/contract/wire.ts` | `KEY_HEADER_NAME` |
| `packages/core/src/contract/requests.ts` | per-endpoint body/query/param schemas + `UploadForm` |
| `packages/core/src/contract/responses.ts` | `ThreadListResponse` |
| `packages/core/src/contract/operations.ts` | `Operation` type + the `operations` table |
| `packages/core/src/contract/openapi.ts` | `buildOpenApiDocument()` |
| `packages/core/src/index.ts` | public barrel (replaces the M1 placeholder) |
| `packages/core/scripts/emit-openapi.ts` | writes `dist/openapi.json` |

---

### Task 1: Dependencies & package wiring

**Files:**
- Modify: `packages/core/package.json`
- Delete: `packages/core/src/index.test.ts` (M1 placeholder smoke test — replaced by real tests)

- [ ] **Step 1: Add runtime + dev dependencies**

Run:
```bash
pnpm --filter @comments/core add zod@^4 zod-openapi@^5
pnpm --filter @comments/core add -D @scalar/openapi-parser tsx
```
Expected: `packages/core/package.json` gains `dependencies` (`zod`, `zod-openapi`) and `devDependencies` (`@scalar/openapi-parser`, `tsx`); lockfile updates. (tsup auto-externalizes `dependencies`, so `zod`/`zod-openapi` won't be bundled into `dist`.)

- [ ] **Step 2: Add the `emit:openapi` script**

In `packages/core/package.json`, add to `scripts`:
```json
"emit:openapi": "tsx scripts/emit-openapi.ts"
```

- [ ] **Step 3: Remove the M1 placeholder test**

```bash
git rm packages/core/src/index.test.ts
```
(The placeholder `src/index.ts` stays for now; Task 13 rewrites it as the barrel.)

- [ ] **Step 4: Verify install + existing build still works**

Run: `pnpm --filter @comments/core typecheck`
Expected: PASS (placeholder `index.ts` still compiles).

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "M2a: add zod 4 + zod-openapi + dev deps to core" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `pageKey` normalization

**Files:**
- Create: `packages/core/src/pageKey.ts`
- Test: `packages/core/src/pageKey.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizePageKey } from './pageKey'

describe('normalizePageKey', () => {
  it('keeps origin + pathname', () => {
    expect(normalizePageKey('https://x.com/search')).toBe('https://x.com/search')
  })
  it('strips a trailing slash except on root', () => {
    expect(normalizePageKey('https://x.com/a/b/')).toBe('https://x.com/a/b')
    expect(normalizePageKey('https://x.com/')).toBe('https://x.com/')
  })
  it('drops query and hash', () => {
    expect(normalizePageKey('https://x.com/a?q=1#frag')).toBe('https://x.com/a')
  })
  it('preserves the port (part of origin)', () => {
    expect(normalizePageKey('https://x.com:3000/a')).toBe('https://x.com:3000/a')
  })
  it('accepts a URL instance', () => {
    expect(normalizePageKey(new URL('https://x.com/a/'))).toBe('https://x.com/a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/pageKey.test.ts`
Expected: FAIL — cannot find module `./pageKey` / `normalizePageKey` is not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
export type PageKeyFn = (url: string) => string

export function normalizePageKey(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url
  let pathname = u.pathname
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  return `${u.origin}${pathname}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comments/core exec vitest run src/pageKey.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/pageKey.ts packages/core/src/pageKey.test.ts
git commit -m "M2a: pure pageKey normalization" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Branded IDs

**Files:**
- Create: `packages/core/src/ids.ts`
- Test: `packages/core/src/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { AttachmentId, AuthorId, CommentId, ThreadId } from './ids'

describe('branded ids', () => {
  it('parse non-empty strings and return the value', () => {
    expect(ThreadId.parse('3kXLTXxq-P9l')).toBe('3kXLTXxq-P9l')
    expect(CommentId.parse('fpWlAEqHzj96')).toBe('fpWlAEqHzj96')
    expect(AuthorId.parse('a1')).toBe('a1')
    expect(AttachmentId.parse('img1')).toBe('img1')
  })
  it('reject empty strings', () => {
    expect(() => ThreadId.parse('')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/ids.test.ts`
Expected: FAIL — cannot find module `./ids`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod'

export const ThreadId = z.string().min(1).brand<'ThreadId'>()
export type ThreadId = z.infer<typeof ThreadId>

export const CommentId = z.string().min(1).brand<'CommentId'>()
export type CommentId = z.infer<typeof CommentId>

export const AuthorId = z.string().min(1).brand<'AuthorId'>()
export type AuthorId = z.infer<typeof AuthorId>

export const AttachmentId = z.string().min(1).brand<'AttachmentId'>()
export type AttachmentId = z.infer<typeof AttachmentId>
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/ids.test.ts`
Expected: PASS (2 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/ids.ts packages/core/src/ids.test.ts
git commit -m "M2a: branded entity id schemas" -m "+ trailer"
```

---

### Task 4: Common schemas

**Files:**
- Create: `packages/core/src/schemas/common.ts`
- Test: `packages/core/src/schemas/common.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { Cursor, Email, IsoTimestamp } from './common'

describe('common schemas', () => {
  it('Email accepts a valid address and rejects junk', () => {
    expect(Email.parse('a@b.com')).toBe('a@b.com')
    expect(() => Email.parse('nope')).toThrow()
  })
  it('IsoTimestamp accepts an ISO datetime and rejects a plain date', () => {
    expect(IsoTimestamp.parse('2026-05-27T11:47:26.611Z')).toBe('2026-05-27T11:47:26.611Z')
    expect(() => IsoTimestamp.parse('2026-05-27')).toThrow()
  })
  it('Cursor accepts a non-empty opaque string', () => {
    expect(Cursor.parse('eyJ1IjoxfQ')).toBe('eyJ1IjoxfQ')
    expect(() => Cursor.parse('')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/common.test.ts`
Expected: FAIL — cannot find module `./common`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod'

export const Email = z.email().meta({ id: 'Email' })
export type Email = z.infer<typeof Email>

export const IsoTimestamp = z.iso.datetime().meta({ id: 'IsoTimestamp' })
export type IsoTimestamp = z.infer<typeof IsoTimestamp>

// Opaque pagination token — intentionally NOT registered as a named component
// (the spec treats the cursor as an opaque string; its codec lives server-side in M3).
export const Cursor = z.string().min(1)
export type Cursor = z.infer<typeof Cursor>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/common.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/schemas/common.ts packages/core/src/schemas/common.test.ts
git commit -m "M2a: common schemas (Email, IsoTimestamp, Cursor)" -m "+ trailer"
```

---

### Task 5: Anchor schema

**Files:**
- Create: `packages/core/src/schemas/anchor.ts`
- Test: `packages/core/src/schemas/anchor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ANCHOR_SCHEMA_VERSION, Anchor, Signals } from './anchor'

const validSignals = {
  tag: 'button',
  classes: ['flex', 'btn'],
  siblingIndex: 2,
  ancestorTrail: ['main', 'section'],
}

const validAnchor = {
  schemaVersion: ANCHOR_SCHEMA_VERSION,
  selectors: ['body>div:nth-of-type(9)>div', 'body>div.flex>div.flex'] as [string, string],
  signals: validSignals,
  offset: { fx: 0.36, fy: 0.39 },
}

describe('Anchor schema', () => {
  it('parses a valid element anchor', () => {
    expect(Anchor.parse(validAnchor).offset.fx).toBe(0.36)
  })
  it('parses an anchor with an optional selection', () => {
    const withSelection = {
      ...validAnchor,
      offset: { fx: 0, fy: 0 },
      selection: {
        start: { selectors: ['a', 'a.x'] as [string, string], textNodeIndex: 0, offset: 0 },
        end: { selectors: ['a', 'a.x'] as [string, string], textNodeIndex: 0, offset: 6 },
        quote: 'METRIC',
        prefix: '',
        suffix: '',
      },
    }
    expect(Anchor.parse(withSelection).selection?.quote).toBe('METRIC')
  })
  it('rejects an offset outside 0..1', () => {
    expect(() => Anchor.parse({ ...validAnchor, offset: { fx: 1.5, fy: 0 } })).toThrow()
  })
  it('rejects missing signals', () => {
    expect(() => Signals.parse({ tag: 'div' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/anchor.test.ts`
Expected: FAIL — cannot find module `./anchor`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod'

export const ANCHOR_SCHEMA_VERSION = 1

const Selectors = z.tuple([z.string(), z.string()])

export const Signals = z
  .object({
    tag: z.string(),
    role: z.string().optional(),
    textSnippet: z.string().max(120).optional(),
    classes: z.array(z.string()),
    siblingIndex: z.number().int().nonnegative(),
    ancestorTrail: z.array(z.string()),
  })
  .meta({ id: 'Signals' })
export type Signals = z.infer<typeof Signals>

const SelectionEndpoint = z.object({
  selectors: Selectors,
  textNodeIndex: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
})

export const Selection = z
  .object({
    start: SelectionEndpoint,
    end: SelectionEndpoint,
    quote: z.string(),
    prefix: z.string(),
    suffix: z.string(),
  })
  .meta({ id: 'Selection' })
export type Selection = z.infer<typeof Selection>

export const Anchor = z
  .object({
    schemaVersion: z.number().int().positive(),
    selectors: Selectors,
    signals: Signals,
    offset: z.object({ fx: z.number().min(0).max(1), fy: z.number().min(0).max(1) }),
    selection: Selection.optional(),
  })
  .meta({ id: 'Anchor' })
export type Anchor = z.infer<typeof Anchor>
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/anchor.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/schemas/anchor.ts packages/core/src/schemas/anchor.test.ts
git commit -m "M2a: frozen anchor schema (selectors/signals/offset/selection)" -m "+ trailer"
```

---

### Task 6: Capture & provenance

**Files:**
- Create: `packages/core/src/schemas/capture.ts`
- Test: `packages/core/src/schemas/capture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { CaptureContext, Provenance } from './capture'

describe('capture & provenance', () => {
  it('parses a full capture context', () => {
    const ctx = { viewportW: 1713, viewportH: 1262, devicePixelRatio: 1, userAgent: 'Mozilla/5.0' }
    expect(CaptureContext.parse(ctx).viewportW).toBe(1713)
  })
  it('rejects a non-positive viewport', () => {
    expect(() =>
      CaptureContext.parse({ viewportW: 0, viewportH: 1262, devicePixelRatio: 1, userAgent: 'x' }),
    ).toThrow()
  })
  it('treats every provenance field as optional', () => {
    expect(Provenance.parse({})).toEqual({})
    expect(Provenance.parse({ commitSha: 'a9a79', branch: 'dev' }).branch).toBe('dev')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/capture.test.ts`
Expected: FAIL — cannot find module `./capture`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod'

export const CaptureContext = z
  .object({
    viewportW: z.number().int().positive(),
    viewportH: z.number().int().positive(),
    devicePixelRatio: z.number().positive(),
    userAgent: z.string(),
  })
  .meta({ id: 'CaptureContext' })
export type CaptureContext = z.infer<typeof CaptureContext>

export const Provenance = z
  .object({
    commitSha: z.string().optional(),
    branch: z.string().optional(),
    deploymentId: z.string().optional(),
  })
  .meta({ id: 'Provenance' })
export type Provenance = z.infer<typeof Provenance>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/capture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/schemas/capture.ts packages/core/src/schemas/capture.test.ts
git commit -m "M2a: captureContext + provenance schemas" -m "+ trailer"
```

---

### Task 7: Comment, Author, Attachment

**Files:**
- Create: `packages/core/src/schemas/comment.ts`
- Test: `packages/core/src/schemas/comment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { Attachment, Author, Comment } from './comment'

describe('comment schemas', () => {
  it('parses an author (id optional)', () => {
    expect(Author.parse({ email: 'a@b.com' }).email).toBe('a@b.com')
    expect(Author.parse({ id: 'auth1', email: 'a@b.com', name: 'A' }).name).toBe('A')
  })
  it('parses an attachment', () => {
    const a = { id: 'img1', url: 'https://cdn/x.png', name: 'x.png', contentType: 'image/png', size: 1024 }
    expect(Attachment.parse(a).contentType).toBe('image/png')
  })
  it('parses a comment with no attachments', () => {
    const c = {
      id: 'c1',
      author: { email: 'a@b.com' },
      text: 'cz',
      attachments: [],
      createdAt: '2026-05-27T11:47:26.611Z',
    }
    expect(Comment.parse(c).text).toBe('cz')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/comment.test.ts`
Expected: FAIL — cannot find module `./comment`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from 'zod'
import { AttachmentId, AuthorId, CommentId } from '../ids'
import { Email, IsoTimestamp } from './common'

export const Author = z
  .object({ id: AuthorId.optional(), email: Email, name: z.string().optional() })
  .meta({ id: 'Author' })
export type Author = z.infer<typeof Author>

export const Attachment = z
  .object({
    id: AttachmentId,
    url: z.url(),
    name: z.string(),
    contentType: z.string(),
    size: z.number().int().nonnegative(),
    w: z.number().int().positive().optional(),
    h: z.number().int().positive().optional(),
  })
  .meta({ id: 'Attachment' })
export type Attachment = z.infer<typeof Attachment>

export const Comment = z
  .object({
    id: CommentId,
    author: Author,
    text: z.string(),
    attachments: z.array(Attachment),
    createdAt: IsoTimestamp,
    editedAt: IsoTimestamp.optional(),
  })
  .meta({ id: 'Comment' })
export type Comment = z.infer<typeof Comment>
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/comment.test.ts`
Expected: PASS (3 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/schemas/comment.ts packages/core/src/schemas/comment.test.ts
git commit -m "M2a: comment, author, attachment schemas" -m "+ trailer"
```

---

### Task 8: Thread schemas (two read shapes)

**Files:**
- Create: `packages/core/src/schemas/thread.ts`
- Test: `packages/core/src/schemas/thread.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { Thread, ThreadListItem } from './thread'

const base = {
  id: 't1',
  scope: 'page' as const,
  pageKey: 'https://x.com/a',
  pageUrl: 'https://x.com/a',
  anchor: {
    schemaVersion: 1,
    selectors: ['body>div', 'body>div.flex'] as [string, string],
    signals: { tag: 'div', classes: [], siblingIndex: 0, ancestorTrail: [] },
    offset: { fx: 0.1, fy: 0.2 },
  },
  status: 'open' as const,
  anchorState: 'anchored' as const,
  commentCount: 1,
  unresolvedCount: 1,
  createdBy: { email: 'a@b.com' },
  createdAt: '2026-05-27T11:47:26.611Z',
  updatedAt: '2026-05-27T11:47:26.611Z',
  lastActivityAt: '2026-05-27T11:47:26.611Z',
  schemaVersion: 1,
}

describe('thread schemas', () => {
  it('ThreadListItem parses without comments and allows a null pageKey', () => {
    expect(ThreadListItem.parse(base).status).toBe('open')
    expect(ThreadListItem.parse({ ...base, pageKey: null }).pageKey).toBeNull()
  })
  it('Thread requires comments + captureContext', () => {
    const full = {
      ...base,
      comments: [],
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' },
    }
    expect(Thread.parse(full).comments).toEqual([])
    expect(() => Thread.parse(base)).toThrow()
  })
  it('rejects an unknown status', () => {
    expect(() => ThreadListItem.parse({ ...base, status: 'archived' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/thread.test.ts`
Expected: FAIL — cannot find module `./thread`.

- [ ] **Step 3: Write minimal implementation**

> Note: build a `Base` object *without* `.meta()` first, then derive both shapes — this keeps `.extend()` available (calling it after `.meta()` is avoided).

```ts
import { z } from 'zod'
import { ThreadId } from '../ids'
import { Anchor } from './anchor'
import { CaptureContext, Provenance } from './capture'
import { Author, Comment } from './comment'
import { IsoTimestamp } from './common'

export const ThreadStatus = z.enum(['open', 'resolved'])
export type ThreadStatus = z.infer<typeof ThreadStatus>

export const AnchorState = z.enum(['anchored', 'orphaned'])
export type AnchorState = z.infer<typeof AnchorState>

const ThreadBase = z.object({
  id: ThreadId,
  scope: z.literal('page'),
  pageKey: z.string().nullable(),
  pageUrl: z.url(),
  pageTitle: z.string().optional(),
  anchor: Anchor,
  status: ThreadStatus,
  anchorState: AnchorState,
  selectionLost: z.boolean().optional(),
  commentCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  createdBy: Author,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  lastActivityAt: IsoTimestamp,
  schemaVersion: z.number().int().positive(),
})

export const ThreadListItem = ThreadBase.meta({ id: 'ThreadListItem' })
export type ThreadListItem = z.infer<typeof ThreadListItem>

export const Thread = ThreadBase.extend({
  comments: z.array(Comment),
  captureContext: CaptureContext,
  provenance: Provenance.optional(),
}).meta({ id: 'Thread' })
export type Thread = z.infer<typeof Thread>
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/schemas/thread.test.ts`
Expected: PASS (3 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/schemas/thread.ts packages/core/src/schemas/thread.test.ts
git commit -m "M2a: thread schemas (ThreadListItem + Thread)" -m "+ trailer"
```

---

### Task 9: Contract primitives — errors + wire constant

**Files:**
- Create: `packages/core/src/contract/errors.ts`
- Create: `packages/core/src/contract/wire.ts`
- Test: `packages/core/src/contract/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ERROR_CODES, ERROR_STATUS, ErrorResponse } from './errors'
import { KEY_HEADER_NAME } from './wire'

describe('error model', () => {
  it('every code has a mapped HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(typeof ERROR_STATUS[code]).toBe('number')
    }
    expect(ERROR_STATUS.VALIDATION_FAILED).toBe(400)
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429)
  })
  it('ErrorResponse parses the wire shape', () => {
    const e = { error: { code: 'NOT_FOUND', message: 'gone' } }
    expect(ErrorResponse.parse(e).error.code).toBe('NOT_FOUND')
  })
  it('ErrorResponse rejects an unknown code', () => {
    expect(() => ErrorResponse.parse({ error: { code: 'NOPE', message: 'x' } })).toThrow()
  })
})

describe('wire constants', () => {
  it('freezes the auth header name', () => {
    expect(KEY_HEADER_NAME).toBe('x-comments-key')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/contract/errors.test.ts`
Expected: FAIL — cannot find module `./errors` / `./wire`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/contract/wire.ts`:
```ts
export const KEY_HEADER_NAME = 'x-comments-key'
```

`packages/core/src/contract/errors.ts`:
```ts
import { z } from 'zod'

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTH_INVALID_KEY',
  'ORIGIN_NOT_ALLOWED',
  'NOT_FOUND',
  'CONFLICT',
  'UPLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
] as const

export const ErrorCode = z.enum(ERROR_CODES)
export type ErrorCode = z.infer<typeof ErrorCode>

export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' })
export type ErrorResponse = z.infer<typeof ErrorResponse>

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTH_INVALID_KEY: 401,
  ORIGIN_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/contract/errors.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/contract/errors.ts packages/core/src/contract/wire.ts packages/core/src/contract/errors.test.ts
git commit -m "M2a: error code vocabulary + KEY_HEADER_NAME wire constant" -m "+ trailer"
```

---

### Task 10: Request & response schemas

**Files:**
- Create: `packages/core/src/contract/requests.ts`
- Create: `packages/core/src/contract/responses.ts`
- Test: `packages/core/src/contract/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  AddCommentBody,
  CreateThreadBody,
  ListThreadsQuery,
  RefreshAnchorBody,
  SetThreadStatusBody,
  ThreadIdParam,
} from './requests'
import { ThreadListResponse } from './responses'

const anchor = {
  schemaVersion: 1,
  selectors: ['body>div', 'body>div.flex'] as [string, string],
  signals: { tag: 'div', classes: [], siblingIndex: 0, ancestorTrail: [] },
  offset: { fx: 0, fy: 0 },
}

describe('request schemas', () => {
  it('CreateThreadBody requires anchor + first comment + author + capture', () => {
    const body = {
      pageUrl: 'https://x.com/a',
      anchor,
      comment: { text: 'hi' },
      author: { email: 'a@b.com' },
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' },
    }
    expect(CreateThreadBody.parse(body).comment.text).toBe('hi')
    expect(() => CreateThreadBody.parse({ ...body, comment: { text: '' } })).toThrow()
  })
  it('ListThreadsQuery accepts an empty query and a status filter', () => {
    expect(ListThreadsQuery.parse({})).toEqual({})
    expect(ListThreadsQuery.parse({ status: 'resolved', sort: 'updatedAt' }).status).toBe('resolved')
  })
  it('ThreadIdParam parses the id', () => {
    expect(ThreadIdParam.parse({ id: 't1' }).id).toBe('t1')
  })
  it('AddCommentBody / SetThreadStatusBody / RefreshAnchorBody parse', () => {
    expect(AddCommentBody.parse({ text: 'reply', author: { email: 'a@b.com' } }).text).toBe('reply')
    expect(SetThreadStatusBody.parse({ status: 'resolved' }).status).toBe('resolved')
    expect(RefreshAnchorBody.parse({ anchorState: 'orphaned' }).anchorState).toBe('orphaned')
  })
})

describe('response schemas', () => {
  it('ThreadListResponse envelopes items + nullable cursor', () => {
    expect(ThreadListResponse.parse({ threads: [], nextCursor: null }).nextCursor).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/contract/schemas.test.ts`
Expected: FAIL — cannot find module `./requests` / `./responses`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/contract/requests.ts`:
```ts
import { z } from 'zod'
import { AttachmentId, ThreadId } from '../ids'
import { Anchor, Signals } from '../schemas/anchor'
import { CaptureContext, Provenance } from '../schemas/capture'
import { Author } from '../schemas/comment'
import { Cursor } from '../schemas/common'
import { AnchorState, ThreadStatus } from '../schemas/thread'

const Selectors = z.tuple([z.string(), z.string()])

export const CreateThreadBody = z
  .object({
    pageKey: z.string().optional(),
    pageUrl: z.url(),
    pageTitle: z.string().optional(),
    anchor: Anchor,
    comment: z.object({ text: z.string().min(1), attachmentIds: z.array(AttachmentId).optional() }),
    author: Author,
    captureContext: CaptureContext,
    provenance: Provenance.optional(),
  })
  .meta({ id: 'CreateThreadBody' })
export type CreateThreadBody = z.infer<typeof CreateThreadBody>

export const ListThreadsQuery = z
  .object({
    pageKey: z.string().optional(),
    status: ThreadStatus.optional(),
    sort: z.literal('updatedAt').optional(),
    cursor: Cursor.optional(),
  })
  .meta({ id: 'ListThreadsQuery' })
export type ListThreadsQuery = z.infer<typeof ListThreadsQuery>

export const ThreadIdParam = z.object({ id: ThreadId })
export type ThreadIdParam = z.infer<typeof ThreadIdParam>

export const AddCommentBody = z
  .object({
    text: z.string().min(1),
    attachmentIds: z.array(AttachmentId).optional(),
    author: Author,
  })
  .meta({ id: 'AddCommentBody' })
export type AddCommentBody = z.infer<typeof AddCommentBody>

export const SetThreadStatusBody = z.object({ status: ThreadStatus }).meta({ id: 'SetThreadStatusBody' })
export type SetThreadStatusBody = z.infer<typeof SetThreadStatusBody>

export const RefreshAnchorBody = z
  .object({
    selectors: Selectors.optional(),
    signals: Signals.optional(),
    anchorState: AnchorState,
    selectionLost: z.boolean().optional(),
  })
  .meta({ id: 'RefreshAnchorBody' })
export type RefreshAnchorBody = z.infer<typeof RefreshAnchorBody>

// Documentation-only shape for the multipart upload (the binary is validated server-side).
export const UploadForm = z
  .object({
    file: z.string().meta({ override: { type: 'string', format: 'binary' } }),
  })
  .meta({ id: 'UploadForm' })
export type UploadForm = z.infer<typeof UploadForm>
```

`packages/core/src/contract/responses.ts`:
```ts
import { z } from 'zod'
import { ThreadListItem } from '../schemas/thread'

export const ThreadListResponse = z
  .object({
    threads: z.array(ThreadListItem),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ThreadListResponse' })
export type ThreadListResponse = z.infer<typeof ThreadListResponse>
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/contract/schemas.test.ts`
Expected: PASS (5 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/contract/requests.ts packages/core/src/contract/responses.ts packages/core/src/contract/schemas.test.ts
git commit -m "M2a: per-endpoint request + response schemas" -m "+ trailer"
```

---

### Task 11: Operation table

**Files:**
- Create: `packages/core/src/contract/operations.ts`
- Test: `packages/core/src/contract/operations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from './errors'
import { operations } from './operations'

const EXPECTED_IDS = [
  'createThread',
  'listThreads',
  'getThread',
  'addComment',
  'setThreadStatus',
  'refreshAnchor',
  'uploadAttachment',
]

describe('operation table', () => {
  it('contains exactly the seven frozen data operations', () => {
    expect(operations.map((o) => o.operationId).sort()).toEqual([...EXPECTED_IDS].sort())
  })
  it('has a unique method+path per operation', () => {
    const keys = operations.map((o) => `${o.method} ${o.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('only references known error codes', () => {
    for (const op of operations) {
      for (const code of op.errors) {
        expect(ERROR_CODES).toContain(code)
      }
    }
  })
  it('declares a success status + schema for every operation', () => {
    for (const op of operations) {
      expect(op.success.status).toBeGreaterThanOrEqual(200)
      expect(op.success.schema).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/contract/operations.test.ts`
Expected: FAIL — cannot find module `./operations`.

- [ ] **Step 3: Write minimal implementation**

> Note: `params`/`query` are typed `z.ZodObject` because zod-openapi's `requestParams.path`/`query` require an object schema. If your installed Zod build requires an explicit shape arg, use `z.ZodObject<z.ZodRawShape>`.

```ts
import type { z } from 'zod'
import { Attachment, Comment } from '../schemas/comment'
import { Thread, ThreadListItem } from '../schemas/thread'
import type { ErrorCode } from './errors'
import {
  AddCommentBody,
  CreateThreadBody,
  ListThreadsQuery,
  RefreshAnchorBody,
  SetThreadStatusBody,
  ThreadIdParam,
} from './requests'
import { ThreadListResponse } from './responses'

export interface Operation {
  operationId: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  summary: string
  params?: z.ZodObject
  query?: z.ZodObject
  body?: z.ZodType | 'multipart'
  success: { status: number; schema: z.ZodType }
  errors: ErrorCode[]
}

const AUTH_ERRORS: ErrorCode[] = ['AUTH_INVALID_KEY', 'ORIGIN_NOT_ALLOWED', 'RATE_LIMITED']

export const operations: Operation[] = [
  {
    operationId: 'createThread',
    method: 'POST',
    path: '/threads',
    summary: 'Create a thread with its first comment',
    body: CreateThreadBody,
    success: { status: 201, schema: Thread },
    errors: ['VALIDATION_FAILED', ...AUTH_ERRORS],
  },
  {
    operationId: 'listThreads',
    method: 'GET',
    path: '/threads',
    summary: 'List threads on a page (?pageKey=) or across all pages (panel)',
    query: ListThreadsQuery,
    success: { status: 200, schema: ThreadListResponse },
    errors: ['VALIDATION_FAILED', ...AUTH_ERRORS],
  },
  {
    operationId: 'getThread',
    method: 'GET',
    path: '/threads/:id',
    summary: 'Get a single thread with its comments',
    params: ThreadIdParam,
    success: { status: 200, schema: Thread },
    errors: ['NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'addComment',
    method: 'POST',
    path: '/threads/:id/comments',
    summary: 'Add a reply to a thread',
    params: ThreadIdParam,
    body: AddCommentBody,
    success: { status: 201, schema: Comment },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'setThreadStatus',
    method: 'PATCH',
    path: '/threads/:id',
    summary: 'Resolve or reopen a thread',
    params: ThreadIdParam,
    body: SetThreadStatusBody,
    success: { status: 200, schema: Thread },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', ...AUTH_ERRORS],
  },
  {
    operationId: 'refreshAnchor',
    method: 'PATCH',
    path: '/threads/:id/anchor',
    summary: 'Report a re-match result (self-heal the stored anchor)',
    params: ThreadIdParam,
    body: RefreshAnchorBody,
    success: { status: 200, schema: ThreadListItem },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', ...AUTH_ERRORS],
  },
  {
    operationId: 'uploadAttachment',
    method: 'POST',
    path: '/uploads',
    summary: 'Upload an image attachment (multipart)',
    body: 'multipart',
    success: { status: 201, schema: Attachment },
    errors: ['VALIDATION_FAILED', 'UPLOAD_TOO_LARGE', ...AUTH_ERRORS],
  },
]
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/contract/operations.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/contract/operations.ts packages/core/src/contract/operations.test.ts
git commit -m "M2a: declarative operation table (7 data operations)" -m "+ trailer"
```

---

### Task 12: OpenAPI builder + smoke test

**Files:**
- Create: `packages/core/src/contract/openapi.ts`
- Test: `packages/core/src/contract/openapi.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'
import { KEY_HEADER_NAME } from './wire'
import { buildOpenApiDocument } from './openapi'

describe('buildOpenApiDocument', () => {
  it('produces an OpenAPI 3.1 document that validates', async () => {
    const doc = buildOpenApiDocument()
    expect(doc.openapi).toBe('3.1.0')
    const { valid, errors } = await validate(JSON.stringify(doc))
    expect(errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  it('exposes every frozen path + method', () => {
    const doc = buildOpenApiDocument()
    const paths = doc.paths ?? {}
    expect(Object.keys(paths).sort()).toEqual(
      ['/threads', '/threads/{id}', '/threads/{id}/comments', '/threads/{id}/anchor', '/uploads'].sort(),
    )
    expect(paths['/threads']?.post).toBeDefined()
    expect(paths['/threads']?.get).toBeDefined()
    expect(paths['/threads/{id}']?.patch).toBeDefined()
  })

  it('registers component schemas and the key-header security scheme', () => {
    const doc = buildOpenApiDocument()
    const schemas = doc.components?.schemas ?? {}
    expect(Object.keys(schemas)).toEqual(expect.arrayContaining(['Thread', 'Anchor', 'Signals']))
    const scheme = doc.components?.securitySchemes?.commentsKey
    expect(scheme).toMatchObject({ type: 'apiKey', in: 'header', name: KEY_HEADER_NAME })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/contract/openapi.test.ts`
Expected: FAIL — cannot find module `./openapi`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { type ZodOpenApiOperationObject, type ZodOpenApiPathsObject, createDocument } from 'zod-openapi'
import { ERROR_STATUS, ErrorResponse } from './errors'
import { operations } from './operations'
import { UploadForm } from './requests'
import { KEY_HEADER_NAME } from './wire'

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

export function buildOpenApiDocument() {
  const paths: ZodOpenApiPathsObject = {}

  for (const op of operations) {
    const responses: ZodOpenApiOperationObject['responses'] = {
      [String(op.success.status)]: {
        description: `${op.operationId} success`,
        content: { 'application/json': { schema: op.success.schema } },
      },
    }
    for (const code of op.errors) {
      responses[String(ERROR_STATUS[code])] = {
        description: code,
        content: { 'application/json': { schema: ErrorResponse } },
      }
    }

    const operation: ZodOpenApiOperationObject = {
      operationId: op.operationId,
      summary: op.summary,
      responses,
    }
    if (op.params || op.query) {
      operation.requestParams = {}
      if (op.params) operation.requestParams.path = op.params
      if (op.query) operation.requestParams.query = op.query
    }
    if (op.body === 'multipart') {
      operation.requestBody = { content: { 'multipart/form-data': { schema: UploadForm } } }
    } else if (op.body) {
      operation.requestBody = { content: { 'application/json': { schema: op.body } } }
    }

    const openApiPath = toOpenApiPath(op.path)
    const method = op.method.toLowerCase() as 'get' | 'post' | 'patch'
    paths[openApiPath] = { ...(paths[openApiPath] ?? {}), [method]: operation }
  }

  return createDocument({
    openapi: '3.1.0',
    info: { title: 'Comments API', version: '1.0.0' },
    components: {
      securitySchemes: {
        commentsKey: { type: 'apiKey', in: 'header', name: KEY_HEADER_NAME },
      },
    },
    security: [{ commentsKey: [] }],
    paths,
  })
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/contract/openapi.test.ts`
Expected: PASS (3 tests). If the validator reports unresolved `$ref`s, confirm every `.meta({ id })` schema used in an operation is exported/imported (a missing import is the usual cause).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/contract/openapi.ts packages/core/src/contract/openapi.test.ts
git commit -m "M2a: generate + validate OpenAPI 3.1 from the operation table" -m "+ trailer"
```

---

### Task 13: Public barrel

**Files:**
- Modify (replace placeholder): `packages/core/src/index.ts`
- Test: `packages/core/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  ANCHOR_SCHEMA_VERSION,
  Anchor,
  KEY_HEADER_NAME,
  ThreadId,
  buildOpenApiDocument,
  normalizePageKey,
  operations,
} from './index'

describe('@comments/core public surface', () => {
  it('re-exports the frozen contract entry points', () => {
    expect(typeof normalizePageKey).toBe('function')
    expect(typeof buildOpenApiDocument).toBe('function')
    expect(ANCHOR_SCHEMA_VERSION).toBe(1)
    expect(KEY_HEADER_NAME).toBe('x-comments-key')
    expect(Array.isArray(operations)).toBe(true)
    expect(ThreadId.parse('t1')).toBe('t1')
    expect(Anchor).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/core exec vitest run src/index.test.ts`
Expected: FAIL — the named exports don't exist on the placeholder `index.ts`.

- [ ] **Step 3: Replace `index.ts` with the barrel**

```ts
export * from './ids'
export * from './pageKey'
export * from './schemas/common'
export * from './schemas/anchor'
export * from './schemas/capture'
export * from './schemas/comment'
export * from './schemas/thread'
export * from './contract/wire'
export * from './contract/errors'
export * from './contract/requests'
export * from './contract/responses'
export * from './contract/operations'
export * from './contract/openapi'
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @comments/core exec vitest run src/index.test.ts`
Expected: PASS (1 test).
Run: `pnpm --filter @comments/core typecheck`
Expected: PASS (no duplicate-export errors — every exported name is unique across modules).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "M2a: public barrel exporting the frozen contract surface" -m "+ trailer"
```

---

### Task 14: `emit-openapi` artifact script

**Files:**
- Create: `packages/core/scripts/emit-openapi.ts`

- [ ] **Step 1: Write the script**

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApiDocument } from '../src/index'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = resolve(here, '../dist/openapi.json')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
console.log(`wrote ${outFile}`)
```

- [ ] **Step 2: Run the script**

Run: `pnpm --filter @comments/core emit:openapi`
Expected: prints `wrote …/packages/core/dist/openapi.json`.

- [ ] **Step 3: Verify the artifact is valid JSON describing OpenAPI 3.1**

Run: `node -e "const d=require('./packages/core/dist/openapi.json'); if(d.openapi!=='3.1.0') throw new Error('bad'); console.log('ok', Object.keys(d.paths).length, 'paths')"`
Expected: `ok 5 paths`.
(The file lives under the already-gitignored `dist/`, so it is a generated artifact — do not commit it.)

- [ ] **Step 4: Commit**

```bash
pnpm format
git add packages/core/scripts/emit-openapi.ts
git commit -m "M2a: emit static openapi.json artifact" -m "+ trailer"
```

---

### Task 15: ADR-0012 + full-suite verification

**Files:**
- Modify: `docs/adr.md` (append ADR-0012, newest-last; do not edit prior records)

- [ ] **Step 1: Append ADR-0012 to `docs/adr.md`**

Add at the end of the file:

```markdown

## ADR-0012 — Contract source of truth: Zod 4 + operation table, OpenAPI via zod-openapi

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** M2a freezes the HTTP contract that is the only coupling between client
and server (ADR-0001) and the single source that also generates OpenAPI (ADR-0007).
ADR-0007 deliberately left the Zod version and OpenAPI tool open ("tool chosen to
match the Zod version"). Both tracks import these schemas, so the expression of the
contract — and the way components are registered for OpenAPI — must be settled once.

**Decision.**
- **Zod 4** is the schema/validation library (native `z.toJSONSchema()` + `.meta()`
  global registry; the current default).
- **zod-openapi 5** (samchungy) generates the OpenAPI 3.1 document; entity schemas
  carry `.meta({ id })` to register as reusable components, and `createDocument`
  assembles paths from the operation table.
- The contract is expressed as **Zod schemas + a declarative `operations` table**
  (plain data referencing the schemas). One artifact drives runtime validation,
  inferred types, OpenAPI generation, and — later — M3's router; no contract
  framework is placed on the boundary.
- **Branded ID types** (`ThreadId`, `CommentId`, `AuthorId`, `AttachmentId`) via
  Zod 4 `.brand()` prevent cross-mixing id kinds across both tracks.
- A single **`KEY_HEADER_NAME`** constant (`x-comments-key`) is the shared source
  for the client header, the server check, and the OpenAPI security scheme.

**Consequences.**
- Docs, validation, types, and routing share one source and cannot drift.
- zod-openapi 5 tracks Zod 4's `.meta()`/JSON-Schema surface; both are pinned and a
  major bump is treated as a contract-review event.
- Branded ids cost a small cast at the wire boundary, paid once where raw strings
  are parsed into branded types.
- The operation table is a lightweight, framework-free convention M3 is expected
  (but not forced) to consume for routing + validation.
```

- [ ] **Step 2: Run the full core test suite**

Run: `pnpm --filter @comments/core test`
Expected: PASS — every `*.test.ts` green (pageKey, ids, common, anchor, capture, comment, thread, errors, schemas, operations, openapi, index).

- [ ] **Step 3: Build, typecheck, and lint the whole repo**

Run: `pnpm build`
Expected: PASS (tsup emits `dist/*.js`, `tsc -b` emits `*.d.ts` for all packages).
Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm format && pnpm lint`
Expected: `biome ci` clean.

- [ ] **Step 4: Confirm the built package surface resolves**

Run: `pnpm check:exports`
Expected: PASS (the M1 export-resolution check still green with the real barrel).

- [ ] **Step 5: Commit**

```bash
git add docs/adr.md
git commit -m "M2a: record ADR-0012 (contract toolchain + operation-table pattern)" -m "+ trailer"
```

---

## Self-review (completed during planning)

**Spec coverage** — every M2a spec section maps to a task: branded IDs §5→T3; anchor §6→T5; capture/provenance §7→T6; comment/author/attachment §8→T7; thread two-read-shapes §9→T8; pageKey §10→T2; error model §11→T9; wire constant §11→T9; operation table + 7 ops §12→T10/T11; OpenAPI gen §13→T12; barrel §4→T13; emit artifact §13→T14; ADR-0012 §15→T15; TDD authoring order §14→task ordering. The `milestones.md` split (§16) already landed during the brainstorm commit, so it is intentionally not a task here.

**Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has expected output.

**Type consistency** — names are stable across tasks: `normalizePageKey`/`PageKeyFn` (T2), the four `*Id` schemas (T3), `Signals`/`Anchor`/`ANCHOR_SCHEMA_VERSION` (T5), `CaptureContext`/`Provenance` (T6), `Author`/`Attachment`/`Comment` (T7), `ThreadStatus`/`AnchorState`/`ThreadListItem`/`Thread` (T8), `ERROR_CODES`/`ErrorCode`/`ErrorResponse`/`ERROR_STATUS`/`KEY_HEADER_NAME` (T9), the request/response schema names (T10), `Operation`/`operations` (T11), `buildOpenApiDocument` (T12) — all consumed downstream exactly as defined.

**Known fragile point** — `Operation.params`/`query` typed `z.ZodObject`: if the installed Zod build requires an explicit shape arg, use `z.ZodObject<z.ZodRawShape>` (noted in T11). If the `@scalar/openapi-parser` `validate()` return field names differ in the installed version, the smoke test reads `{ valid, errors }` per its documented API; adjust the destructure if the version differs.
