# Extract the React glue into `@airnauts/airside-integration-react` — design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-06-16
- **Topic:** Move the host-facing `<AirsideLayer/>` React wrapper out of the
  `@airnauts/airside-client/react` subpath into a dedicated
  `@airnauts/airside-integration-react` package, and let the Next.js integration
  re-export it. Companion ADR: **ADR-0040**.

---

## 1. Motivation

The server side already separates the framework-agnostic core from its
host-framework integration: `@airnauts/airside-server` (Web `Request → Response`)
→ `@airnauts/airside-server/node` (generic bridge) → `@airnauts/airside-integration-next`
(Next glue). The client side does not — the React host wrapper lives as a
`@airnauts/airside-client/react` **subpath** of the otherwise framework-agnostic
widget engine.

React is to the client what Next is to the server: **one host-framework
integration over a framework-agnostic core.** Promote the wrapper to a sibling
`@airnauts/airside-integration-react` package so the package boundaries express
that, and so non-Next React hosts (Vite, Remix, CRA) depend only on the React
glue — never on a Next-shaped surface.

| Layer | Server side | Client side (after) |
|---|---|---|
| Framework-agnostic core | `airside-server` (Web `Request→Response`) | `airside-client` (vanilla `init()`, bundles its own React) |
| Generic bridge | `airside-server/node` | — |
| Host-framework integration | `airside-integration-next` | **`airside-integration-react`** (new) |
| Next convenience | route handlers (`.`) | `airside-integration-next/client` re-exports the mount |

**Precedent for the Next coupling.** `airside-integration-next`'s Pages Router
glue already builds on a generic bridge package (`@airnauts/airside-server/node`),
so having `airside-integration-next` depend on `@airnauts/airside-integration-react`
and re-export the mount via a `./client` subpath is consistent with the existing
architecture — not a new pattern.

## 2. Decisions (locked in brainstorm)

1. **Step 3 shape — re-export via a `./client` subpath.** `airside-integration-next`
   depends on `airside-integration-react` and re-exports `AirsideLayer` from a new
   `./client` export. Next users get the route handlers and the mount from one
   package; `airside-integration-react` still stands alone for non-Next React hosts.
2. **Clean break — remove `@airnauts/airside-client/react` outright.** No transition
   shim. Pre-1.0, so breaking → minor; the only external consumer is `lear-frontend`,
   which we control. A re-export shim would create a package-level cycle
   (`client/react` → `integration-react` → `client`) and risk the `tsc --build --force`
   ordering races we have hit before — avoided entirely.
3. **React peer dep is `react` only** (not `react-dom`). The wrapper imports just
   `useEffect`; the widget bundles its own `react-dom` for rendering.
4. **Bake `'use client'`** into `airside-integration-react`'s build output, so it is
   drop-in importable from an RSC file. Hosts no longer *need* a hand-written
   `'use client'` wrapper (they still may write one to compute props like `pageKey`).

## 3. Package changes

### 3.1 New: `@airnauts/airside-integration-react` (`packages/integration-react/`)

- **Code.** `src/index.ts` holds `AirsideLayer` + `AirsideLayerProps`, moved verbatim
  from `packages/client/src/react.ts`, importing `airside`, `InitOptions`,
  `AirsideHandle` from `@airnauts/airside-client` (now a normal bare-specifier package
  import, not a sibling relative import). `packageName` → `'@airnauts/airside-integration-react'`.
- **package.json.**
  - `dependencies`: `@airnauts/airside-client: workspace:^`.
  - `peerDependencies`: `react: ^19.0.0` (required — the package *is* React). No
    `react-dom`, no `peerDependenciesMeta` optional block.
  - `devDependencies`: `react`, `react-dom`, `@types/react`, `@types/react-dom`,
    `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`,
    `jsdom`, `@airnauts/airside-core` (transitive types), `tsup`, `vitest` — whatever
    the moved test + build need.
  - `exports`: `.` → `{ types: ./dist/index.d.ts, import: ./dist/index.js }`.
  - `files`, `license`, `publishConfig: { access: public }`, repo metadata — copy the
    shape of an existing publishable package (e.g. `packages/next/package.json`).
  - Build scripts mirror the repo convention: `"build": "tsup && tsc --build --force"`,
    `"typecheck": "tsc --build"`, `"test": "vitest run"`.
- **tsup.config.ts.** Single entry `src/index.ts`; `format: ['esm']`; `dts: false`;
  `platform: 'browser'`; `external: ['react', '@airnauts/airside-client']`;
  `banner: { js: "'use client'" }`; `clean: true`. (Declaration emit comes from
  `tsc --build --force`, per ADR-0023.)
- **tsconfig.json.** Extends `../../tsconfig.base.json`; `jsx: react-jsx`;
  `emitDeclarationOnly`; `rootDir: src` / `outDir: dist`; **no `references`** (each
  package force-builds independently — avoids the cross-package `tsc --build` race).
- **Test.** Move `packages/client/src/react.test.tsx` here as `src/index.test.tsx`,
  updating the expected `packageName` and the import path. It already asserts: the
  component renders to `null`, calls `airside.init`, and exposes `packageName`.
- **README.md.** New, modeled on the other package READMEs (logo banner + tagline +
  install + the `'use client'` usage example).

### 3.2 `@airnauts/airside-client` (breaking)

- Remove the `./react` entry from `exports`.
- Delete `src/react.ts` and `src/react.test.tsx`.
- Remove `react` and `react-dom` from `peerDependencies` and delete the
  `peerDependenciesMeta` block. Keep `react`, `react-dom`, `@types/react`,
  `@types/react-dom` as **devDependencies** — the bundled UI and the RTL component
  tests still need them. Net effect: **`airside-client` becomes a zero-peer-dep
  vanilla package.**
- `tsup.config.ts`: drop the second (`react`) config object from the array, including
  the `external-sibling-widget` esbuild plugin. Only the vanilla `index` config
  remains.
- `README.md`: delete the `## Subpath: @airnauts/airside-client/react` section and the
  `react` / `react-dom` peer-dependency table rows; add a one-line pointer to
  `@airnauts/airside-integration-react`.

### 3.3 `@airnauts/airside-integration-next`

- `dependencies`: add `@airnauts/airside-integration-react: workspace:^`.
- `peerDependencies`: add `react: ^19.0.0` (every Next app already has it).
- New `src/client.ts`:
  `export { AirsideLayer, type AirsideLayerProps } from '@airnauts/airside-integration-react'`.
- `exports`: add `./client` → `{ types: ./dist/client.d.ts, import: ./dist/client.js }`.
- `tsup.config.ts`: convert the single config object into an **array of two** configs,
  mirroring `packages/client/tsup.config.ts` exactly — set `clean: false` on **both**
  entries and move the wipe into the build script (`"build": "rm -rf dist && tsup && tsc
  --build --force"`), so the two configs don't wipe each other's output:
  1. existing server `index` entry (Node, otherwise unchanged), `clean: false`.
  2. new `client` entry: `entry: { client: 'src/client.ts' }`, `platform: 'browser'`,
     `external: ['react', '@airnauts/airside-integration-react']`,
     `banner: { js: "'use client'" }`, `clean: false`.
- **Test.** Add `src/client.test.ts` (or `.tsx`) — a smoke test that
  `AirsideLayer` re-exports through the package surface.
- `README.md`: add a "Client mount" section showing
  `import { AirsideLayer } from '@airnauts/airside-integration-next/client'`.

## 4. Consumer updates (clean break)

- `examples/nextjs-host/app/components/airside-mount.tsx`: import `AirsideLayer` from
  `@airnauts/airside-integration-next/client` (showcases the one-package Next story).
- Root `README.md` (two import sites), `packages/client/README.md`,
  `docs/integration.md`, `docs/milestones.md`: repoint the `AirsideLayer` import at the
  new package (Next docs → `…/integration-next/client`; framework-neutral docs →
  `@airnauts/airside-integration-react`).
- `docs/architecture.md` §2 (package list) and §3 (client architecture): replace the
  "subpath `@airnauts/airside-client/react`" description with the new package; add
  `@airnauts/airside-integration-react` to the monorepo package list.

## 5. Project wiring

- `scripts/check-exports.mjs`: replace the `['@airnauts/airside-client/react', 'packageName']`
  entry with `['@airnauts/airside-integration-react', 'packageName']`. (Optionally also
  add `@airnauts/airside-integration-next/client`; the existing list is already partial,
  so this is not required for the check to pass.)
- `.changeset/config.json`: add `@airnauts/airside-integration-react` to the `fixed`
  group array (12 → 13 packages) so it version-syncs with the rest.
- `pnpm-workspace.yaml`: no change — it already globs `packages/*`.

## 6. ADR

Add **ADR-0040** (status: accepted, date 2026-06-16) to `docs/adr.md` (newest-last):
React host wrapper extracted from the `airside-client/react` subpath into a dedicated
`@airnauts/airside-integration-react` package; the subpath is removed (clean break,
no shim); `airside-integration-next` depends on it and re-exports the mount via a new
`./client` subpath. Context: package boundaries should express that React is a
host-framework integration over the framework-agnostic vanilla `init()` engine,
mirroring the server/`integration-next` split. Consequences: `airside-client` sheds
its React peer deps (now zero-peer-dep); a breaking subpath removal (pre-1.0 → minor,
0.9.0); Next users get route + mount from one package while non-Next React hosts
depend only on the React glue.

## 7. Changesets & release

Per the fixed group, all packages bump together to **0.9.0**. Write user-facing
changeset summaries:

- `@airnauts/airside-client` — **minor**: "Removed the `@airnauts/airside-client/react`
  subpath; the `<AirsideLayer/>` React wrapper now ships as `@airnauts/airside-integration-react`."
- `@airnauts/airside-integration-react` — **minor**: "New package: the `<AirsideLayer/>`
  React wrapper for mounting the widget in any React host."
- `@airnauts/airside-integration-next` — **minor**: "New `@airnauts/airside-integration-next/client`
  export re-exports `AirsideLayer` for Next.js hosts."

(Use the `writing-changesets` skill for the file mechanics.)

## 8. Testing & verification

This is client/glue work, not backend TDD; tests follow architecture §9 (React
Testing Library for the component), with the moved `react.test.tsx` as the executable
spec for `integration-react`.

Verification gate, in order:

1. `pnpm build`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm lint` (`biome ci`) — watch import-order/format after the file moves; this gate
   has broken CI after wide renames before.
5. `pnpm size` — the `airside-client` budget should be unchanged or improve (the `/react`
   entry is gone).
6. `pnpm check:exports` — the new `@airnauts/airside-integration-react` entry resolves and
   `@airnauts/airside-client/react` no longer does.

## 9. Out of scope

- A Next-tailored `<AirsideMount/>` convenience (baked default `endpoint`, etc.) — the
  `./client` re-export is intentionally a thin pass-through; the key stays an explicit
  prop (no `NEXT_PUBLIC_AIRSIDE_KEY` env magic).
- Other host-framework integrations (Vue, Svelte) — designed-in seam, no v1 concrete.
- Renaming the `packages/next/` directory to `packages/integration-next/` for naming
  consistency — orthogonal, not part of this change.
