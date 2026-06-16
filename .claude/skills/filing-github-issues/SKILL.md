---
name: filing-github-issues
description: Use when filing a GitHub issue for the airside project (repo `Airnauts/airside`) — asked to "create a GitHub issue", "open an enhancement/bug issue", "file an issue", or to promote a `docs/ideas.md` / `docs/issues.md` entry into a tracked issue. Covers the repo's title, label, and body conventions and the `gh` command.
---

# Filing GitHub Issues

## Overview

GitHub issues in `Airnauts/airside` are **lightweight trackers that mirror the two
in-repo backlogs** — the rationale lives in the docs, the issue points back to it:

- `docs/ideas.md` (forward-looking features) → **`enhancement`** issues.
- `docs/issues.md` (rough edges in shipped behavior) → **`bug`** issues.

So an issue is a short pitch + an implementation sketch + a link home — **not** a full
design. Issues #9–#28 were created this way (e.g. the "Detail-view prev/next navigation"
idea → #9, "Smooth pin positioning" → #12, "Re-navigate to a thread's pin" → #28). Keep
new ones consistent with that shape.

Use the authenticated `gh` CLI. Default repo: `Airnauts/airside`.

## Before filing

1. **Make sure the rationale exists in the docs.** The issue links back to a docs entry
   as the source of truth. If the item isn't yet in `docs/ideas.md` (a feature) or
   `docs/issues.md` (a shipped rough edge), add it there first, then file the issue. Each
   file's header explains its own scope — `ideas.md` is forward-looking, `issues.md` logs
   shipped rough edges; pick by which the item is.
2. **Check for duplicates:**
   `gh issue list --repo Airnauts/airside --state all --search "<keywords>"`.

## Title — `Area: short lowercase description`

Prefix with the subsystem, a colon, then a concise lowercase summary. Areas in use:
`Widget`, `Comments`, `Adapters`, `Integrations`, `Real-time`, `Hosts`. Examples:

- `Widget: re-navigate to a thread's pin from the open detail`
- `Adapters: more persistence backends (SQLite, MySQL)`
- `Integrations: Jira comment sync (mirror later replies into the linked issue)`

## Label

- `enhancement` — new feature / capability (the `docs/ideas.md` case). The default.
- `bug` — incorrect or rough behavior in shipped code (the `docs/issues.md` case).
- Others exist (`documentation`, `question`, …) but the backlog is almost all
  `enhancement`. One label is the norm.

## Body

### Enhancement (mirrors a `docs/ideas.md` entry)

````md
<One-line pitch: what the user gets, and the gap today.>

**Status:** parking lot — <one clause: scope / why deferred>.

**Shape:** <implementation sketch with concrete file refs — what to reuse and where.
Keep it to the load-bearing detail, not a full design.>

_Rationale in [`docs/ideas.md`](../blob/main/docs/ideas.md) ("<Entry heading>")._
````

The footer uses **repo-relative `../blob/main/...` links** (relative to the issue URL) so
they resolve on github.com. Link the README roadmap too (`../blob/main/README.md#roadmap`)
**only if** the item is actually in `README.md`'s roadmap — the #9–#26 batch was; ad-hoc
additions are not, so don't claim it for them.

Worked example — issue #28:

> Return to a thread's pin from the open detail after you've scrolled away. Today opening
> a thread scrolls to its pin once; if you then scroll elsewhere there's no way back — you
> have to close the detail and re-open it.
>
> **Status:** parking lot — a focused UI affordance.
>
> **Shape:** the scroll machinery already exists — `requestFocus(id)` … (`marker/useFocusPin.ts`).
> Make the page-context card clickable (`ui/ThreadConversation.tsx`) and re-run the
> same-page-vs-cross-page split in `PanelDrawer.onSelect`.
>
> _Rationale in [`docs/ideas.md`](../blob/main/docs/ideas.md) ("Re-navigate to a thread's pin …")._

### Bug (mirrors a `docs/issues.md` entry)

Reuse the `issues.md` structure so the issue and the doc stay parallel:

````md
**Symptom.** <what the user sees>

**Root cause.** <the mechanism, with file:line refs>

**Impact.** <severity / blast radius>

**Proposed fix.** <the validated fix, or "see docs/issues.md">

_Logged in [`docs/issues.md`](../blob/main/docs/issues.md) ("<Entry heading>")._
````

## Create

Write the body to a temp file (avoids shell-escaping backticks/quotes in the body), then:

```bash
gh issue create \
  --repo Airnauts/airside \
  --title "Widget: <short description>" \
  --label enhancement \
  --body-file <tmp>/issue-body.md
```

`gh issue create` prints the new issue URL — report it back. Filing an issue is an
outward-facing action: file the one the user asked for; if related items turn up (e.g. a
bug discovered while writing an enhancement), **offer** to file them rather than batching
extras unasked.

## Common mistakes

| Mistake | Reality |
|---|---|
| Pasting the full design into the issue | Issue = pitch + sketch + link; the rationale lives in `docs/`. |
| No `Area:` prefix | Titles are `Area: lowercase summary` (see the in-use areas above). |
| Footer links without the `../` | Footer links are repo-relative `../blob/main/...`, not bare `blob/main/...`. |
| Claiming "From the README roadmap" for an ad-hoc item | Only the #9–#26 batch came from the roadmap. |
| Filing with no docs entry to link | Add the `ideas.md` / `issues.md` entry first; the issue links to it. |
| `bug` label on a new feature (or vice-versa) | `enhancement` = `ideas.md`; `bug` = `issues.md`. |
