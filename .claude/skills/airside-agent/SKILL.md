---
name: airside-agent
description: The autonomous task orchestrator for Airnauts/airside. Run on a timer via `/loop 5m /airside-agent`. Each tick it scans GitHub issues labelled `agent`, and for the simple path drives them issue → branch → draft PR, spawning an isolated builder subagent. Idempotent: re-running never redoes finished work. Invoke directly to run one tick by hand.
---

# airside-agent — issue→PR orchestrator (the `/loop` target)

## Overview

This skill is the **runbook one orchestrator tick executes**. You (the agent running it)
are the orchestrator: you read live GitHub state with `gh`, advance each labelled issue by
**one step**, and spawn an isolated subagent for the heavy work. The user runs it on a timer:

```
/loop 5m /airside-agent
```

`/loop` is **serial** — the next tick only fires once you are idle after the interval, so ticks
never overlap and correctness never depends on timing. You can also invoke `/airside-agent`
once, by hand, to run a single tick (this is how you test it).

> **Current scope — Slice 1.** Only the **simple path** is live: a labelled issue is built
> straight into a **draft PR**, then parked at `state:reviewing`. The complex path (triage →
> spec → approval) and the automated reviewer/fixer loop are later slices — this runbook says
> exactly where they plug in and, until then, parks anything it can't yet handle with a note
> (it never silently drops work). See `docs/adr.md` for the design rationale.

## Config

These are the knobs. Treat them as constants for now; they will move to the top of the file.

| Key | Value |
|---|---|
| `REPO` | `Airnauts/airside` |
| `OWNER` | `MateuszPaulski` (the only login whose `/approve` & PR comments are honoured) |
| `PICKUP_LABEL` | `agent` (you apply it to opt an issue in; remove it to **pause**; close the issue to **kill**) |
| `BRANCH_PREFIX` | `agent/issue-` → a task's canonical branch is `agent/issue-<n>` |
| `REVIEW_CAP` | `3` (Slice 2 — max auto-fix iterations before `state:blocked`) |

## State model — GitHub is the source of truth

Idempotency lives in GitHub, **not** in a committed file. Every tick recomputes the truth from
three tiers, in strict precedence — never trust a lower tier when a higher one disagrees:

1. **Observable artifacts (ground truth)** — issue `state`/`stateReason`; the remote branch
   `agent/issue-<n>`; the PR's existence + `isDraft`/`mergedAt`/`state`; PR `headRefOid`;
   review-thread `isResolved`. **PR-last**: a draft PR is opened only when the build is
   finished, so *"a PR exists ⇔ build complete"* — a clean binary with no half-built ambiguity.
2. **The state comment** — a hint cache for what artifacts can't express.
3. **Labels** — a human-visible mirror, rewritten each tick to match the computed phase.
   **Never authoritative.**

This is what makes a tick that died mid-op safe: the next tick recomputes phase from artifacts.

### The three issue markers

One per concern, HTML-comment-wrapped so you never confuse your own structured state, your spec,
and the user's chatter:

- `<!-- airside-agent-state {json} -->` — the authoritative structured state (one per issue).
- `<!-- airside-agent-spec v<n> -->` — the spec (complex path, Slice 3). Builder uses the highest version.
- `<!-- airside-agent-note -->` — human-facing notes (escalations, "complex path not live yet").

### State JSON

```json
{
  "schema": 1,
  "type": "simple|complex|null",
  "phase": "triage|speccing|awaiting-approval|building|reviewing|in-review|done|blocked|cancelled",
  "branch": "agent/issue-<n>",
  "prNumber": null,
  "specVersion": 0,
  "lastSpecInputHash": null,
  "lastSeenCommentAt": null,
  "reviewIterations": 0,
  "lastReviewedSha": null,
  "updatedAt": "<ISO8601>"
}
```

In Slice 1 only `type`, `phase`, `branch`, `prNumber`, `updatedAt` are written; the rest are
reserved for later slices (keep them in the JSON so the shape is stable).

### Phase → label

Mirror the computed phase to exactly one `state:*` label (mutually exclusive). Phases reachable
in Slice 1: `building`, `reviewing`, `done`, `blocked`, `cancelled`. (`cancelled` has no label —
it just gets the pickup + state labels stripped.)

## Per-tick algorithm

### 0. Preflight (cheap, once per tick)

- `gh auth status` succeeds; default repo resolves to `Airnauts/airside`.
- Ensure labels exist (idempotent upsert — safe to run every tick):
  `gh label create "agent" --color 5319e7 --force` … and the five `agent:simple` / `state:*`
  labels (see `docs/adr.md` for the full list). Skip if you confirmed them this session.

### 1. Scan

```bash
gh issue list --repo Airnauts/airside --label agent --state open \
  --json number,title,labels,updatedAt
```

No results → report "no actionable airside-agent tasks" and end the tick.

### 2. Cheap pass — for EVERY scanned issue, no subagents

For each issue `<n>`, in this order:

**(a) Load state.** Fetch the state comment (note: editing it later needs the REST *numeric* id):

```bash
gh api repos/Airnauts/airside/issues/<n>/comments \
  --jq '.[] | select(.body|contains("airside-agent-state")) | {id, body}'
```

Parse the JSON between the marker. No state comment yet → this is a fresh pickup (`phase=null`).

**(b) Terminal check FIRST (kill switch / completion).**

```bash
gh issue view <n> --repo Airnauts/airside --json state,stateReason
```

- Issue `CLOSED` → phase = `done` if `stateReason==COMPLETED`, else `cancelled`. Strip
  `agent` + every `state:*` label; write the terminal phase to the state comment; **skip** the issue.
- If state has a `prNumber`: `gh pr view <pr> --repo Airnauts/airside --json state,isDraft,mergedAt`
  → `mergedAt` set ⇒ `done` (strip `agent`, set `state:done`); closed-unmerged ⇒ `cancelled`.

**(c) Reconcile artifacts → compute the true phase.**

```bash
git ls-remote --heads origin "refs/heads/agent/issue-<n>"          # branch exists?
gh pr list --repo Airnauts/airside --head agent/issue-<n> --state all \
  --json number,isDraft,state                                       # PR exists?
```

- An open PR exists → phase = `reviewing`; record its `prNumber`. (Build is done — PR-last.)
- Branch exists, no PR → phase = `building` (a prior build needs to **finish + open the PR**;
  the builder is idempotent and will adopt the branch).
- No branch, no PR → phase = `building` **fresh** (if the issue is `simple` — see (d)).

**(d) Classify (Slice 1).**

- Issue carries the `agent:simple` label → `type=simple`. Proceed.
- Otherwise → **complex path, not live in Slice 1.** Post the note **once** (guard: skip if a
  `airside-agent-note` comment already mentions the complex path):
  > 🤖 airside-agent: the complex path (spec → approval) lands in a later slice. Add the
  > **`agent:simple`** label and I'll build this directly.
  Leave the issue otherwise untouched; **skip** it this tick.

**(e) Repair labels + refresh state comment** to the computed phase (create the state comment if
absent). Editing an existing state comment uses the REST numeric id from (a):

```bash
printf '%s' "<!-- airside-agent-state {json} -->" > /tmp/airside-state-<n>.md
gh api -X PATCH repos/Airnauts/airside/issues/comments/<commentId> -F body=@/tmp/airside-state-<n>.md
# or, first time:  gh issue comment <n> --repo Airnauts/airside --body-file /tmp/airside-state-<n>.md
gh issue edit <n> --repo Airnauts/airside --add-label state:<phase> --remove-label <previous-phase>
```

Remove only the *recorded previous* phase label (avoids "label not on issue" errors).

### 3. Expensive op — spawn AT MOST ONE subagent

Among issues whose computed phase is `building` with `type=simple`, pick the **oldest** by
`updatedAt`, and spawn the builder **once** (see the spawn contract). Set `state:building` before
spawning (intent), and on success record `prNumber`, set phase `reviewing` (commit-last — the
proof is the PR artifact, never the label). If the builder fails or returns no PR → set
`state:blocked` + an `airside-agent-note` explaining what to do.

> **Invariant: ≤ 1 subagent spawn per tick.** Everything else is `gh`. This bounds the tick
> (each isolated build pays ~1 min of worktree setup) and prevents N concurrent worktrees.
> Safe because ticks are serial.

If no issue is in `building`, end the tick. (In Slice 1, reaching `reviewing` is the finish line
— the reviewer/fixer loop is Slice 2; until then a `reviewing` issue is simply left for the
human to review the draft PR.)

## Builder spawn contract

Spawn with the **Agent tool**, `isolation: "worktree"` (verified to give a real, locally-built
worktree — see `docs/adr.md`), and `subagent_type: "airside-builder"`. If that subagent type is
not yet registered in this session, fall back to `subagent_type: "general-purpose"` and pass the
**full contents of `.claude/agents/airside-builder.md`** as the prompt preamble.

**Pass the builder:** the issue number `<n>`, `REPO`, `OWNER`, and the canonical branch
`agent/issue-<n>`. The builder reads the issue itself (`gh issue view`) for the body + docs link.

**The builder MUST return** these machine-parseable lines (you grep them):

```
STATUS: ok | failed
BRANCH: agent/issue-<n>
PR: <url>            # absent on failure
PR_NUMBER: <n>       # absent on failure
NOTE: <one line>     # what it did, or why it failed
```

On `STATUS: ok` with a `PR_NUMBER` → record it, phase `reviewing`. On anything else →
`state:blocked` + note.

## `gh` gotchas (baked in above, collected here)

- **Labels:** `gh label create "<name>" --color <hex> --force` (upsert — never errors on exists).
- **Editing the state comment needs the REST numeric id**, not the GraphQL node id that
  `gh issue view --json comments` returns. Get it from
  `gh api repos/Airnauts/airside/issues/<n>/comments`, then
  `gh api -X PATCH repos/Airnauts/airside/issues/comments/<id> -F body=@file`.
- **Branch probe without 404 noise:** `git ls-remote --heads origin 'refs/heads/agent/issue-<n>'`.
- **Draft PR guard:** `gh pr list --head agent/issue-<n> --state all --json number` before any create.
- **Draft → ready (Slice 2):** `gh pr ready <n>`.
- The worktree hook auto-names the build branch `worktree-<name>`; the builder pushes to the
  canonical name explicitly: `git push origin HEAD:agent/issue-<n>`.

## Roadmap (where later slices plug in)

- **Slice 2** — `reviewing`: if `headOid != lastReviewedSha` spawn `airside-reviewer`; 0 high
  findings → `gh pr ready` → `in-review`; high findings → `airside-fixer` (cap `REVIEW_CAP`,
  then `state:blocked`).
- **Slice 3** — complex path: `triage` → `spec-author` → post `airside-agent-spec` → owner-only
  `/approve` `/revise` `/stop` grammar (revision wins over approve; a changed `sha256(title+body)`
  counts as a revision) → build.
- **Slice 4** — `in-review`: apply the owner's unresolved PR review threads (GraphQL
  `reviewThreads`; actionable = `isResolved==false` & owner-authored & last comment not the
  agent's) → fixer → reply + `resolveReviewThread`.
- **Slice 5** — terminal hardening, round-robin fairness, optional CI-green gate
  (`statusCheckRollup`) before ready, and a global "max active tasks" ceiling.
