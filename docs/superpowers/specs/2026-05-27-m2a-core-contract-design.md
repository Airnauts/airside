# M2a — Core: Domain & HTTP Contract — Design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-05-27
- **Milestone:** M2a (Shared · M) — split out of the original M2 in [`docs/milestones.md`](../../milestones.md)
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §5–§7 · [`docs/adr.md`](../../adr.md) (ADR-0004, ADR-0007, ADR-0008, ADR-0009)
- **Track:** Shared. Depends on: M1. Unblocks: **M3 (backend)** and **M5 (frontend shell)**.

## 1. Goal & scope

`@comments/core` becomes the **frozen, isomorphic contract** both tracks code
against — and nothing else. Pure TypeScript: **no DOM, no I/O**, node test
environment. This is the milestone that *freezes the HTTP contract + anchor
schema* (architecture §2), so once it ships, the backend (M3) and frontend shell
(M5) develop in parallel against it.

**In scope.** Branded ID types; all entity zod schemas (Thread, Comment, Author,
Attachment, captureContext, provenance); the **anchor schema**
(`selectors`/`signals`/`offset`/optional `selection`) + `schemaVersion`; the full
**HTTP contract** as a declarative operation table + per-endpoint request/response
schemas + the error model; **OpenAPI generation** (`buildOpenApiDocument()` + a
static `openapi.json` artifact + a smoke test); **`pageKey` normalization** (pure,
isomorphic, overridable). ADR-0012 recording the contract toolchain + pattern.

**Out of scope — moved to M2b.** The scoring weights, the `score()`/`decide()`
threshold policy, the DOM→`signals` extraction, and the jsdom **fixture corpus**.
M2a *freezes the `signals` shape* those will consume; M2b writes the logic over it.

**Out of scope — other milestones.** Any DOM access (M6); any DB/HTTP I/O, the
`Repository`/`StorageAdapter` interfaces, the cursor codec, request validation, and
serving `/openapi.json` + `/docs` (M3/M4); rate limiting and security enforcement
(M3).

## 2. The M2 split (decision made this milestone)

The original M2 was the only **L** milestone and bundled two semi-independent
bodies of work. It is split so the backend track can start sooner and each spec
stays focused:

- **M2a — Core: domain & HTTP contract · Shared · M** (this spec) — freezes the
  contract + anchor schema. **Unblocks M3 and M5.**
- **M2b — Core: anchoring scoring policy & fixture corpus · Shared · M** — the
  pure scoring weights, threshold policy, DOM→signals extraction, and jsdom
  fixture corpus. Depends on M2a (the frozen `signals` shape). **Unblocks M6 only.**

The backend (M3) needs only the contract + anchor *schema* — it stores anchors
opaquely and never scores them — so the scoring/corpus half is on M6's critical
path alone. Updating `docs/milestones.md` to reflect the split is a deliverable of
this milestone (§14). The split is a roadmap/sequencing change, **not** an ADR.

## 3. Decisions made (this milestone)

ADR-0007 deliberately left the zod version + OpenAPI tool open ("tool chosen to
match the Zod version"); M2a settles it, plus the contract-expression pattern:

| Area | Choice | Note |
|---|---|---|
| Schema/validation lib | **Zod 4** | native `z.toJSONSchema()` + `.meta()` global registry; the 2026 default |
| OpenAPI generation | **zod-openapi 5** (samchungy) | zod-4-native; `createDocument()` emits full OpenAPI 3.1 (paths + auto-registered components via `.meta({ id })`) |
| Contract expression | **Schemas + declarative operation table** | one inspectable artifact drives validation, inferred types, OpenAPI, and (later) M3's router — no framework on the boundary |
| Entity IDs | **Branded string types** | `ThreadId` etc. via Zod 4 `.brand()`; compile-time protection against mixing id kinds across both tracks |
| Thread read shapes | **Two: `ThreadListItem` + `Thread`** | list rows carry the anchor but no embedded comments; the full thread adds comments + capture/provenance |

These are recorded as **ADR-0012** (added during implementation; see §13).

## 4. Module layout of `core/src`

```
core/src/
  ids.ts              # branded id schemas + inferred types
  schemas/
    common.ts         # email, ISO timestamp, pagination envelope
    anchor.ts         # selectors, signals, offset, selection, ANCHOR_SCHEMA_VERSION
    capture.ts        # captureContext, provenance
    comment.ts        # Comment, Author, Attachment
    thread.ts         # Thread (full) + ThreadListItem (no comments), status, anchorState
  contract/
    wire.ts           # frozen wire constants (KEY_HEADER_NAME, …)
    errors.ts         # error-code enum + error response schema
    requests.ts       # per-endpoint body/query/params schemas
    responses.ts      # per-endpoint response schemas
    operations.ts     # the declarative operation-descriptor table
    openapi.ts        # buildOpenApiDocument()
  pageKey.ts          # normalizePageKey() + PageKeyFn type
  index.ts            # public barrel
scripts/
  emit-openapi.ts     # writes the static openapi.json artifact
```

The public barrel (`index.ts`) re-exports the schemas, their inferred types, the
branded ids, the operation table, `buildOpenApiDocument`, the wire constants
(`KEY_HEADER_NAME`), and the `pageKey` helpers — that surface *is* the frozen
contract both tracks import.

## 5. Branded IDs (`ids.ts`)

Each id is a nanoid string branded via Zod 4's native `.brand()`, so `z.infer`
yields a distinct type:

```ts
export const ThreadId     = z.string().min(1).brand<'ThreadId'>()
export const CommentId    = z.string().min(1).brand<'CommentId'>()
export const AuthorId     = z.string().min(1).brand<'AuthorId'>()
export const AttachmentId = z.string().min(1).brand<'AttachmentId'>()
export type ThreadId = z.infer<typeof ThreadId>   // string & { brand }
```

Id *generation* lives server-side (M3); `core` only types them. The wire boundary
parses raw strings into branded types in one place (the request/response schemas).

## 6. Anchor schema (`schemas/anchor.ts`) — the frozen heart

Grounded in the real Vercel `createCommentThread` mutation payloads
([`docs/reference/vercel-comments-payloads.md`](../../reference/vercel-comments-payloads.md))
and ADR-0008. **No `type` discriminator** — the base element anchor is always
present; `selection` is additive.

```ts
export const ANCHOR_SCHEMA_VERSION = 1

Signals = {
  tag: string,                 // lowercased element tag
  role?: string,
  textSnippet?: string,        // capped (~120 chars)
  classes: string[],
  siblingIndex: number,
  ancestorTrail: string[],     // landmark trail, nearest-first
}

Anchor = {
  schemaVersion: number,                 // = ANCHOR_SCHEMA_VERSION at write time
  selectors: [string, string],           // dual: [structuralPath, classPath] (≈ Vercel nodeId)
  signals: Signals,
  offset: { fx: number, fy: number },    // 0..1; (0,0) for a selection

  selection?: {
    start: { selectors: [string, string], textNodeIndex: number, offset: number },
    end:   { selectors: [string, string], textNodeIndex: number, offset: number },
    quote: string,
    prefix: string,
    suffix: string,
  }
}
```

`fx`/`fy` are constrained to `0..1`; `selectors` is a fixed 2-tuple (structural +
class) mirroring the comma-separated dual `nodeId` Vercel emits. **The `signals`
shape is what M2b's scorer will consume** — freezing it here is precisely what
keeps M2b's calibration and M6's runtime extractor in sync.

## 7. Capture & provenance (`schemas/capture.ts`)

```ts
CaptureContext = { viewportW: number, viewportH: number,
                   devicePixelRatio: number, userAgent: string }   // all required
Provenance     = { commitSha?: string, branch?: string, deploymentId?: string }  // optional
```

`CaptureContext` matches the Vercel `screenWidth`/`screenHeight`/
`devicePixelRatio`/`userAgent` fields; `Provenance` matches the
`firstComment.deployment` git-source fields and is supplied via `init()` config.

## 8. Comment, Author, Attachment (`schemas/comment.ts`)

```ts
Author     = { id?: AuthorId, email: Email, name?: string }       // id assigned server-side
Attachment = { id: AttachmentId, url: string, name: string,
               contentType: string, size: number, w?: number, h?: number }
Comment    = { id: CommentId, author: Author, text: string,       // plain text in v1
               attachments: Attachment[], createdAt: IsoTimestamp, editedAt?: IsoTimestamp }
```

`text` is plain (v1); a rich-text `body` is the documented post-v1 seam.

## 9. Thread — two read shapes (`schemas/thread.ts`)

```ts
status      = 'open' | 'resolved'           // independent axis
anchorState = 'anchored' | 'orphaned'

ThreadListItem = {                           // list rows: on-page + panel; NO embedded comments
  id: ThreadId, scope: 'page', pageKey: string | null, pageUrl: string, pageTitle?: string,
  anchor: Anchor, status, anchorState, selectionLost?: boolean,
  commentCount: number, unresolvedCount: number,
  createdBy: Author,                          // one 'who' shape everywhere (see note)
  createdAt, updatedAt, lastActivityAt, schemaVersion,
}

Thread = ThreadListItem & {                  // single thread: adds the heavy fields
  comments: Comment[],
  captureContext: CaptureContext,
  provenance?: Provenance,
}
```

Rationale: the on-page list (`?pageKey=`) and the panel (all-pages) both return
`ThreadListItem[]` — enough to re-match (the anchor is present) and render pins/
rows, without shipping every embedded comment. The full `Thread` (with comments)
comes from `GET /threads/:id` and is what create returns. `scope` + a nullable
`pageKey` are retained as the ADR-0009 global-scope seam. `createdBy` reuses the
`Author` schema so there is a **single "who" shape** across the contract;
`Author.id` is optional in request bodies (the client doesn't know it) and is
**always populated in responses** — M3's responsibility, not a schema variant.

## 10. `pageKey` normalization (`pageKey.ts`)

```ts
normalizePageKey(url: string | URL): string   // origin + pathname; trailing slash
                                               // normalized (except root); hash dropped; query excluded
export type PageKeyFn = (url: string) => string   // the init()/server override hook
```

Pure, isomorphic, byte-identical on client and server. Written test-first (a table
of `url → key` cases) per ADR-0010. The `PageKeyFn` override is the ADR-0009 escape
hatch to collapse several routes into one key.

## 11. Error model (`contract/errors.ts`)

A machine-readable code enum the client switches on, plus the wire shape from
architecture §6:

```ts
ErrorCode = 'VALIDATION_FAILED' | 'AUTH_INVALID_KEY' | 'ORIGIN_NOT_ALLOWED'
          | 'NOT_FOUND' | 'CONFLICT' | 'UPLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'INTERNAL'

ErrorResponse = { error: { code: ErrorCode, message: string, details?: unknown } }
```

Each code maps to its HTTP status (400 / 401 / 403 / 404 / 409 / 413 / 429 / 500)
in the operation table. `details` carries zod's `flatten()` output on
`VALIDATION_FAILED`. Enforcement (returning these) is M3; M2a freezes the vocabulary
and shape.

**Wire constants (`contract/wire.ts`).** The auth header name is part of the frozen
surface, not just OpenAPI prose: `export const KEY_HEADER_NAME = 'x-comments-key'`.
Both M3 (server reads it) and M5 (client sets it) import this one constant rather
than hardcoding the string — and the OpenAPI `securityScheme` (§13) is built from it
too, so all three stay in lockstep. (The *URL parameter* name the client activation
gate checks is a configurable client default and stays an M5 concern, per
architecture §4.)

## 12. The operation table + request/response schemas

`requests.ts` / `responses.ts` hold the per-endpoint schemas; `operations.ts` is
the **single declarative table** that `buildOpenApiDocument()` and (later,
optionally) M3's router both read:

```ts
type Operation = {
  operationId: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string                          // e.g. '/threads/:id/comments'
  summary: string
  params?: ZodObject                    // path params
  query?: ZodObject
  body?: ZodTypeAny | 'multipart'       // JSON body, or the multipart marker for uploads
  success: { status: number, schema: ZodTypeAny }
  errors: ErrorCode[]                   // which codes this op may return
}
```

The **seven data operations** that live in the table (architecture §6):

| operationId | method · path | body / query | success |
|---|---|---|---|
| `createThread` | POST `/threads` | `{pageKey?, pageUrl, pageTitle?, anchor, comment:{text, attachmentIds?}, author, captureContext, provenance?}` | 201 `Thread` |
| `listThreads` | GET `/threads` | query `{pageKey?, status?, sort?='updatedAt', cursor?}` | 200 `{threads: ThreadListItem[], nextCursor: string \| null}` |
| `getThread` | GET `/threads/:id` | — | 200 `Thread` |
| `addComment` | POST `/threads/:id/comments` | `{text, attachmentIds?, author}` | 201 `Comment` |
| `setThreadStatus` | PATCH `/threads/:id` | `{status}` | 200 `Thread` |
| `refreshAnchor` | PATCH `/threads/:id/anchor` | `{selectors?, signals?, anchorState, selectionLost?}` | 200 `ThreadListItem` |
| `uploadAttachment` | POST `/uploads` | `multipart` (binary) | 201 `Attachment` |

Notes that keep the freeze honest:

- **`listThreads` is one polymorphic op** — `?pageKey=` ⇒ the on-page list,
  omitted ⇒ the all-pages panel; both return `ThreadListItem[]`. `sort` is a fixed
  enum (`'updatedAt'`) in v1, leaving room to grow.
- **`cursor` is an opaque `string`** in the contract. Its encode/decode codec is
  server-side and decided in **M3** (so adapters stay interchangeable); `core`
  deliberately does not own it.
- **`uploadAttachment`** is `multipart/form-data`; the binary is not zod-validated
  (size/type checks are server-side → `UPLOAD_TOO_LARGE`). `core` freezes only the
  `Attachment` *response* and the `attachmentIds` reference used by
  `createThread`/`addComment` (the two-step upload, architecture §6).
- **`GET /openapi.json` and `/docs`** (the eighth/ninth §6 endpoints) are **server
  meta-routes (M3/M4)** that serve the artifact `core` produces. They are **not**
  entries in the operation table and the generated document keeps `paths` to the
  seven data operations — self-referential doc/spec routes carry no zod
  request/response and are wired up at serve time by M3/M4, not described in the
  contract.

## 13. OpenAPI generation (`contract/openapi.ts`)

`buildOpenApiDocument()` iterates the operation table →
`createDocument({ openapi: '3.1.0', info, components, security, paths })` (zod-openapi
5). Entity schemas carry `.meta({ id })` so they register as reusable
`components.schemas` `$ref`s. The auth `securityScheme` is built from
`KEY_HEADER_NAME` (§11) — not a duplicated literal — so the docs and the runtime
header agree by construction. `scripts/emit-openapi.ts` writes the static
`openapi.json` artifact for CI/publishing (ADR-0007).

## 14. TDD plan (ADR-0010 — tests precede the code they cover)

`core` is pure, so the red → green → refactor loop is cheap. Authoring order:

1. **`normalizePageKey`** — a table of `url → expected key` cases (trailing slash,
   root path, hash, query, explicit port) written first.
2. **Schema round-trips** — per schema: a valid fixture parses; targeted invalid
   fixtures reject (`fx` > 1, missing required field, wrong-branded id).
3. **Operation-table invariants** — every `path`+`method` pair unique; every code
   in `errors[]` is in the enum; every referenced schema resolves.
4. **Contract completeness** — asserts all seven data operations from architecture
   §6 are present in the table (guards the freeze).
5. **OpenAPI smoke** — `buildOpenApiDocument()` returns a structurally valid
   OpenAPI 3.1 document (validated with an OpenAPI parser), every operation
   present, components registered.

## 15. ADR-0012 (deliverable of M2a)

Add a new record **ADR-0012 — Contract source of truth: Zod 4 + operation table,
OpenAPI via zod-openapi** to `docs/adr.md` (newest-last; do not edit prior
records). It captures the §3 choices — Zod 4 + zod-openapi 5; the
schemas-plus-declarative-operation-table pattern; and branded ID types — with their
context and consequences. This is the "establish a coding standard / pattern" ADR
trigger from `CLAUDE.md`. Following the M1 precedent (ADR-0011), the record is added
*during implementation*, not as part of the brainstorm.

## 16. `milestones.md` edit (deliverable of M2a)

Replace the single **M2** node with **M2a** and **M2b**:

- Dependency graph: the `M2` node becomes `M2a` (← freezes the contract + anchor
  schema) feeding both tracks, with `M2b` on the frontend track as a prerequisite
  of M6.
- Section bodies: an **M2a** section (this scope) and an **M2b** section (scoring
  weights, threshold policy, DOM→signals extraction, jsdom fixture corpus; exit =
  the corpus passes across all mutation classes with documented default thresholds).
- "Depends on" lines: M3 / M4 / M5 → **M2a**; M6 → **M2b** (+ M5).
- The "freezes the HTTP contract + anchor schema" annotation moves to **M2a**; the
  fixture-corpus exit criterion moves to **M2b**.
- The "Suggested sequence" and track-separation notes update from "frozen in M2" to
  "frozen in M2a".

## 17. Exit criteria & verification map

| Exit criterion | Satisfied by |
|---|---|
| Schemas + inferred types + branded IDs exported from `core` | `ids.ts` + `schemas/*` + the `index.ts` barrel |
| `pageKey` normalization works | `normalizePageKey` + its url→key test table (§14.1) |
| Anchor schema + `schemaVersion` frozen | `schemas/anchor.ts` + round-trip tests (§14.2) |
| All seven §6 data endpoints present, request **and** response | the operation table + the contract-completeness test (§14.4) |
| OpenAPI 3.1 doc generates from the schemas | `buildOpenApiDocument()` + the OpenAPI smoke test (§14.5) |
| Static artifact emits | `scripts/emit-openapi.ts` writes `openapi.json` |
| Toolchain/pattern recorded | ADR-0012 added to `docs/adr.md` |
| Roadmap reflects the split | `docs/milestones.md` updated to M2a/M2b |
| `pnpm build && pnpm test && pnpm lint` green | tsup + `tsc -b` + Vitest + Biome across `core` |

## 18. Risks & notes

- **Freeze means freeze.** Once M2a ships, M3 and M5–M8 code against it in
  parallel; changing the contract afterward ripples across both tracks. The
  contract-completeness test (§14.4) and the two-read-shape model (§9) are the
  guards. Response schemas are frozen in *both* directions, not just requests.
- **M2a/M2b boundary.** The `signals` shape (§6) is the contract between the two:
  M2a freezes it, M2b's scorer and M6's extractor both consume it. If M2b discovers
  it needs an extra signal, that is a deliberate `schemaVersion` bump, not a silent
  edit.
- **zod-openapi pinning.** zod-openapi 5 tracks Zod 4's `.meta()`/JSON-Schema
  surface; pin both and treat a major bump as a contract-review event.
- **`getOpenApi`/`/docs` placement.** Intentionally *not* in the validated
  operation table and *not* in the generated document's `paths` — they are server
  meta-routes (M3/M4) that render the `core` artifact, carrying no zod
  request/response.
- **Input/output component twins.** zod-openapi emits a `…Output` component for any
  `.meta({ id })` schema used in **both** a request body and a response (e.g.
  `AnchorOutput`, `AuthorOutput`). With no transforms/defaults in v1 these twins are
  structurally identical to their inputs — expected library behavior, not a defect;
  consumers that codegen from the doc should expect the suffixed duplicates.
