# Rebrand: `comments` → `airside`

**Date:** 2026-06-15
**Status:** Approved — ready for implementation plan
**Supersedes:** the package-naming portion of ADR-0020 (to be recorded as ADR-0038)

## Goal

Rebrand the embeddable commenting tool from the **`comments`** product/namespace
identity to **`airside`** (a play on "aside" — a remark to the side — and the
aviation term, tying to the Airnauts brand). The npm org scope `@airnauts` stays.

This is a **brand rename**, not a product change. The product still manages
*comments* (the domain concept). Only the **brand/namespace** identity changes.

## Locked decisions

| Decision | Choice |
|---|---|
| npm scope | Keep `@airnauts`; swap prefix → `@airnauts/airside-*` |
| Extension pkgs | Unify `notifier-slack`/`notifier-email`/`integration-jira` → `airside-extension-{slack,email,jira}` (the `*Extension` factory unification shipped in `comments@0.7.0`) |
| Rename depth | **Full rebrand** — package names + repo + public widget surface + internal `cmnt:` prefix |
| Old npm packages | **Deprecate with pointer** (`npm deprecate`), no shim/republish |
| Repo slug | **Rename in place** `Airnauts/commenting-tool` → `Airnauts/airside` (GitHub auto-redirects) |
| Tailwind prefix | `cmnt:` → **`air:`** |
| Public JS API symbols | **Rename all** brand-carrying symbols (no vetoes) |
| Version | **Continue the line** — airside debuts one minor above the final `comments` release |
| Storage-key migration | **None** — accept the pre-1.0 reset (conscious tradeoff) |

## Brand vs domain (the core rule)

- **BRAND** (→ `airside`): anything that identifies the *product/package/namespace* —
  package names, the Tailwind class prefix, CSS custom-property prefix, the public
  activation/thread query params, `data-*` attributes, storage-key prefixes, the
  HTTP header, env-var prefixes, repo URLs, the monorepo root name, `.changeset`
  package lists, CI refs, docs/README/ADR product-name prose, and public JS API
  symbols.
- **DOMAIN** (unchanged): anything naming the *thing the product manages* — the
  `Comment` type/schema, `comments[]` data fields, the `comments` DB table / Mongo
  database name, and UI strings like "Add comment" / "Reply".

## Translation map

| Layer | Now | → Airside |
|---|---|---|
| npm packages (12 public + 3 private) | `@airnauts/comments-*` | `@airnauts/airside-*` |
| monorepo root `name` | `comments-monorepo` | `airside-monorepo` |
| repo slug | `Airnauts/commenting-tool` | `Airnauts/airside` |
| Tailwind prefix (~500 uses) | `cmnt:` | `air:` |
| CSS custom props (~40) | `--cmnt-*` | `--air-*` |
| data attributes | `data-comments-root`, `data-comments-style`, `data-comments-pin`, `data-comments-pin-id`, `data-comments-place`, `data-comments-overlay`, `data-comments-highlight`, `data-comments-toast` | `data-airside-*` |
| storage keys | `comments:key`, `comments:identity`, `comments:launcher-position`, `cmnt:focus` | `airside:key`, `airside:identity`, `airside:launcher-position`, `airside:focus` |
| query params | `comments-key` (`DEFAULT_KEY_PARAM`), `comments-thread` (`DEFAULT_THREAD_PARAM`) | `airside-key`, `airside-thread` |
| HTTP header | `x-comments-key` | `x-airside-key` |
| env vars | `COMMENTS_SECRET`, `NEXT_PUBLIC_COMMENTS_KEY`, `VITE_COMMENTS_KEY` | `AIRSIDE_SECRET`, `NEXT_PUBLIC_AIRSIDE_KEY`, `VITE_AIRSIDE_KEY` |
| test-ids | `comments-pin`, `comments-panel-open`, `comments-place` | `airside-pin`, `airside-panel-open`, `airside-place` |

Most packages are a clean prefix swap (`comments-X` → `airside-X`). The three
**extension** packages also change *category* (the `*Extension` factory unification
already shipped in `comments@0.7.0`) and are the only non-mechanical renames:

| Current (published) | → Airside | Factory export |
|---|---|---|
| `@airnauts/comments-notifier-slack` | `@airnauts/airside-extension-slack` | `slackNotifications` → `slackExtension` |
| `@airnauts/comments-notifier-email` | `@airnauts/airside-extension-email` | `emailNotifications` → `emailExtension` |
| `@airnauts/comments-integration-jira` | `@airnauts/airside-extension-jira` | `jiraIssues` → `jiraExtension` |

They stay **three separate packages** (distinct optional deps: webhook / SMTP / Jira
client), just recategorized — not merged. The factory renames ship with the
unification work, not the rebrand; the rebrand only moves their packages. The
`@deprecated` factory aliases the unify work adds for the `comments` 0.6→0.7
transition need not carry to airside — the clean-break airside packages ship only
the unified `*Extension` names. The `ServerExtension` / `NotificationExtension` types
are **domain** and unchanged.

### Package inventory review (no further renames)

`adapter-{memory,mongo,postgres}` (comment **repository**) and
`storage-{fs,vercel-blob}` (**blob/attachment** storage) are distinct seams — the
two-category split is intentional, kept. `client` (the embeddable widget) is kept as
`airside-client` to limit churn (`airside-widget` considered, rejected). `core`,
`server`, `next`, `test-support`, and the examples are straight prefix swaps.

### Public JS API symbols (rename all)

| Now | → Airside |
|---|---|
| `comments.init()` (default export object) | `airside.init()` |
| `<CommentsLayer>` (React) | `<AirsideLayer>` |
| `CommentsHandle` (React type) | `AirsideHandle` |
| React prop `commentsKey` | `airsideKey` |
| `createCommentsAppRoute` (Next) | `createAirsideAppRoute` |
| `createCommentsPagesRoute` (Next) | `createAirsidePagesRoute` |
| `packageName` const (`@airnauts/comments-client`) | `@airnauts/airside-client` |

### Stays (domain — do NOT rename)

`Comment` type/schema · `comments[]` data fields · `commentCount` · the `comments`
Mongo database name in `MONGODB_URI` · all "Add comment / Reply" UI copy.

## Internal dependency flip (release-safety)

Every package's internal deps reference `@airnauts/comments-*` via `workspace:^`.
All of these flip to `@airnauts/airside-*` in the same change. **The only publish
path is Changesets + CI** (`changeset publish` in `ci.yml`); never `npm publish`
from a package dir — that is exactly the path that previously leaked `workspace:^`
and shipped a broken `notifier-slack@0.1.0`. Since every internal dep flips in this
rename, this guard is load-bearing here.

## Accepted tradeoff: storage-key reset

Renaming the four storage keys means existing embeds lose persisted state on
upgrade:

- **identity** (`comments:identity` → `airside:identity`) — commenter is re-prompted
  for name/email.
- **launcher position** (`comments:launcher-position`) — floating launcher resets to default.
- **activation** (`comments:key` + `?comments-key`) — one extra `?airside-key`
  activation cycle.

We **accept** this rather than writing a dual-read migration shim. Justification:
pre-1.0, effectively one production consumer, and a shim adds permanent complexity
to retire a one-time cost.

## Execution sequence (strict ordering)

The deprecation pointer requires the airside packages to already exist on npm, so
order matters:

1. **(Done — release cut)** The final `@airnauts/comments-*` release is **`0.7.0`**,
   versioned and pushed on `main` (`b12f41b`, includes the unified `*Extension`
   factories). **Gate before cutting the rename branch: confirm npm actually serves
   `0.7.0`** — the CI publish job runs after the push, and it must finish first or the
   two publish runs collide. (At time of writing npm still served `0.6.0`, i.e. the
   `0.7.0` publish was still in flight.)
2. Rename the GitHub repo `Airnauts/commenting-tool` → `Airnauts/airside`
   (auto-redirects old URLs, clones, issues, PRs, stars).
3. On the rename branch, atomically flip: package names, `workspace:^` deps, repo
   URLs (`repository`/`homepage`/`bugs`), public symbols, `air:` prefix + `--air-*`
   vars, `data-airside-*`, storage keys, query params, header, env vars, test-ids,
   `.changeset/config.json` lists, CI/`RELEASING.md` refs, docs/README prose, ADR-0038.
4. One `fixed`-group changeset (breaking → **minor** per pre-1.0 policy);
   `pnpm version-packages`.
5. Merge to `main` → **CI publishes** `@airnauts/airside-*`.
6. **After** airside is live on npm: `npm deprecate` each old package pointing at its
   replacement. Nine are a clean prefix swap (`comments-X` → `airside-X`); the three
   extension packages map explicitly: `comments-notifier-slack` →
   `airside-extension-slack`, `comments-notifier-email` → `airside-extension-email`,
   `comments-integration-jira` → `airside-extension-jira`. (Confirmed: `comments@0.7.0`
   kept the `notifier-*`/`integration-*` package names — only the factory *symbols*
   unified — so these three published names are exactly what gets deprecated.)

## Version strategy

Continue the line. Package **directories do not change** (`packages/core`, etc.),
so each `CHANGELOG.md` stays in place with full history; resetting to 0.1.0 would
contradict a changelog already showing 0.5.x. Airside debuts **one minor above** the
final `comments` release, which is **`0.7.0`** — released on `main` (`b12f41b`), the
fixed group bumped by the unify-factory-names changeset. Airside therefore debuts at
**`0.8.0`** (`comments@0.7.0` → `airside@0.8.0`), same code, same maturity.

## Records & docs

- **ADR-0038** — "Rebrand `comments` → `airside`." Status accepted; supersedes the
  naming portion of ADR-0020. Context (brand clarity / Airnauts tie-in), decision
  (full rebrand, deprecate-with-pointer, repo rename in place), consequences
  (storage reset, one breaking minor, cross-repo consumer break).
- Sweep titles, package tables, and install snippets across `README.md`,
  `packages/*/README.md`, `docs/prd.md`, `docs/architecture.md`, `docs/adr.md`,
  `RELEASING.md`.

## Out of scope (tracked, not forgotten)

- **lear-frontend** (separate repo, branch `feat/comments-tool`) is the one published
  consumer. The rebrand breaks its embed: new package names, `airsideKey` prop,
  `?airside-key`. Update is a **cross-repo follow-up**, not part of this spec.
- **Managed-cloud / hosted SaaS** branding (roadmap) — out of scope.

## Verification

- `pnpm -w build` and `pnpm -w test` green after the flip (no stale
  `@airnauts/comments-*` resolution).
- `grep -rn 'comments' --include='*.ts' --include='*.tsx' --include='*.json'` reviewed:
  every remaining hit is provably **domain** (Comment type, data field, DB name, UI copy).
- Playwright e2e green against the renamed `data-airside-*` test-ids.
- `size-limit` config name updated; widget CSS regenerates with `air:` prefix.
