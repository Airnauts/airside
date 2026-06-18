---
name: airside-agent
description: The autonomous task orchestrator for Airnauts/airside. Run on a timer via `/loop 5m /airside-agent`. Each tick it scans GitHub issues labelled `agent`, and for the simple path drives them issue → branch → draft PR → automated review → auto-fix high findings → ready, spawning isolated builder/reviewer/fixer subagents. Idempotent: re-running never redoes finished work. Invoke directly to run one tick by hand.
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

> **Current scope — Slices 1–3.** Both paths are live. **Simple:** a labelled issue is built into a
> **draft PR**, auto-**reviewed**, high/critical findings **auto-fixed** (capped), and promoted
> **draft → ready** at `state:in-review`. **Complex:** the issue is **triaged**, a **spec** is
> researched and posted for you to **`/approve` or `/revise`**, and on approval it joins the same
> build → review → ready path. The post-ready PR-comment fixer (Slice 4) and terminal hardening
> (Slice 5) are still to come; this runbook says where they plug in and parks anything it can't yet
> handle with a note (it never silently drops work). See `docs/adr.md` (ADR-0042).

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

### The issue markers

One per concern, HTML-comment-wrapped so you never confuse your own structured state, your spec,
your review findings, and the user's chatter:

- `<!-- airside-agent-state {json} -->` — the authoritative structured state (one per issue).
- `<!-- airside-agent-review {json} -->` — one per review round: the reviewer's findings keyed by
  the head `sha` it reviewed. This (not a state field) is what drives the review→fix loop.
- `<!-- airside-agent-spec v<n> -->` — the spec (complex path). The **highest version** is current;
  it is the `awaiting-approval` artifact and the builder's source of truth.
- `<!-- airside-agent-note -->` — human-facing notes (escalations, review/promotion summaries,
  "re-approve please"). **These four `airside-agent-*` markers also identify the bot's own
  comments** — see the disambiguation rule in the approval step.

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

Written through Slice 3: `type`, `phase`, `branch`, `prNumber`, `updatedAt`, plus `specVersion`,
`lastSpecInputHash` (sha256 of the issue `title+body` at spec time — a later body edit ⇒ a
revision), and `lastSeenCommentAt` (the owner-comment watermark). `lastReviewedSha`/`reviewIterations`
are an **informational cache only** — the review→fix loop is driven by the `airside-agent-review`
notes (artifacts), never these fields. Likewise the approval flow is driven by the
`airside-agent-spec` comment + the watermark, not by trusting `phase` alone. Keep all keys so the
shape is stable.

### Phase → label

Mirror the computed phase to exactly one `state:*` label (mutually exclusive): `triage`,
`speccing`, `awaiting-approval`, `building`, `reviewing`, `in-review`, `done`, `blocked`.
(`cancelled` has no label — it just gets the pickup + state labels stripped.)

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

- **First, honour resting states.** If the recorded phase is `in-review`, `blocked`, `done`, or
  `cancelled`, do **not** re-derive it from artifacts — these are stable. Run the terminal check
  in (b) only (a merge/close moves them to `done`/`cancelled`); otherwise leave the phase and
  labels exactly as they are and do no op this tick. This is what stops a finished (ready) PR
  from being re-promoted every tick — no label flapping, no repeated `gh pr ready`, no duplicate
  promotion notes. (Slice 4 makes `in-review` active again for PR-review comments; Slice 5 adds a
  `blocked` retry. Until then they wait for the human.)
- An **open PR** exists (and the phase isn't resting) → record its `prNumber` and map by draft
  state: PR is **draft** → phase `reviewing` (the review→fix loop owns it); PR is **ready** (not
  draft) → phase `in-review`. (Merged/closed is the terminal check in (b).)
- Branch exists, no PR → phase = `building` (a prior build needs to **finish + open the PR**;
  the builder is idempotent and will adopt the branch).
- **No branch, no PR — these phases have no artifact, so honour the state comment / spec comment;
  never re-derive them (or you'll re-spec, or build an unapproved task):**
  - An `airside-agent-spec` comment exists → the spec is posted. Phase = `building` **only if the
    state comment already says `building`** (you approved it); otherwise `awaiting-approval`. This
    also crash-collapses a `speccing` op that posted the spec but died before the state update — it
    becomes `awaiting-approval`, never a duplicate spec.
  - No spec comment, recorded phase is `triage` or `speccing` → honour it (mid-entry, crash-safe).
  - No spec comment, recorded phase `building` → `building` (a fresh/approved simple task).
  - No state comment / `phase=null` → **fresh pickup → classify in (d).**

**(d) Classify (fresh pickups only).** Set `type` and the entry phase:

- `agent:simple` label → `type=simple`, phase `building`.
- `agent:complex` label → `type=complex`, phase `speccing`.
- neither → phase `triage` (the triage op in §3 sets `type`, then routes to `building`/`speccing`).

**(d2) Evaluate approval (only when phase is `awaiting-approval`).** Cheap (`gh` only); a `/revise`
defers to the spec-reviser op in §3.

```bash
gh api repos/Airnauts/airside/issues/<n>/comments \
  --jq '.[] | {id, createdAt, login: .user.login, body}'
```

Consider only **owner commands**: comments where `login == OWNER`, `createdAt > lastSeenCommentAt`,
and the body contains **no** `airside-agent-` marker. That last clause is essential — the bot posts
as the same login as the owner, so its own state/spec/notes must be excluded. Classify each by its
**leading line**: `/approve`, `/revise <notes>`, `/stop`; plus a bare-word approve fallback
(trimmed + lowercased ∈ `approve|approved|lgtm|ship it|✅`). Also compute `bodyChanged =
sha256(title+body) != lastSpecInputHash`. Over the new owner commands, chronologically:

- any `/stop` → phase `cancelled`; strip `agent` + `state:*`; post a note "cancelled per /stop".
- else any `/revise` **or** `bodyChanged` → **revise** (the spec is about to change, so revision
  wins even if an `/approve` is mixed in): needs the spec-reviser op (§3); gather the `/revise`
  notes (or "the issue description was edited" when only `bodyChanged`).
- else any approve → phase `building`.
- else (chatter/questions only) → no-op.

**Advance `lastSeenCommentAt` to the `createdAt` of the newest owner command you examined — not
`now`** (a slow reviser op could otherwise skip an `/approve` you posted while it ran). On a
body-edit revision, also set `lastSpecInputHash` to the new hash.

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

Collect the issues that need an op: phase `triage` (classify), `speccing` (author the spec),
`building` (build), `reviewing` (review or fix), or `awaiting-approval` **with a pending revision**
from (d2) (author the next spec version). Pick the **oldest** by `updatedAt`, do **one** op, then
end the tick.

> **Invariant: ≤ 1 subagent spawn per tick.** Everything else is `gh`. This bounds the tick
> (each isolated worktree op pays ~1 min of setup) and prevents N concurrent worktrees. Safe
> because ticks are serial. If nothing needs an op, end the tick.

#### `triage` (classify)

Spawn `airside-triage` (read-only, no worktree). Read its `TYPE:` line → set `type` and route:
`simple` → phase `building`; `complex` → phase `speccing`. (Triage defaults to `complex` when
unsure — the gated path is the safe one.)

#### `speccing` (author the spec)

Spawn `airside-spec-author` (read-only, no worktree). Extract the spec between its `<<<SPEC` /
`SPEC>>>` sentinels and post it as a new comment:

```
<!-- airside-agent-spec v1 -->
<spec markdown>

---
🤖 Reply **`/approve`** to build, **`/revise <notes>`** to change it, or **`/stop`** to cancel.
```

Then set `specVersion=1`, `lastSpecInputHash = sha256(title+body)`, and `lastSeenCommentAt` = the
newest existing comment's `createdAt` (so prior chatter isn't read as a command), phase
`awaiting-approval`. (If a spec comment already exists — crash recovery — adopt it instead of
re-authoring; reconcile (c) already routes that to `awaiting-approval`.)

#### `awaiting-approval` with a pending revision (author the next spec version)

Only when (d2) flagged a revision. Spawn `airside-spec-reviser` with the highest-version spec as
`CURRENT_SPEC` and the gathered notes as `REVISION_NOTES`. Post the result as a new
`<!-- airside-agent-spec v(n+1) -->` comment (same footer), bump `specVersion`, post a short
`airside-agent-note` "applied your revisions — please re-`/approve`", and stay `awaiting-approval`.
(The watermark was advanced in (d2), so the same `/revise` won't re-trigger; a later `/approve`
will.)

#### `building`

Spawn the **builder** once (contract below). Set `state:building` before spawning (intent); on
`STATUS: ok` with a `PR_NUMBER`, record it and set phase `reviewing` (commit-last — the proof is
the PR artifact, never the label). Builder failed / no PR → `state:blocked` + an
`airside-agent-note` explaining what to do.

#### `reviewing` (the review → fix → re-review loop)

The pivot is an **artifact, not a state field**: is there an `airside-agent-review` note whose
`sha` equals the PR's current `headRefOid`? (We must key on the note, never on `lastReviewedSha` —
a Slice-1 PR already has that field set with no review behind it, and acting on it would promote
an unreviewed PR.)

```bash
HEAD=$(gh pr view <pr> --repo Airnauts/airside --json headRefOid -q .headRefOid)
# all review notes, newest last; the orchestrator parses the JSON in each:
gh api repos/Airnauts/airside/issues/<n>/comments \
  --jq '.[] | select(.body|contains("airside-agent-review")) | .body'
```

- **No review note for `HEAD`** (code is new or unreviewed) → **review** is the op. Spawn
  `airside-reviewer` (read-only, no worktree). Post its findings as an `airside-agent-review` note
  (machine JSON keyed by `sha=HEAD` + a human summary). Then **end the tick** — acting on the
  findings happens next tick (keeps it one op/tick and crash-safe).
- **A review note for `HEAD` exists** → act on it:
  - `highs` = its findings with severity `critical` or `high`.
  - **`highs` empty** → promote: `gh pr ready <pr>` → phase `in-review`; post a human summary note
    (list any medium/low for the reviewer to consider). Done.
  - **`highs` non-empty** → check the cap. `H` = number of `airside-agent-review` notes whose
    findings include ≥1 `critical`/`high`. If **`H > REVIEW_CAP`** → phase `blocked` + an escalation
    note listing the unresolved highs (already auto-fixed `REVIEW_CAP` times). Otherwise → **fix**:
    capture `HEAD` (pre-fix sha), spawn `airside-fixer` with the `highs` batch. **Verify progress by
    head-delta, not the fixer's word**: re-read the PR head after; if it still equals the pre-fix
    `HEAD` (no new commit) → phase `blocked` + note "fixer made no progress". Otherwise leave phase
    `reviewing` — the new head has no review note, so the next tick re-reviews. Convergence:
    review → fix → re-review until clean (→ `in-review`) or capped (→ `blocked`).

## Triage spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-triage"` (no worktree, read-only).
Fallback: `general-purpose` + `.claude/agents/airside-triage.md` preamble. Pass: `ISSUE`, `REPO`.
It ends with `TYPE: simple` or `TYPE: complex`. Route accordingly; default `complex` if the line is
missing/ambiguous (the safe, gated path).

## Spec-author spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-spec-author"` (no worktree). Fallback:
`general-purpose` + `.claude/agents/airside-spec-author.md`. Pass: `ISSUE`, `REPO`. It returns the
spec between `<<<SPEC` / `SPEC>>>` sentinels — extract that body (it may contain code fences, so
match by the **sentinels**, not by a fenced block) and post it as the `airside-agent-spec v1` comment.

## Spec-reviser spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-spec-reviser"` (no worktree). Fallback:
`general-purpose` + `.claude/agents/airside-spec-reviser.md`. Pass: `ISSUE`, `REPO`, `CURRENT_SPEC`
(the highest-version spec body), `REVISION_NOTES`. It returns the full revised spec between `<<<SPEC`
/ `SPEC>>>` — post it as `airside-agent-spec v(n+1)`.

## Builder spawn contract

Spawn with the **Agent tool**, `isolation: "worktree"` (verified to give a real, locally-built
worktree — see `docs/adr.md`), and `subagent_type: "airside-builder"`. If that subagent type is
not yet registered in this session, fall back to `subagent_type: "general-purpose"` and pass the
**full contents of `.claude/agents/airside-builder.md`** as the prompt preamble.

**Pass the builder:** the issue number `<n>`, `REPO`, `OWNER`, and the canonical branch
`agent/issue-<n>`. The builder reads the issue itself (`gh issue view`) for the body + docs link,
and — for a complex task — the **highest-version `airside-agent-spec` comment** as the approved spec.

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

## Reviewer spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-reviewer"` (**no worktree** — it's
read-only). Fallback: `subagent_type: "general-purpose"` + the contents of
`.claude/agents/airside-reviewer.md` as preamble. Pass: `PR_NUMBER`, `REPO`, `ISSUE`, `BRANCH`,
and `HEAD_SHA` (the current head). It returns one fenced ```json block:
`{headSha, summary, findings:[{severity,confidence,path,line,title,note,fix}]}` with severity in
`critical|high|medium|low`. Save that JSON verbatim into an `airside-agent-review` note keyed by
`sha=HEAD_SHA`. `highs` = findings where severity ∈ {critical, high}.

## Fixer spawn contract

Spawn with the **Agent tool**, `isolation: "worktree"`, `subagent_type: "airside-fixer"`.
Fallback: `general-purpose` + `.claude/agents/airside-fixer.md` preamble. Pass: `PR_NUMBER`,
`REPO`, `ISSUE`, `BRANCH`, and `FINDINGS` = the `highs` array. It returns:

```
STATUS: ok | no-changes | failed
BRANCH: agent/issue-<n>
NEW_HEAD: <sha>
FIXED: <titles>
SKIPPED: <titles + why, or none>
NOTE: <one line>
```

Trust **head-delta**, not `STATUS`: if the PR head is unchanged after the fixer returns, escalate
to `state:blocked` regardless of what it reported. The fixer is also reused in Slice 4 to apply
the human's PR-review threads.

## `gh` gotchas (baked in above, collected here)

- **Labels:** `gh label create "<name>" --color <hex> --force` (upsert — never errors on exists).
- **Editing the state comment needs the REST numeric id**, not the GraphQL node id that
  `gh issue view --json comments` returns. Get it from
  `gh api repos/Airnauts/airside/issues/<n>/comments`, then
  `gh api -X PATCH repos/Airnauts/airside/issues/comments/<id> -F body=@file`.
- **Branch probe without 404 noise:** `git ls-remote --heads origin 'refs/heads/agent/issue-<n>'`.
- **Draft PR guard:** `gh pr list --head agent/issue-<n> --state all --json number` before any create.
- **Draft → ready:** `gh pr ready <pr>` (used when a review round comes back with no highs).
- **Review notes are keyed by head sha**, so a re-pushed branch (new head) always re-reviews;
  count notes-with-highs for the cap rather than trusting a mutable counter.
- The worktree hook auto-names the build branch `worktree-<name>`; the builder pushes to the
  canonical name explicitly: `git push origin HEAD:agent/issue-<n>`.

## Roadmap (where later slices plug in)

- **Slice 2 (done)** — the `reviewing` review→fix→ready loop documented above.
- **Slice 3 (done)** — the complex path (`triage` → `speccing` → `awaiting-approval` grammar) above.
- **Slice 4** — `in-review`: apply the owner's unresolved PR review threads (GraphQL
  `reviewThreads`; actionable = `isResolved==false` & owner-authored & last comment not the
  agent's) → fixer → reply + `resolveReviewThread`.
- **Slice 5** — terminal hardening, round-robin fairness, optional CI-green gate
  (`statusCheckRollup`) before ready, and a global "max active tasks" ceiling.
