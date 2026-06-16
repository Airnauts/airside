# `@airnauts/airside-integration-react` Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the host-facing `<AirsideLayer/>` React wrapper out of the `@airnauts/airside-client/react` subpath into a dedicated `@airnauts/airside-integration-react` package; remove the subpath (clean break); have `@airnauts/airside-integration-next` re-export the mount via a new `./client` subpath.

**Architecture:** Mirror the server-side split (`airside-server` core → `airside-integration-next` host integration) on the client side: `airside-client` stays the framework-agnostic vanilla `init()` engine, and React becomes a host-framework integration package over it. `airside-client` sheds its React peer deps and becomes zero-peer-dep. `integration-next` depends on `integration-react` and re-exports `AirsideLayer` so Next users get route + mount from one package.

**Tech Stack:** pnpm workspaces, tsup (esbuild) builds + `tsc --build --force` for `.d.ts`, Vitest + React Testing Library (jsdom), Biome (lint), Changesets (release), Turbo (task graph).

**Spec:** `docs/superpowers/specs/2026-06-16-integration-react-extraction-design.md`

---

## Environment note (read first)

This work spans four packages, so the worktree must resolve `@airnauts/*` to its **own** built `dist`, not the main checkout's. The worktree's `node_modules` are symlinked to main by default, which hides cross-package source edits. After creating the new package's `package.json` (Task 1), run `pnpm install` from the worktree root once — that materializes real `node_modules` and links the new workspace package. If a later build still picks up stale cross-package output, rebuild in dependency order with `pnpm build` (Turbo orders core → client → integration-react → integration-next topologically).

Run every command from the worktree root: `/Users/mateuszpaulski/Projects/commeting-tool/.claude/worktrees/react-refactor`.

## File structure

**Created (`packages/integration-react/`):**
- `package.json` — new publishable package manifest.
- `tsconfig.json` — extends base, no project `references`.
- `tsup.config.ts` — single browser entry, `react` + `@airnauts/airside-client` external, `'use client'` banner.
- `vitest.config.ts` — react plugin + jsdom + test-setup.
- `src/test-setup.ts` — jsdom shims (copied from client).
- `src/index.ts` — `AirsideLayer` + `AirsideLayerProps` (moved from `client/src/react.ts`).
- `src/index.test.tsx` — moved component test.
- `README.md`, `LICENSE`.

**Created (`packages/next/`):**
- `src/client.ts` — re-exports `AirsideLayer` from `integration-react`.
- `src/client.test.ts` — re-export smoke test.

**Modified:**
- `packages/client/package.json` — drop `./react` export + react/react-dom peer deps.
- `packages/client/tsup.config.ts` — drop the react entry + esbuild plugin.
- `packages/client/README.md` — drop the subpath section + peer rows.
- `packages/next/package.json` — add `integration-react` dep, `react` peer, `./client` export.
- `packages/next/tsup.config.ts` — two-config array (server + client).
- `packages/next/README.md` — add client-mount section.
- `examples/nextjs-host/app/components/airside-mount.tsx` — repoint import.
- `README.md`, `docs/integration.md`, `docs/milestones.md`, `docs/architecture.md` — repoint imports + package list.
- `scripts/check-exports.mjs` — swap the `/react` entry for the new package.
- `.changeset/config.json` — add new package to the `fixed` group.
- `docs/adr.md` — add ADR-0040.
- `.changeset/*.md` — three changeset files.

**Deleted:**
- `packages/client/src/react.ts`, `packages/client/src/react.test.tsx`.

---

## Task 1: Scaffold `@airnauts/airside-integration-react` and move the wrapper

This is an **extract (move)**: the wrapper and its test already exist and pass in `airside-client`; they travel together into the new package. The moved test is the executable spec — build the package, run the test, expect PASS.

**Files:**
- Create: `packages/integration-react/package.json`
- Create: `packages/integration-react/tsconfig.json`
- Create: `packages/integration-react/tsup.config.ts`
- Create: `packages/integration-react/vitest.config.ts`
- Create: `packages/integration-react/src/test-setup.ts`
- Create: `packages/integration-react/src/index.ts`
- Create: `packages/integration-react/src/index.test.tsx`
- Create: `packages/integration-react/README.md`, `packages/integration-react/LICENSE`

- [ ] **Step 1: Create `packages/integration-react/package.json`**

```json
{
  "name": "@airnauts/airside-integration-react",
  "version": "0.8.1",
  "description": "React mount (<AirsideLayer/>) for embedding the Airside commenting widget in any React host.",
  "keywords": [
    "comments",
    "commenting",
    "annotations",
    "feedback",
    "airnauts",
    "react",
    "widget"
  ],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/airside#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/airside.git",
    "directory": "packages/integration-react"
  },
  "bugs": {
    "url": "https://github.com/Airnauts/airside/issues"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/.tsbuildinfo",
    "README.md",
    "LICENSE"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup && tsc --build --force",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@airnauts/airside-client": "workspace:^"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^26.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/integration-react/tsconfig.json`**

```json
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
  "exclude": ["dist", "node_modules", "src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

- [ ] **Step 3: Create `packages/integration-react/tsup.config.ts`**

The wrapper uses the **host's** React (external) and imports the built widget via the bare `@airnauts/airside-client` specifier (external — resolved at runtime). The `'use client'` banner makes the built module drop-in importable from an RSC file.

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  platform: 'browser',
  external: ['react', '@airnauts/airside-client'],
  banner: { js: "'use client'" },
  clean: true,
})
```

- [ ] **Step 4: Create `packages/integration-react/vitest.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'integration-react',
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 5: Create `packages/integration-react/src/test-setup.ts`**

The component test boots the full widget (Radix UI), so jsdom needs the same shims `airside-client` uses. Copy them verbatim:

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

for (const method of [
  'hasPointerCapture',
  'setPointerCapture',
  'releasePointerCapture',
  'scrollIntoView',
] as const) {
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

- [ ] **Step 6: Create `packages/integration-react/src/index.ts`**

Moved from `client/src/react.ts`; the only changes are the import specifier (`./index` → `@airnauts/airside-client`) and the `packageName` value.

```ts
import { useEffect } from 'react'
import { type AirsideHandle, airside, type InitOptions } from '@airnauts/airside-client'

export const packageName = '@airnauts/airside-integration-react'

export type AirsideLayerProps = Omit<InitOptions, 'key'> & {
  /** The secret key (React reserves the `key` prop name, so it is `airsideKey` here). */
  airsideKey: string
}

/** Thin wrapper for React hosts: calls airside.init() in an effect and tears down on unmount. */
export function AirsideLayer({ airsideKey, ...rest }: AirsideLayerProps): null {
  // Re-init only on connection-identity change (key/endpoint/keyParam), not on every
  // prop-object change — intentionally narrower than exhaustive deps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connection-scoped deps by design
  useEffect(() => {
    let handle: AirsideHandle | null = null
    let cancelled = false
    airside.init({ key: airsideKey, ...rest }).then((h) => {
      if (cancelled) h.destroy()
      else handle = h
    })
    return () => {
      cancelled = true
      handle?.destroy()
    }
  }, [airsideKey, rest.endpoint, rest.keyParam])
  return null
}
```

- [ ] **Step 7: Create `packages/integration-react/src/index.test.tsx`**

Moved from `client/src/react.test.tsx`; import path and `packageName` expectation updated.

```tsx
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AirsideLayer, packageName } from './index'

describe('@airnauts/airside-integration-react', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    history.replaceState({}, '', '/?airside-key=secret')
  })
  afterEach(() => history.replaceState({}, '', '/'))

  it('exposes its package name', () => {
    expect(packageName).toBe('@airnauts/airside-integration-react')
  })

  it('mounts the widget on render and removes it on unmount', async () => {
    const { unmount } = render(<AirsideLayer airsideKey="secret" endpoint="http://x" />)
    // init() is async; wait for the mount to land.
    await waitFor(() => expect(document.querySelector('[data-airside-root]')).not.toBeNull())
    unmount()
    expect(document.querySelector('[data-airside-root]')).toBeNull()
  })
})
```

- [ ] **Step 8: Create `packages/integration-react/README.md`**

```markdown
<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
  <h1 align="center">
Embeddable Commenting Tool
</h1>
</p>

# @airnauts/airside-integration-react

The `<AirsideLayer/>` React mount for [Airside](https://github.com/Airnauts/airside). Drop it anywhere in a React tree to embed the commenting widget; it calls `airside.init()` on mount and tears down on unmount. The widget bundles its own React, so this wrapper only needs the host's `react` as a peer.

## Installation

```bash
pnpm add @airnauts/airside-integration-react react
```

## Usage

The built module ships a `'use client'` banner, so you can render it directly in a React Server Component tree:

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-react'

export function App() {
  return <AirsideLayer airsideKey={process.env.NEXT_PUBLIC_AIRSIDE_KEY!} endpoint="/api/airside" />
}
```

`init()`'s activation gate keeps the widget inert until the page is opened once with `?airside-key=…`, so `<AirsideLayer/>` can render unconditionally. The `key` prop name is reserved by React, so the secret is passed as `airsideKey`; every other [`init()` option](https://github.com/Airnauts/airside/blob/main/packages/client/README.md) (`endpoint`, `pageKey`, `features`, …) is accepted as-is.

> **Next.js:** `@airnauts/airside-integration-next` re-exports `AirsideLayer` from `@airnauts/airside-integration-next/client`, so a Next app can install a single package for both the API route and the mount.
```

- [ ] **Step 9: Copy the LICENSE file**

Run: `cp packages/client/LICENSE packages/integration-react/LICENSE`

- [ ] **Step 10: Install + link the new workspace package**

Run: `pnpm install`
Expected: completes; `node_modules/@airnauts/airside-integration-react` links to `packages/integration-react`. (This also materializes real worktree `node_modules` per the Environment note.)

- [ ] **Step 11: Build the new package and verify the `'use client'` banner**

Use Turbo (not `pnpm --filter … build`) so `airside-client` is built first via `^build` — the worktree has no pre-existing `dist/`.

Run: `pnpm exec turbo run build --filter=@airnauts/airside-integration-react`
Expected: PASS; `airside-core` → `airside-client` → `integration-react` build in order.

Run: `head -1 packages/integration-react/dist/index.js`
Expected: the first line is `'use client'`.

- [ ] **Step 12: Run the moved test**

Run: `pnpm exec turbo run test --filter=@airnauts/airside-integration-react`
Expected: PASS — both `exposes its package name` and `mounts the widget on render and removes it on unmount`. (`test` `dependsOn ^build`, so the built `airside-client` is on disk.)

- [ ] **Step 13: Commit**

```bash
git add packages/integration-react
git commit -m "feat(integration-react): new package with the AirsideLayer React mount"
```

---

## Task 2: Remove the `/react` subpath from `airside-client` (clean break)

**Files:**
- Delete: `packages/client/src/react.ts`, `packages/client/src/react.test.tsx`
- Modify: `packages/client/package.json`
- Modify: `packages/client/tsup.config.ts`
- Modify: `packages/client/README.md`

- [ ] **Step 1: Delete the wrapper and its test**

Run: `git rm packages/client/src/react.ts packages/client/src/react.test.tsx`

- [ ] **Step 2: Remove the `./react` export from `packages/client/package.json`**

Replace the `exports` block:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "import": "./dist/react.js"
    }
  },
```

with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
```

- [ ] **Step 3: Remove the React peer deps from `packages/client/package.json`**

Delete these two blocks entirely (the `peerDependencies` and `peerDependenciesMeta` objects):

```json
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    },
    "react-dom": {
      "optional": true
    }
  },
```

Leave `react`, `react-dom`, `@types/react`, `@types/react-dom` in `devDependencies` untouched — the bundled widget UI and the RTL component tests still need them.

- [ ] **Step 4: Simplify `packages/client/tsup.config.ts`**

Replace the whole file with the single vanilla entry (drop the second config object and the `external-sibling-widget` esbuild plugin):

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  // Vanilla widget: self-contained, bundles its OWN React + all UI deps.
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  noExternal: [/.*/],
  splitting: false, // keep createRoot in index.js (dynamic import('./app/mount') must not split)
  clean: false, // the `build` script does `rm -rf dist` once, before tsup
})
```

- [ ] **Step 5: Update `packages/client/README.md`**

Make three edits:

1. Remove the React-peer install note (lines ~20-22):

```markdown
# React host apps also need the optional peer:
pnpm add react react-dom
```

2. Replace the usage example that imports the subpath (line ~31):

```markdown
import { AirsideLayer } from '@airnauts/airside-client/react'
```

with a pointer line:

```markdown
// The React mount now ships separately — see @airnauts/airside-integration-react.
```

3. Delete the entire `## Subpath: `@airnauts/airside-client/react`` section (from its heading through its code block) and the two peer-dependency table rows:

```markdown
| `react` | Optional (^19.0.0) | Only needed for `@airnauts/airside-client/react` |
| `react-dom` | Optional (^19.0.0) | Only needed for `@airnauts/airside-client/react` |
```

Add one sentence near the top pointing readers to `@airnauts/airside-integration-react` for the React mount.

- [ ] **Step 6: Rebuild and test `airside-client`**

Run: `pnpm exec turbo run build test size --filter=@airnauts/airside-client`
Expected: PASS. After it, `packages/client/dist/react.js` and `dist/react.d.ts` no longer exist (the `rm -rf dist` + single-entry build dropped them), the old `react.test.tsx` is gone with no dangling references, and `size` is within the 300 kB budget (unchanged or smaller).

- [ ] **Step 7: Rebuild `integration-react` against the changed client**

Run: `pnpm exec turbo run test --filter=@airnauts/airside-integration-react`
Expected: PASS — confirms the new package still mounts against the rebuilt client. (Turbo rebuilds `airside-client` first because its source changed.)

- [ ] **Step 8: Commit**

```bash
git add packages/client
git commit -m "feat(client)!: remove the /react subpath; client is now zero-peer-dep

BREAKING: <AirsideLayer/> moved to @airnauts/airside-integration-react."
```

---

## Task 3: Re-export the mount from `airside-integration-next` via `./client`

**Files:**
- Create: `packages/next/src/client.ts`
- Create: `packages/next/src/client.test.ts`
- Modify: `packages/next/package.json`
- Modify: `packages/next/tsup.config.ts`
- Modify: `packages/next/README.md`

- [ ] **Step 1: Write the failing test `packages/next/src/client.test.ts`**

The `next` package's Vitest runs in the **node** environment, so this is a pure surface check — assert the re-export is wired without rendering.

```ts
import { describe, expect, it } from 'vitest'
import { AirsideLayer } from './client'

describe('@airnauts/airside-integration-next/client', () => {
  it('re-exports AirsideLayer', () => {
    expect(typeof AirsideLayer).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec turbo run test --filter=@airnauts/airside-integration-next`
Expected: FAIL — `Cannot find module './client'` (the file does not exist yet).

- [ ] **Step 3: Create `packages/next/src/client.ts`**

```ts
export { AirsideLayer, type AirsideLayerProps } from '@airnauts/airside-integration-react'
```

- [ ] **Step 4: Add the dependency, peer dep, and `./client` export to `packages/next/package.json`**

Add to `dependencies` (alongside `@airnauts/airside-server`):

```json
    "@airnauts/airside-integration-react": "workspace:^"
```

Add a `peerDependencies` block (Next apps always have React):

```json
  "peerDependencies": {
    "react": "^19.0.0"
  },
```

Replace the `exports` block:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
```

with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.js"
    }
  },
```

- [ ] **Step 5: Convert `packages/next/tsup.config.ts` to a two-config array**

The server `index` entry stays Node; the new `client` entry is a browser module with the `'use client'` banner. Both set `clean: false`, and the wipe moves into the build script (mirrors `packages/client`).

```ts
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Server route handlers (App + Pages Router). Node-side, no React.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    clean: false,
  },
  {
    // Client mount re-export. Browser module; ships 'use client' so it can be
    // imported from an RSC tree. React + the React package stay external.
    entry: { client: 'src/client.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    platform: 'browser',
    external: ['react', '@airnauts/airside-integration-react'],
    banner: { js: "'use client'" },
    clean: false,
  },
])
```

- [ ] **Step 6: Move the dist wipe into the build script in `packages/next/package.json`**

Replace:

```json
    "build": "tsup && tsc --build --force",
```

with:

```json
    "build": "rm -rf dist && tsup && tsc --build --force",
```

- [ ] **Step 7: Install the new dependency**

Run: `pnpm install`
Expected: completes; `@airnauts/airside-integration-react` linked into `packages/next/node_modules`.

- [ ] **Step 8: Build and verify the client banner**

Run: `pnpm exec turbo run build --filter=@airnauts/airside-integration-next`
Expected: PASS (Turbo builds `integration-react` first via `^build`); `dist/index.js` and `dist/client.js` both emitted.

Run: `head -1 packages/next/dist/client.js`
Expected: first line is `'use client'`.

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm exec turbo run test --filter=@airnauts/airside-integration-next`
Expected: PASS — including the existing app-router/pages-router tests and the new `client.test.ts`.

- [ ] **Step 10: Update `packages/next/README.md`**

After the "Quick start — Pages Router" section, add a "Client mount" section:

```markdown
## Client mount

This package re-exports the React mount so a Next app needs only one install for both halves. In a client component (or directly in an RSC tree — the export ships `'use client'`):

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-next/client'

export function AirsideMount() {
  return <AirsideLayer airsideKey={process.env.NEXT_PUBLIC_AIRSIDE_KEY!} endpoint="/api/airside" />
}
```

`AirsideLayer` is re-exported from [`@airnauts/airside-integration-react`](https://github.com/Airnauts/airside/blob/main/packages/integration-react/README.md); use that package directly in non-Next React hosts.
```

- [ ] **Step 11: Commit**

```bash
git add packages/next
git commit -m "feat(integration-next): re-export AirsideLayer via the ./client subpath"
```

---

## Task 4: Repoint consumers and docs

**Files:**
- Modify: `examples/nextjs-host/app/components/airside-mount.tsx`
- Modify: `README.md`
- Modify: `docs/integration.md`
- Modify: `docs/milestones.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Repoint the example mount import**

In `examples/nextjs-host/app/components/airside-mount.tsx`, change line 3:

```tsx
import { AirsideLayer } from '@airnauts/airside-client/react'
```

to:

```tsx
import { AirsideLayer } from '@airnauts/airside-integration-next/client'
```

(Leave the rest of the file — the `pageKey`/`features` props — unchanged.)

- [ ] **Step 2: Repoint the root `README.md`**

Both import sites (around lines 54 and 137):

```markdown
import { AirsideLayer } from '@airnauts/airside-client/react'
```

→ for the Next quickstart use `@airnauts/airside-integration-next/client`; for a framework-neutral React example use `@airnauts/airside-integration-react`. Pick per the surrounding context of each occurrence.

- [ ] **Step 3: Repoint `docs/integration.md`**

Line ~50:

```markdown
import { AirsideLayer } from '@airnauts/airside-client/react'
```

→ `@airnauts/airside-integration-next/client` (the integration guide is the Next worked example).

- [ ] **Step 4: Repoint `docs/milestones.md`**

Line ~68 mentions the subpath:

```markdown
packages; subpath exports resolve (`@airnauts/airside-client/react`, `@airnauts/airside-server/next`).
```

Update the `@airnauts/airside-client/react` reference to `@airnauts/airside-integration-react` (leave the historical milestone prose otherwise intact; this is a pointer fix, not a rewrite of decided history).

- [ ] **Step 5: Update `docs/architecture.md`**

In §2's monorepo package list, change the `@airnauts/airside-client` bullet so the subpath sentence ("Subpath **`@airnauts/airside-client/react`** exports the thin `<AirsideLayer/>` wrapper…") instead states that the React mount ships as a separate package, and add a new bullet:

```markdown
- **`@airnauts/airside-integration-react`** — the React host integration: the thin
  `<AirsideLayer/>` wrapper that calls `init()` in an effect (ships `'use client'`).
```

In §3, update the "The `<AirsideLayer/>` React wrapper simply calls `init()`…" sentence to note it now lives in `@airnauts/airside-integration-react` rather than the client subpath.

- [ ] **Step 6: Verify the example host builds against the new import**

Run: `pnpm exec turbo run build --filter=@airnauts/airside-nextjs-host`
Expected: PASS — the new `@airnauts/airside-integration-next/client` import resolves (Turbo builds `integration-next` first via `^build`).

- [ ] **Step 7: Commit**

```bash
git add examples README.md docs/integration.md docs/milestones.md docs/architecture.md
git commit -m "docs: repoint AirsideLayer imports at the new React integration packages"
```

---

## Task 5: Project wiring — check-exports, changeset config, ADR, changesets

**Files:**
- Modify: `scripts/check-exports.mjs`
- Modify: `.changeset/config.json`
- Modify: `docs/adr.md`
- Create: `.changeset/integration-react-new-package.md`
- Create: `.changeset/client-remove-react-subpath.md`
- Create: `.changeset/integration-next-client-export.md`

- [ ] **Step 1: Update `scripts/check-exports.mjs`**

Replace the line:

```js
  ['@airnauts/airside-client/react', 'packageName'],
```

with:

```js
  ['@airnauts/airside-integration-react', 'packageName'],
```

- [ ] **Step 2: Add the new package to the `fixed` group in `.changeset/config.json`**

Add `"@airnauts/airside-integration-react"` to the single array inside `"fixed"` (e.g. after `"@airnauts/airside-integration-next"`), so all packages stay version-synced:

```json
      "@airnauts/airside-integration-next",
      "@airnauts/airside-integration-react",
```

- [ ] **Step 3: Add ADR-0040 to `docs/adr.md`**

Append (newest-last) this record:

```markdown
## ADR-0040 — Extract the React mount into `@airnauts/airside-integration-react`

- **Date:** 2026-06-16
- **Status:** accepted

**Context.** The host-facing `<AirsideLayer/>` React wrapper shipped as the
`@airnauts/airside-client/react` subpath of the otherwise framework-agnostic widget
engine. On the server side we already separate the framework-agnostic core
(`airside-server`) from its host-framework integration (`airside-integration-next`).
React is to the client what Next is to the server — one host-framework integration over
a framework-agnostic core — but the package boundaries did not express that, and every
non-Next React host still pulled the wrapper from inside `airside-client`.

**Decision.** Promote the wrapper to a dedicated `@airnauts/airside-integration-react`
package (depends on `airside-client`, `react` as a required peer, ships a `'use client'`
banner). Remove the `@airnauts/airside-client/react` subpath outright — a clean break,
no shim (a re-export shim would create a `client/react` → `integration-react` → `client`
package cycle). `airside-integration-next` depends on `integration-react` and re-exports
`AirsideLayer` via a new `./client` subpath, so Next users still get the route handlers
and the mount from one package.

**Consequences.** `airside-client` sheds its `react`/`react-dom` peer deps and becomes a
zero-peer-dep vanilla package (it bundles its own React for the widget UI). Removing a
published subpath is breaking; pre-1.0 that is a minor bump (fixed group → 0.9.0), and
the only external consumer (`lear-frontend`) is under our control. Non-Next React hosts
now depend only on `@airnauts/airside-integration-react`. Supersedes the client-subpath
delivery described in ADR-0002.
```

(If the highest existing record is not ADR-0039, renumber this to the next integer and adjust the supersession note accordingly.)

- [ ] **Step 4: Create the three changeset files**

`.changeset/integration-react-new-package.md`:

```markdown
---
"@airnauts/airside-integration-react": minor
---

New package: `<AirsideLayer/>`, the React mount for embedding the Airside commenting widget in any React host. It calls `airside.init()` on mount, tears down on unmount, and ships a `'use client'` banner so it can be rendered directly in an RSC tree.
```

`.changeset/client-remove-react-subpath.md`:

```markdown
---
"@airnauts/airside-client": minor
---

**Breaking:** removed the `@airnauts/airside-client/react` subpath. The `<AirsideLayer/>` React wrapper now ships as `@airnauts/airside-integration-react` (or `@airnauts/airside-integration-next/client` for Next.js hosts). `@airnauts/airside-client` no longer declares `react`/`react-dom` peer dependencies — the vanilla `init()` engine bundles its own React.
```

`.changeset/integration-next-client-export.md`:

```markdown
---
"@airnauts/airside-integration-next": minor
---

Added the `@airnauts/airside-integration-next/client` export, which re-exports `AirsideLayer` so a Next.js app can install a single package for both the API route handlers and the client mount.
```

- [ ] **Step 5: Verify exports resolve**

Run: `pnpm build`
Expected: PASS for all packages.

Run: `pnpm check:exports`
Expected: PASS; the output lists `✓ @airnauts/airside-integration-react -> packageName` and no longer references `@airnauts/airside-client/react`.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-exports.mjs .changeset docs/adr.md
git commit -m "chore: wire integration-react into check-exports, changesets, and ADR-0040"
```

---

## Task 6: Full verification gate

**Files:** none — this task only runs the monorepo gates and fixes any fallout.

- [ ] **Step 1: Clean build from the worktree root**

Run: `pnpm build`
Expected: PASS for all packages, in dependency order.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no `@airnauts/airside-client/react` type references remain anywhere.

- [ ] **Step 3: Test**

Run: `pnpm test`
Expected: PASS across all package test suites, including the new `integration-react` and `integration-next` client tests.

- [ ] **Step 4: Lint (Biome)**

Run: `pnpm lint`
Expected: PASS. If Biome reports import-order/format issues in the new or edited files (it has broken CI after wide changes before), run `pnpm format` and re-run `pnpm lint`, then `git add -A`.

- [ ] **Step 5: Size budget**

Run: `pnpm size`
Expected: PASS — `airside-client` within 300 kB (unchanged or smaller now that the `/react` entry is gone).

- [ ] **Step 6: Exports check**

Run: `pnpm check:exports`
Expected: PASS.

- [ ] **Step 7: Final commit (only if lint/format touched files)**

```bash
git add -A
git commit -m "chore: biome format after integration-react extraction"
```

---

## Self-review notes

- **Spec coverage:** §3.1 → Task 1; §3.2 → Task 2; §3.3 → Task 3; §4 → Task 4; §5 → Task 5 (steps 1-2); §6 ADR → Task 5 step 3; §7 changesets → Task 5 step 4; §8 verification → Task 6. All spec sections map to a task.
- **Not run by this plan:** `pnpm version-packages` / `changeset version` and the publish — those are a separate release action on `main` (see `RELEASING.md`); this plan stops at landing the changesets, consistent with project practice.
- **Worktree reminder:** the work is already isolated in the `react-refactor` worktree; `pnpm install` (Task 1 Step 10) materializes real `node_modules` so cross-package source edits are visible.
