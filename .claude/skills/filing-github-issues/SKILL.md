---
name: filing-github-issues
description: Use when filing a GitHub issue for the airside project (repo `Airnauts/airside`) — asked to "create a GitHub issue", "open an enhancement/bug issue", or "file an issue" for a new feature idea or a known rough edge in shipped behavior. Covers the repo's title, label, and body conventions and the `gh` command.
---

# Filing GitHub Issues

## Overview

**GitHub issues in `Airnauts/airside` are the single source of truth for the backlog.**
The in-repo `docs/ideas.md` / `docs/issues.md` backlogs were retired (June 2026) — file
ideas and known rough edges as GitHub issues directly, and write each one to **stand on its
own**: the full rationale lives in the issue body, not in a doc it links back to.

- **Forward-looking feature / capability** → an **`enhancement`** issue.
- **Rough edge in already-shipped behavior** → a **`bug`** issue.

An issue is a pitch + an implementation sketch + (for bugs) a root cause + the load-bearing
detail someone would need to pick it up later. Keep it concrete but not a full design doc —
deeper design still graduates to `docs/adr.md` + a milestone if and when the item is
committed to.

Use the authenticated `gh` CLI. Default repo: `Airnauts/airside`.

## Before filing

1. **Check for duplicates:**
   `gh issue list --repo Airnauts/airside --state all --search "<keywords>"`.
2. **Pick the label** by kind: `enhancement` (new capability) vs `bug` (shipped rough edge).
3. **Gather the load-bearing detail** — concrete file paths, the seam to reuse, the gotcha
   to resolve first — so the issue is self-contained. Grep/read the code to ground it.

## Title — `Area: short lowercase description`

Prefix with the subsystem, a colon, then a concise lowercase summary. Areas in use:
`Widget`, `Comments`, `Adapters`, `Integrations`, `Real-time`, `Hosts`. Examples:

- `Widget: re-navigate to a thread's pin from the open detail`
- `Adapters: more persistence backends (SQLite, MySQL)`
- `Integrations: Jira comment sync (mirror later replies into the linked issue)`

## Label

- `enhancement` — new feature / capability. The default.
- `bug` — incorrect or rough behavior in shipped code.
- Others exist (`documentation`, `question`, …) but the backlog is almost all
  `enhancement`. One label is the norm.

## Body — self-contained

Write the body to a temp file (avoids shell-escaping backticks/quotes in the body), then
pass it with `--body-file`. There is **no** "rationale lives in docs" footer — the issue
carries its own rationale. Link the README roadmap (`../blob/main/README.md#roadmap`,
repo-relative so it resolves on github.com) **only if** the item actually appears there.

### Enhancement

````md
<One-line pitch: what the user gets, and the gap today.>

**Status:** parking lot — <one clause: scope / why deferred>.

**Shape:** <implementation sketch with concrete file refs — what to reuse and where, the
real gaps to resolve, rough effort. Enough that an engineer could pick it up cold.>
````

Worked example — issue #28 (self-contained, no doc link):

> Return to a thread's pin from the open detail after you've scrolled away. Today opening
> a thread scrolls to its pin once; if you then scroll elsewhere there's no way back — you
> have to close the detail and re-open it.
>
> **Status:** parking lot — a focused UI affordance.
>
> **Shape:** the scroll machinery already exists — `requestFocus(id)` … (`marker/useFocusPin.ts`).
> Make the page-context card clickable (`ui/ThreadConversation.tsx`) and re-run the
> same-page-vs-cross-page split in `PanelDrawer.onSelect`.

### Bug

````md
**Symptom.** <what the user sees>

**Root cause.** <the mechanism, with file:line refs>

**Impact.** <severity / blast radius>

**Proposed fix.** <the validated fix, or note it's not yet investigated>
````

## Create

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
| Filing a thin stub that points at a doc for the "real" rationale | Issues are self-contained now — put the rationale in the body. |
| No `Area:` prefix | Titles are `Area: lowercase summary` (see the in-use areas above). |
| Footer links without the `../` | Repo-relative links are `../blob/main/...`, not bare `blob/main/...`. |
| Claiming "From the README roadmap" for an item that isn't there | Only link the roadmap if the item actually appears in it. |
| `bug` label on a new feature (or vice-versa) | `enhancement` = new capability; `bug` = shipped rough edge. |
