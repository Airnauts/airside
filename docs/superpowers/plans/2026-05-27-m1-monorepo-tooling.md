# M1 — Monorepo & Tooling Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a buildable, testable, empty-shell pnpm monorepo with the six `@comments/*` package shells, full tooling (Turborepo, Biome, Vitest, tsup, size-limit), a GitHub Actions CI skeleton, and ADR-0011 — so every later milestone slots in.

**Architecture:** pnpm workspaces hold six packages under `packages/*`. Turborepo orchestrates four tasks (`build`, `typecheck`, `test`, `size`) across the dependency graph. Each package builds with two tools that never collide: **tsup** (esbuild) emits `dist/*.js`; **`tsc --build`** (TypeScript project references, `composite`) emits `dist/*.d.ts` and does the type-checking. Pure ESM only. Subpath exports (`@comments/client/react`, `@comments/server/next`) are wired via `package.json` `exports` and verified post-build by a node script.

**Tech Stack:** pnpm 10.17, Node 22, TypeScript 5.7 (project references), tsup 8, Vitest 3, Biome 2, Turborepo 2, size-limit 11, GitHub Actions.

**Source spec:** [`docs/superpowers/specs/2026-05-27-m1-monorepo-tooling-design.md`](../specs/2026-05-27-m1-monorepo-tooling-design.md)

---

## File Structure

**Root (created across Tasks 1–2, 7–11):**

| File | Responsibility |
|---|---|
| `package.json` | private root: version pins, scripts, dev tooling, (Task 8) workspace deps for root tooling |
| `pnpm-workspace.yaml` | workspace globs (`packages/*`; `examples/*` reserved, commented) |
| `tsconfig.base.json` | shared strict compiler options inherited by every package |
| `tsconfig.json` | solution file: `references` every package, no own files |
| `turbo.json` | task graph: `build` · `typecheck` · `test` · `size` |
| `biome.json` | lint + format config |
| `.node-version`, `.nvmrc` | Node 22 pin |
| `.gitignore` | (modify) add `dist`, `.turbo`, `*.tsbuildinfo` |
| `scripts/check-exports.mjs` | post-build subpath-resolution verifier |
| `.github/workflows/ci.yml` | CI: lint · typecheck · build · test · size · check-exports |

**Per package** `packages/<name>/` — identical shape:

| File | Responsibility |
|---|---|
| `package.json` | name, `type: module`, `exports` map, scripts, workspace deps |
| `tsconfig.json` | extends base; `composite`; `emitDeclarationOnly`; `references` to deps |
| `tsup.config.ts` | entry/entries; `format: ['esm']`; `dts: false` |
| `vitest.config.ts` | project name + environment (`node`, or `jsdom` for client) |
| `src/index.ts` | empty shell export (`packageName` constant) |
| `src/index.test.ts` | one smoke test |
| `src/react.ts` / `src/next.ts` | extra subpath entry (client / server only) + its smoke test |

**Packages & dependency edges:** `core` (leaf) · `client → core` (+`/react`, jsdom) · `server → core` (+`/next`) · `adapter-mongo → core, server` · `storage-vercel-blob → core, server` · `storage-fs → core, server`.

**Conventions for every code sample below:** single quotes, no semicolons, 2-space indent (matches `biome.json`). After creating/editing files in a task, run `pnpm format` (auto-fixes formatting) before `pnpm lint` and before committing.

---

## Task 1: Root workspace foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.node-version`
- Create: `.nvmrc`
- Modify: `.gitignore`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  # examples/* reserved for the sample Next.js host app — first scaffolded in M4.
  # - 'examples/*'
```

- [ ] **Step 2: Create the root `package.json`**

Scripts reference Turbo tasks (Task 2) and a script file (Task 8) that don't exist yet — that's fine; they're only invoked in later tasks.

```json
{
  "name": "comments-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.17.0",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "turbo run typecheck build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "biome ci",
    "format": "biome check --write",
    "size": "turbo run size",
    "check:exports": "node scripts/check-exports.mjs",
    "clean": "rm -rf packages/*/dist .turbo node_modules/.cache"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@types/node": "^22.10.0",
    "tsup": "^8.3.5",
    "turbo": "^2.3.3",
    "typescript": "^5.7.2",
    "vitest": "^3.2.0"
  }
}
```

> **pnpm note:** shared CLI tooling lives at the root (resolvable from any package via Node's upward `node_modules` walk and the `.bin` PATH). Package-local tooling that resolves relative to *its* manifest — `jsdom` (Vitest environment) and `size-limit` + its preset — goes in `client`'s `devDependencies` (Tasks 4 and 9), not here.

- [ ] **Step 3: Create `.node-version` and `.nvmrc`**

Both files contain exactly:

```
22
```

- [ ] **Step 4: Append build artifacts to `.gitignore`**

The file already ignores `node_modules/`, `dist/`, `.DS_Store`, `.superpowers/`. Append:

```
# Build tooling
.turbo/
*.tsbuildinfo
coverage/
```

- [ ] **Step 5: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes successfully; creates `pnpm-lock.yaml` and `node_modules/`; no packages built yet. There are no workspace packages, so pnpm only installs the root dev tooling.

- [ ] **Step 6: Verify tool versions**

Run: `pnpm exec turbo --version && pnpm exec biome --version && pnpm exec vitest --version && pnpm exec tsc --version`
Expected: each prints a version (turbo 2.x, biome 2.x, vitest 3.x, tsc 5.7.x). Confirms the toolchain installed.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .node-version .nvmrc .gitignore
git commit -m "M1: root pnpm workspace + dev tooling + version pins"
```

---

## Task 2: Shared configs (TypeScript base, Biome, Turborepo)

**Files:**
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `turbo.json`

- [ ] **Step 1: Create `tsconfig.base.json`**

Shared strict options. `composite: true` makes every package a referenceable project. `emitDeclarationOnly` is set per-package (Task 3+), not here.

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 2: Create `biome.json`**

Uses git ignore integration (so `dist`/`node_modules` are skipped) to avoid version-specific ignore-syntax pitfalls.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

- [ ] **Step 3: Sync the Biome schema version to the installed Biome**

Run: `pnpm exec biome migrate --write`
Expected: updates the `$schema` URL in `biome.json` to the installed Biome version (and migrates any renamed keys). If it reports "no migration needed," that's fine.

- [ ] **Step 4: Create `turbo.json`**

Four tasks. `build` (tsup → JS) and `typecheck` (tsc → d.ts) write **non-overlapping** outputs into `dist/`, so they can run in parallel and cache independently.

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**/*.js", "dist/**/*.js.map"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "inputs": ["src/**/*.ts", "tsconfig.json", "../../tsconfig.base.json"],
      "outputs": ["dist/**/*.d.ts", "dist/**/*.d.ts.map", "dist/.tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "size": {
      "dependsOn": ["build", "typecheck"]
    }
  }
}
```

- [ ] **Step 5: Verify Biome runs clean on the configs**

Run: `pnpm format && pnpm lint`
Expected: `pnpm format` normalizes the JSON files; `pnpm lint` (`biome ci`) exits 0 (no source files yet, configs are valid and formatted).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json biome.json turbo.json
git commit -m "M1: shared TypeScript base, Biome, and Turborepo configs"
```

---

## Task 3: Scaffold `@comments/core` (the leaf package)

This task establishes the per-package recipe end to end on the simplest package (no internal deps). Later package tasks repeat this shape.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/index.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```typescript
// packages/core/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/core', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/core')
  })
})
```

- [ ] **Step 2: Create the package manifest, configs (so the test can run), then run the test to watch it fail**

Create `packages/core/package.json`:

```json
{
  "name": "@comments/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --build",
    "test": "vitest run"
  }
}
```

Create `packages/core/tsconfig.json` (leaf — no `references`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"]
}
```

Create `packages/core/tsup.config.ts`. `clean` is scoped to JS globs only so it never deletes the `.d.ts` files that `tsc` emits into the same `dist/`:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
```

Create `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
  },
})
```

Run: `pnpm install` (links the new workspace package), then `pnpm --filter @comments/core test`
Expected: FAIL — `src/index.ts` does not exist / `packageName` is not exported.

- [ ] **Step 3: Write the minimal shell implementation**

```typescript
// packages/core/src/index.ts
export const packageName = '@comments/core'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @comments/core test`
Expected: PASS — 1 test passed, project `core`, environment `node`.

- [ ] **Step 5: Build core and verify both artifacts land in `dist/`**

Run: `pnpm --filter @comments/core run build && pnpm --filter @comments/core run typecheck && ls packages/core/dist`
Expected: `dist/` contains `index.js` (from tsup) **and** `index.d.ts` (from tsc). Confirms the two-tool split produces a complete distribution with no collision.

- [ ] **Step 6: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add packages/core pnpm-lock.yaml
git commit -m "M1: scaffold @comments/core shell (build + test recipe)"
```

---

## Task 4: Scaffold `@comments/client` (+ `/react` subpath, jsdom)

Depends on `core`. Adds a second entry point (`react`) to exercise subpath exports, and runs tests in `jsdom`.

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/tsup.config.ts`
- Create: `packages/client/vitest.config.ts`
- Create: `packages/client/src/index.ts`, `packages/client/src/react.ts`
- Test: `packages/client/src/index.test.ts`, `packages/client/src/react.test.ts`

- [ ] **Step 1: Write the failing smoke tests**

```typescript
// packages/client/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/client', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/client')
  })

  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object')
  })
})
```

```typescript
// packages/client/src/react.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './react'

describe('@comments/client/react', () => {
  it('exposes its subpath package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/client/react')
  })
})
```

- [ ] **Step 2: Create the manifest + configs, then run tests to watch them fail**

Create `packages/client/package.json`:

```json
{
  "name": "@comments/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
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
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@comments/core": "workspace:*"
  },
  "devDependencies": {
    "jsdom": "^26.0.0"
  }
}
```

`jsdom` is a `client` devDependency (not root) so Vitest resolves its environment relative to this package under pnpm's strict `node_modules`.

Create `packages/client/tsconfig.json` (references `core`; adds DOM libs):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../core" }]
}
```

Create `packages/client/tsup.config.ts` (two entries → two subpaths):

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', react: 'src/react.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
```

Create `packages/client/vitest.config.ts` (jsdom):

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'client',
    environment: 'jsdom',
  },
})
```

Run: `pnpm install && pnpm --filter @comments/client test`
Expected: FAIL — `src/index.ts` and `src/react.ts` do not exist.

- [ ] **Step 3: Write the minimal shell implementations**

```typescript
// packages/client/src/index.ts
export const packageName = '@comments/client'
```

```typescript
// packages/client/src/react.ts
export const packageName = '@comments/client/react'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @comments/client test`
Expected: PASS — 3 tests passed, project `client`, environment `jsdom`.

- [ ] **Step 5: Build and verify both subpath artifacts exist**

Run: `pnpm --filter @comments/client run build && pnpm --filter @comments/client run typecheck && ls packages/client/dist`
Expected: `dist/` contains `index.js`, `index.d.ts`, `react.js`, `react.d.ts`.

- [ ] **Step 6: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add packages/client pnpm-lock.yaml
git commit -m "M1: scaffold @comments/client shell (+ /react subpath, jsdom)"
```

---

## Task 5: Scaffold `@comments/server` (+ `/next` subpath)

Depends on `core`. Mirrors the client recipe with a `next` subpath instead of `react`, node environment.

**Files:**
- Create: `packages/server/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
- Create: `packages/server/src/index.ts`, `packages/server/src/next.ts`
- Test: `packages/server/src/index.test.ts`, `packages/server/src/next.test.ts`

- [ ] **Step 1: Write the failing smoke tests**

```typescript
// packages/server/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/server', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/server')
  })
})
```

```typescript
// packages/server/src/next.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './next'

describe('@comments/server/next', () => {
  it('exposes its subpath package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/server/next')
  })
})
```

- [ ] **Step 2: Create the manifest + configs, then run tests to watch them fail**

Create `packages/server/package.json`:

```json
{
  "name": "@comments/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./next": {
      "types": "./dist/next.d.ts",
      "import": "./dist/next.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@comments/core": "workspace:*"
  }
}
```

Create `packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../core" }]
}
```

Create `packages/server/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', next: 'src/next.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
```

Create `packages/server/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
  },
})
```

Run: `pnpm install && pnpm --filter @comments/server test`
Expected: FAIL — `src/index.ts` and `src/next.ts` do not exist.

- [ ] **Step 3: Write the minimal shell implementations**

```typescript
// packages/server/src/index.ts
export const packageName = '@comments/server'
```

```typescript
// packages/server/src/next.ts
export const packageName = '@comments/server/next'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @comments/server test`
Expected: PASS — 2 tests passed, project `server`.

- [ ] **Step 5: Build and verify both subpath artifacts exist**

Run: `pnpm --filter @comments/server run build && pnpm --filter @comments/server run typecheck && ls packages/server/dist`
Expected: `dist/` contains `index.js`, `index.d.ts`, `next.js`, `next.d.ts`.

- [ ] **Step 6: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add packages/server pnpm-lock.yaml
git commit -m "M1: scaffold @comments/server shell (+ /next subpath)"
```

---

## Task 6: Scaffold the adapter & storage packages

Three packages with the same shape: a single `.` entry, depending on **both** `core` and `server` (they implement interfaces `server` defines). Create all three.

**Files (×3):** `packages/adapter-mongo/`, `packages/storage-vercel-blob/`, `packages/storage-fs/` — each gets `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`, `src/index.test.ts`.

- [ ] **Step 1: Write the three failing smoke tests**

```typescript
// packages/adapter-mongo/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/adapter-mongo', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/adapter-mongo')
  })
})
```

```typescript
// packages/storage-vercel-blob/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/storage-vercel-blob', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/storage-vercel-blob')
  })
})
```

```typescript
// packages/storage-fs/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@comments/storage-fs', () => {
  it('exposes its package name (M1 shell smoke test)', () => {
    expect(packageName).toBe('@comments/storage-fs')
  })
})
```

- [ ] **Step 2: Create the three manifests**

`packages/adapter-mongo/package.json`:

```json
{
  "name": "@comments/adapter-mongo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@comments/core": "workspace:*",
    "@comments/server": "workspace:*"
  }
}
```

`packages/storage-vercel-blob/package.json` — identical except:

```json
  "name": "@comments/storage-vercel-blob",
```

`packages/storage-fs/package.json` — identical except:

```json
  "name": "@comments/storage-fs",
```

- [ ] **Step 3: Create the three `tsconfig.json` files**

The same content goes in `packages/adapter-mongo/tsconfig.json`, `packages/storage-vercel-blob/tsconfig.json`, and `packages/storage-fs/tsconfig.json` (each references both `core` and `server`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../core" }, { "path": "../server" }]
}
```

- [ ] **Step 4: Create the three `tsup.config.ts` files**

Identical content in all three package directories:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
```

- [ ] **Step 5: Create the three `vitest.config.ts` files**

`packages/adapter-mongo/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-mongo',
    environment: 'node',
  },
})
```

`packages/storage-vercel-blob/vitest.config.ts` — identical except `name: 'storage-vercel-blob'`.

`packages/storage-fs/vitest.config.ts` — identical except `name: 'storage-fs'`.

- [ ] **Step 6: Install and run the three tests to watch them fail**

Run: `pnpm install && pnpm --filter "@comments/adapter-mongo" --filter "@comments/storage-vercel-blob" --filter "@comments/storage-fs" test`
Expected: FAIL — `src/index.ts` does not exist in any of the three.

- [ ] **Step 7: Write the three minimal shell implementations**

```typescript
// packages/adapter-mongo/src/index.ts
export const packageName = '@comments/adapter-mongo'
```

```typescript
// packages/storage-vercel-blob/src/index.ts
export const packageName = '@comments/storage-vercel-blob'
```

```typescript
// packages/storage-fs/src/index.ts
export const packageName = '@comments/storage-fs'
```

- [ ] **Step 8: Run the three tests to verify they pass**

Run: `pnpm --filter "@comments/adapter-mongo" --filter "@comments/storage-vercel-blob" --filter "@comments/storage-fs" test`
Expected: PASS — 1 test each, all node environment.

- [ ] **Step 9: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add packages/adapter-mongo packages/storage-vercel-blob packages/storage-fs pnpm-lock.yaml
git commit -m "M1: scaffold adapter-mongo + storage-vercel-blob + storage-fs shells"
```

---

## Task 7: Wire the root solution tsconfig + verify full workspace build

Now that all six packages exist, add the root solution file and prove the whole-repo orchestration is green.

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Create the root solution `tsconfig.json`**

No own files; references every package so `tsc --build` (and IDEs) can build the whole graph in dependency order.

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/client" },
    { "path": "packages/server" },
    { "path": "packages/adapter-mongo" },
    { "path": "packages/storage-vercel-blob" },
    { "path": "packages/storage-fs" }
  ]
}
```

- [ ] **Step 2: Clean, then run the full workspace build**

Run: `pnpm clean && pnpm build`
Expected: `turbo run typecheck build` runs across all six packages in dependency order (core before its dependents). All tasks succeed. Every package has `dist/index.js` + `dist/index.d.ts`; client also `react.*`; server also `next.*`.

- [ ] **Step 3: Run the full workspace test + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: `pnpm test` — all 6 projects pass (9 tests total: core 1, client 3, server 2, adapter-mongo 1, storage-vercel-blob 1, storage-fs 1). `pnpm typecheck` — Turbo cache hits or clean tsc build, exit 0. `pnpm lint` — exit 0.

- [ ] **Step 4: Verify root `tsc --build` agrees (project references sanity)**

Run: `pnpm exec tsc --build --dry`
Expected: lists the project build order with no errors (confirms the references graph is acyclic and complete).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json
git commit -m "M1: root solution tsconfig referencing all packages"
```

---

## Task 8: Subpath exports resolution check

Verify the `exports` maps resolve as a real consumer would import them — through the package specifier, from the built `dist`.

**Files:**
- Modify: `package.json` (add the six workspace packages as root devDependencies so root tooling can resolve them by name)
- Create: `scripts/check-exports.mjs`

- [ ] **Step 1: Add the workspace packages to the root `package.json` devDependencies**

Add this block to the root `package.json` `devDependencies` (alphabetical order within the existing list is fine):

```json
    "@comments/adapter-mongo": "workspace:*",
    "@comments/client": "workspace:*",
    "@comments/core": "workspace:*",
    "@comments/server": "workspace:*",
    "@comments/storage-fs": "workspace:*",
    "@comments/storage-vercel-blob": "workspace:*",
```

Then run: `pnpm install`
Expected: pnpm symlinks all six packages into the root `node_modules/@comments/*`, making them resolvable by specifier from root scripts.

- [ ] **Step 2: Write the resolution checker**

```javascript
// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath that must resolve through its package.json `exports`.
const entries = [
  '@comments/core',
  '@comments/client',
  '@comments/client/react',
  '@comments/server',
  '@comments/server/next',
  '@comments/adapter-mongo',
  '@comments/storage-vercel-blob',
  '@comments/storage-fs',
]

for (const id of entries) {
  const mod = await import(id)
  assert.equal(
    typeof mod.packageName,
    'string',
    `${id} did not resolve to a module exporting "packageName"`,
  )
  console.log(`✓ ${id} -> ${mod.packageName}`)
}

console.log(`\nAll ${entries.length} package entries resolved through their exports maps.`)
```

- [ ] **Step 3: Build, then run the checker — verify all subpaths resolve**

Run: `pnpm build && pnpm check:exports`
Expected: prints `✓` for all 8 entries, including `@comments/client/react` and `@comments/server/next`, then `All 8 package entries resolved through their exports maps.` Exit 0. (This is the milestone's "subpath exports resolve" exit criterion, verified against the built artifacts.)

- [ ] **Step 4: Confirm it actually catches a broken export (one-time sanity, then revert)**

Run: temporarily rename `packages/client/package.json`'s `"./react"` export key to `"./reactX"`, then `pnpm install && pnpm build && pnpm check:exports`
Expected: FAILS at `@comments/client/react` with an unresolved-module error — proving the check has teeth.

Then **revert the rename** and confirm the working tree is clean before continuing:

Run: `git checkout -- packages/client/package.json && git diff --exit-code packages/client/package.json && pnpm install && pnpm build && pnpm check:exports`
Expected: `git diff --exit-code` produces no output and exits 0 (the deliberate break is fully reverted), then `pnpm check:exports` passes all 8 entries again.

- [ ] **Step 5: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add package.json pnpm-lock.yaml scripts/check-exports.mjs
git commit -m "M1: verify subpath exports resolve via check-exports script"
```

---

## Task 9: size-limit bundle-budget harness (empty target)

Wire the budget against `@comments/client`'s built ESM with a generous placeholder limit; real budgets land in M9.

**Files:**
- Modify: `packages/client/package.json` (add `size-limit`/preset devDeps, `size` script, and budget config)

- [ ] **Step 1: Add the size tooling, script, and budget config to `packages/client/package.json`**

Add `size-limit` + its preset to `devDependencies` (alongside the existing `jsdom`) — they live here, not at root, because `size-limit` detects its preset from the consuming package's manifest:

```json
  "devDependencies": {
    "@size-limit/preset-small-lib": "^11.1.6",
    "jsdom": "^26.0.0",
    "size-limit": "^11.1.6"
  }
```

Add `"size": "size-limit"` to its `scripts`, so the block becomes:

```json
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --build",
    "test": "vitest run",
    "size": "size-limit"
  },
```

And add this top-level `size-limit` array:

```json
  "size-limit": [
    {
      "name": "@comments/client (esm, brotli)",
      "path": "dist/index.js",
      "limit": "10 kB"
    }
  ]
```

- [ ] **Step 2: Install the new devDeps, then run the size budget through Turbo**

Run: `pnpm install && pnpm build && pnpm size`
Expected: `turbo run size` builds client (cache hit) and runs `size-limit`, reporting the brotli size of `dist/index.js` (a few hundred bytes for the empty shell) **well under** the 10 kB placeholder. Exit 0.

- [ ] **Step 3: Format, lint, commit**

Run: `pnpm format && pnpm lint`
Expected: exits 0.

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "M1: size-limit budget harness on @comments/client (placeholder limit)"
```

---

## Task 10: GitHub Actions CI skeleton

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
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

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test

      - name: Bundle size budget
        run: pnpm size

      - name: Verify subpath exports
        run: pnpm check:exports
```

- [ ] **Step 2: Format, then eyeball Biome's effect on the workflow YAML**

Run: `pnpm format && git diff .github/workflows/ci.yml`
Expected: Biome 2.x formats YAML, so `ci.yml` may be reindented/requoted. Confirm the diff is cosmetic only (no changed keys/values — e.g. `node-version: 22` and `version: 10.17.0` still intact). `pnpm lint` will then pass on the formatted file.

- [ ] **Step 3: Dry-run the exact CI sequence locally**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm size && pnpm check:exports`
Expected: every step exits 0 — this is precisely what CI will run. If `--frozen-lockfile` errors, the lockfile is out of date: run `pnpm install`, commit the updated `pnpm-lock.yaml`, and retry.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "M1: GitHub Actions CI skeleton (lint, typecheck, build, test, size, exports)"
```

---

## Task 11: ADR-0011 — Monorepo tooling stack

**Files:**
- Modify: `docs/adr.md` (append a new record, newest-last; do not edit prior records)

- [ ] **Step 1: Append ADR-0011 to `docs/adr.md`**

Add at the end of the file:

```markdown

---

## ADR-0011 — Monorepo tooling stack

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** Architecture §2 fixed pnpm workspaces, TypeScript project
references, tsup, and ESM-first, but left the surrounding tooling open: task
orchestration, lint/format, the test runner, the bundle-size budget tool, the
module format, and version pins. `CLAUDE.md` requires an ADR when we choose a
framework or establish coding standards — this records those choices for M1.

**Decision.**
- **Task orchestration: Turborepo.** Vercel-native (matches the v1 deployment
  target, ADR-0001), dependency-aware task graph + caching across the six
  packages. `turbo.json` defines `build` · `typecheck` · `test` · `size`.
- **Lint + format: Biome.** One fast tool, one config. Its React Hooks rules
  (`useExhaustiveDependencies`, `useHookAtTopLevel`) cover the cases that matter;
  if a later frontend milestone needs a rule Biome lacks, ESLint can be added for
  the `client` package only.
- **Test runner: Vitest.** ESM-native, jsdom/RTL-ready, the TDD loop for M2+
  (ADR-0010). Each package owns a `vitest.config.ts`; Turbo fans the `test` task
  out (the deprecated `vitest.workspace.ts` file is intentionally avoided).
- **Bundle-size budget: size-limit.** Brotli budget per entry, run in CI. M1
  wires it against `@comments/client` with a placeholder limit; real budgets are
  calibrated in M9.
- **Module format: pure ESM only.** Every package is `type: module`, tsup emits
  `format: ['esm']`. No dual CJS in v1; a CJS build is a documented later seam.
- **Build-tool split.** `tsc --build` (project references, `composite`,
  `emitDeclarationOnly`) owns type-checking and `.d.ts` emit; tsup (esbuild) owns
  JS bundling (`dts: false`). They write non-overlapping outputs into one `dist/`.
- **Version pins: Node 22, pnpm 10.17.0** (`engines`, `packageManager`,
  `.node-version`/`.nvmrc`).

**Consequences.**
- A single, fast, cached toolchain; `pnpm build/test/lint` fan out across packages
  with minimal config.
- Pure ESM halves the build matrix and avoids the dual-package hazard, at the cost
  of dropping CJS consumers in v1 (accepted; seam preserved).
- The `tsc`/tsup split avoids two generators racing on `.d.ts`, but means a build
  is "complete" only after both tasks run (the root `build` script runs both).
- Biome's smaller rule ecosystem vs. ESLint is an accepted trade-off with a
  contained fallback.
- Choosing Turborepo + Biome over the heavier Nx / ESLint+Prettier stacks keeps a
  six-package repo lightweight; revisiting is cheap (these are dev-time tools, not
  runtime contracts).
```

- [ ] **Step 2: Verify the doc still reads cleanly**

Run: `pnpm lint` (Biome ignores Markdown by default, so this is just a no-op safety check) and visually confirm ADR-0011 is the last record and prior records are untouched: `git diff --stat docs/adr.md`
Expected: `docs/adr.md` shows only additions (insertions), zero deletions.

- [ ] **Step 3: Commit**

```bash
git add docs/adr.md
git commit -m "M1: add ADR-0011 recording the monorepo tooling stack"
```

---

## Final verification (milestone exit criteria)

- [ ] **Run the complete exit-criteria gate from a clean state**

Run: `pnpm clean && pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm lint && pnpm size && pnpm check:exports`
Expected: all green. This maps to the milestone exit criteria:

| Exit criterion (M1) | Verified by |
|---|---|
| `pnpm i` | `pnpm install --frozen-lockfile` succeeds |
| `pnpm build` green on empty packages | `pnpm build` (tsup + tsc across 6 packages) |
| `pnpm test` green | `pnpm test` — 9 smoke tests across 6 projects |
| `pnpm lint` green | `pnpm lint` — `biome ci` exit 0 |
| `@comments/client/react` + `@comments/server/next` resolve | `pnpm check:exports` — all 8 entries |
| bundle-budget harness exists | `pnpm size` — size-limit reports under placeholder |
| CI skeleton runs | `.github/workflows/ci.yml` present; mirrors the local gate |
| tooling decision recorded | ADR-0011 in `docs/adr.md` |

- [ ] **(Optional) Push to publish CI**

Only if you want CI to run now: `git push -u origin main`. CI will execute the workflow on GitHub. (Not required to satisfy M1 locally.)

---

## Notes & deliberate simplifications

- **Test files are excluded from `tsc` typecheck** (`exclude: src/**/*.test.ts`) so the empty-shell `dist` stays clean and tsup entries aren't polluted. Vitest still runs them. Stricter test type-checking (e.g. `vitest --typecheck` or a `tsconfig.test.json`) can be added in M2 when real logic and richer tests arrive — it's not needed for M1 smoke tests.
- **Packages are `private: true`** in M1. The milestone that first publishes to npm flips this and adds `publishConfig`; nothing in M1 publishes.
- **The size budget is a non-binding placeholder** (10 kB). Do not treat it as a real target — the real widget budget is set in M9 once React + shadcn are bundled.
- **`examples/*`** is reserved (commented) in `pnpm-workspace.yaml`; the first sample Next.js app is scaffolded in M4.
```