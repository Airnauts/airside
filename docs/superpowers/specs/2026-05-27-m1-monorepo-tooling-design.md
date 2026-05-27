# M1 — Monorepo & Tooling Foundation — Design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-05-27
- **Milestone:** M1 (Infra · S) in [`docs/milestones.md`](../../milestones.md)
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §2 · [`docs/adr.md`](../../adr.md)
- **Track:** Infra. Depends on: nothing. Unblocks: everything (M2 next).

## 1. Goal & scope

A buildable, testable, **empty-shell** monorepo that every later milestone slots
into. No domain logic and no real implementation — M1 proves the *tooling* works
end to end, not the product.

**In scope.** pnpm workspaces; TypeScript project references; tsup (ESM-first)
builds; Biome lint/format; Vitest; a GitHub Actions CI skeleton
(lint · typecheck · test · build · size); the six package shells with their
`package.json` `exports`/subpaths wired; a size-limit bundle-budget harness against
an empty target; Node/pnpm version pins; ADR-0011 recording the tooling stack.

**Out of scope.** Any domain logic; any real implementation; the sample Next.js
app (first appears in M4, full host in M9 — see §10); Tailwind/shadcn wiring (M5);
real bundle-size budgets (M9).

## 2. Decisions made (this milestone)

The architecture (§2) already fixed pnpm workspaces, TypeScript project references,
tsup, and ESM-first. M1 additionally settles:

| Area | Choice | Note |
|---|---|---|
| Task orchestration | **Turborepo** | Vercel-native; dep-aware task graph + caching |
| Lint + format | **Biome** | single fast tool, one config |
| Test runner | **Vitest** | ESM-native; jsdom/RTL-ready; TDD loop for M2+ |
| Bundle-size budget | **size-limit** | brotli budget per entry, runs in CI |
| Module format | **Pure ESM only** | no dual CJS in v1 |
| CI | **GitHub Actions** | live on `Airnauts/commenting-tool` |
| Node / pnpm | **Node 22 / pnpm 10.17** | pinned |

These choices are recorded as **ADR-0011** (added as part of M1; see §9).

## 3. Repo layout

```
commeting-tool/
├── package.json            # private root; packageManager: pnpm@10.17.0; engines.node >=22
├── pnpm-workspace.yaml     # packages/*  (# examples/* reserved, commented — see §10)
├── turbo.json              # task graph: build · typecheck · test · lint · size
├── tsconfig.base.json      # shared strict compiler options
├── tsconfig.json           # solution file: references every package, no files of its own
├── biome.json              # lint + format
├── vitest.workspace.ts     # lists each package as a vitest project
├── .node-version           # 22
├── .nvmrc                  # 22
├── .github/workflows/ci.yml
└── packages/
    ├── core/               # @comments/core
    ├── client/             # @comments/client (+ /react)
    ├── server/             # @comments/server (+ /next)
    ├── adapter-mongo/      # @comments/adapter-mongo
    ├── storage-vercel-blob/# @comments/storage-vercel-blob
    └── storage-fs/         # @comments/storage-fs
```

Each package has the same shape:

```
packages/<name>/
├── package.json     # name, type:module, exports map, scripts
├── tsconfig.json    # extends base; composite; references its deps
├── tsup.config.ts   # entry/entries; format esm; dts false
└── src/
    ├── index.ts        # empty shell export (placeholder)
    └── index.test.ts   # one trivial passing smoke test
```

## 4. Package topology & dependency edges

The edges below drive **both** `package.json` workspace deps **and** TypeScript
`references`.

| Package | depends on | role |
|---|---|---|
| `core` | — | isomorphic leaf; everyone imports it |
| `client` | `core` | widget engine (shell only in M1) |
| `server` | `core` | server core; **defines** the `Repository` / `StorageAdapter` interfaces |
| `adapter-mongo` | `core`, `server` | implements `Repository` |
| `storage-vercel-blob` | `core`, `server` | implements `StorageAdapter` |
| `storage-fs` | `core`, `server` | implements `StorageAdapter` |

No cycles: `server` only *defines* the adapter interfaces; concrete adapters
depend on `server`, never the reverse (they are injected at
`createCommentsServer(...)`).

**Nuance to finalize in M3, not M1:** those interfaces may later move to a
types-only subpath so adapters don't pull `server`'s runtime. For M1 the
project-reference edge `adapter → server` is what matters and is correct either way.

## 5. Build, types & module strategy

**Pure ESM, no dual CJS.** Every package is `"type": "module"`; tsup emits
`format: ["esm"]` only. Node 22 and Next.js consume ESM natively. A CJS build is a
documented later seam, not v1 — this halves the build matrix and avoids the
dual-package hazard.

**Two build tools, clean division of labor** (this avoids two generators racing on
`.d.ts`):

| Tool | Owns | Key config |
|---|---|---|
| `tsc -b` (project references, `composite: true`) | Type-checking **and** `.d.ts` emit | `emitDeclarationOnly: true` per package |
| `tsup` (esbuild) | JS bundling → `dist/*.js` | `dts: false`; workspace `@comments/*` marked **external** |

Both write into the same `dist/` but never the same file (`tsc` → `*.d.ts`, tsup →
`*.js`). They are independent: tsup externalizes workspace deps so it needs none of
their types; `tsc -b` resolves cross-package types through the `references` graph in
§4. Consequently **`typecheck` is a by-product of `tsc -b`** — no separate type pass,
no double dts.

**tsconfig topology (three layers):**

- `tsconfig.base.json` — shared strict options (`strict: true`,
  `moduleResolution: "bundler"`, target, `declaration`, etc.).
- `packages/*/tsconfig.json` — `extends` base; `composite: true`; `rootDir: "src"`,
  `outDir: "dist"`, `emitDeclarationOnly: true`; `references` to its dep packages
  (mirrors §4).
- root `tsconfig.json` — solution file, no own `files`, `references` every package.

## 6. Subpath exports (exit criterion)

Two subpaths must resolve: `@comments/client/react` and `@comments/server/next`.

- **tsup multi-entry** — client `entry: { index: "src/index.ts", react: "src/react.ts" }`;
  server `entry: { index: "src/index.ts", next: "src/next.ts" }`.
- **`package.json` `exports`** with `types` + `import` conditions per subpath:

  ```jsonc
  {
    "name": "@comments/client",
    "type": "module",
    "exports": {
      ".":       { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "./react": { "types": "./dist/react.d.ts", "import": "./dist/react.js" }
    },
    "files": ["dist"]
  }
  ```

- **Resolution smoke test** — a test that actually imports `@comments/client/react`
  and `@comments/server/next` and asserts the exported symbol resolves, so the exit
  criterion is *verified*, not merely configured.

## 7. Dev tooling

**Vitest.** Root `vitest.workspace.ts` lists each package as a project; `pnpm test`
(via Turbo) fans out. Default `environment: "node"`; `client` opts into `"jsdom"`
per-project (and `core`'s fixture corpus will in M2). In M1 each package carries
**one trivial smoke test** that proves the runner executes — these are not TDD
domain tests. TDD discipline (ADR-0010, red → green → refactor) begins in **M2**
with the first real logic; M1 is explicitly "no domain logic."

**Biome.** One root `biome.json` for lint **and** format. We passed on ESLint;
Biome covers the React Hooks rules that matter (`useExhaustiveDependencies`,
`useHookAtTopLevel`) plus its `correctness`/`suspicious`/import-organize groups, so
the practical gap vs. `eslint-plugin-react-hooks` is small. If a later frontend
milestone needs a rule Biome lacks, adding ESLint for the `client` package only is a
contained move.

**size-limit.** Points at `@comments/client`'s built ESM entry (`dist/index.js`),
measuring brotli size. Because the target is an empty shell, the budget is a
**generous placeholder** that passes trivially; the real widget budget is calibrated
in **M9** once React + shadcn are actually bundled. The harness runs in CI now so the
wiring is proven; enforcement-as-a-gate is M9.

## 8. CI & version pinning

**GitHub Actions** — `.github/workflows/ci.yml`, live on the
`Airnauts/commenting-tool` remote:

- pin pnpm 10.17 + Node 22; restore pnpm store + Turbo cache.
- jobs mirror the milestone's `lint · typecheck · test` skeleton, plus build + size:
  `biome ci` → `turbo typecheck` → `turbo test` → `turbo build` → `turbo size`.

**Turborepo interplay.** `turbo.json` (v2 `tasks` key): `build.dependsOn: ["^build"]`
with `outputs: ["dist/**"]`; `typecheck`/`test` depend on upstream builds so a
package's deps are emitted before it is checked. Turbo handles cross-package fan-out
and caching; `tsc -b`'s references handle type-ordering within the typecheck task.

**Version pinning.** `packageManager: "pnpm@10.17.0"` and `engines.node: ">=22"` in
the root `package.json`; `.node-version` and `.nvmrc` both `22`.

## 9. ADR-0011 (deliverable of M1)

Add a new record **ADR-0011 — Monorepo tooling stack** to `docs/adr.md`
(newest-last; do not edit prior records). It captures the choices in §2 — Turborepo,
Biome, Vitest, size-limit, pure-ESM, and the Node 22 / pnpm 10.17 pins — with their
context and consequences. This is the "choose a framework / establish coding
standards" ADR trigger from `CLAUDE.md`.

## 10. examples/ slot (reserved, not built)

A sample Next.js app is planned, but **not in M1**:

- **M1:** `pnpm-workspace.yaml` carries `examples/*` as a **commented** line with a
  note. No app scaffolded — adding one would cross M1's "no real implementation" line.
- **M4:** the first real sample mount appears (its exit criterion: "a sample mount
  deploys to Vercel against Atlas and round-trips a thread").
- **M9:** the full sample host app in `examples/` that Playwright drives end-to-end,
  plus the Vercel + Atlas + Blob dogfood deployment.

M5 develops against M3's in-memory dev server, so no example is forced earlier.

## 11. Exit criteria & verification map

Milestone exit: `pnpm i && pnpm build && pnpm test && pnpm lint` green on empty
packages; subpath exports resolve.

| Exit criterion | Satisfied by |
|---|---|
| `pnpm i` | pnpm workspace + `packageManager` pin |
| `pnpm build` green | tsup (JS) + `tsc -b` (dts) across all six packages via Turbo |
| `pnpm test` green | Vitest smoke test per package |
| `pnpm lint` green | `biome ci` clean on the shells |
| `@comments/client/react` + `@comments/server/next` resolve | `exports` maps + the resolution smoke test (§6) |
| bundle-budget harness exists | size-limit wired against client ESM with a placeholder budget |
| CI skeleton runs | `.github/workflows/ci.yml` green on push |
| tooling decision recorded | ADR-0011 added to `docs/adr.md` |

## 12. Risks & notes

- **TS project references + tsup** is the classic friction point; §5's split
  (`tsc -b` owns types, tsup owns JS, `emitDeclarationOnly` + `external`) is the
  explicit resolution. The exact `turbo.json` task wiring is pinned in the
  implementation plan.
- **Biome rule coverage** for the future frontend is accepted as adequate (§7); the
  fallback (ESLint for `client` only) is contained.
- **Placeholder bundle budget** is intentionally non-binding until M9; do not treat
  the M1 number as a real target.
