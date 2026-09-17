---
name: airside-agent
description: The autonomous issue→PR task orchestrator for the repo configured in §Config. Run on a timer via `/loop 5m /airside-agent`. Each tick it scans GitHub issues labelled `agent`, and for the simple path drives them issue → branch → draft PR → automated review → auto-fix high findings → ready, spawning isolated builder/reviewer/fixer subagents. Idempotent: re-running never redoes finished work. Invoke directly to run one tick by hand, or `/airside-agent file <description>` to file a new issue instead of running a tick.
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
once, by hand, to run a single tick (this is how you test it), or with arguments —
`/airside-agent file <description>` — to **file an issue instead of running a tick** (§ Filing
mode below).

This file keeps the **algorithm**; the exact `gh`/`graphql`/`jq` invocations live in
**`references/github.md`** as named recipes ("run the `scan` recipe"). The provider seam —
the abstract operations a Jira-backed implementation would supply instead — is documented in
**`references/providers.md`**.

> **Current scope.** The full pipeline is live. **Simple:** a labelled issue is built
> into a **draft PR**, auto-**reviewed**, high/critical findings **auto-fixed** (capped), CI-gated,
> and promoted **draft → ready** at `state:in-review`. **Complex:** the issue is **triaged**, a
> **spec** is researched and posted for you to **`/approve`** (optionally `/approve <notes>` to fold
> small adjustments straight into the build), **`/revise <notes>`** (→ a visible `revising` state
> while the spec is re-authored), or **`/stop`**, then joins the build → review → ready path.
> **In review:** the comments you leave — **inline review threads and top-level PR comments** — are
> picked up, fixed, and acknowledged. **Conflicts:** a PR that develops merge conflicts becomes
> actionable — one autonomous merge-of-main attempt, then escalation to you. **Terminal:** a merge →
> `done`, a close → `done`/`cancelled` (kill switch). The runbook parks anything it can't handle
> with a note (it never silently drops work). See `docs/adr.md` (ADR-0042, ADR-0043, ADR-0050).
>
> **Deferred (no observed need yet):** round-robin fairness across many simultaneously-active issues,
> and a global `MAX_ACTIVE` ceiling — the `≤1 op/tick` invariant + the user-started loop already bound
> burn. Add them if real multi-issue contention or unattended runs show up.

## Config

These are the knobs — **the single source of these values**. Everywhere this file, the
recipes, and the spawn contracts say `<REPO>`, `<OWNER>`, `<PICKUP_LABEL>`,
`<BRANCH_PREFIX>`, or `<REVIEW_CAP>`, substitute the value from this table; no call site
carries a literal of its own.

| Key | Value |
|---|---|
| `REPO` | `Airnauts/airside` |
| `OWNER` | `MateuszPaulski` (the only login whose `/approve` & PR comments are honoured) |
| `PICKUP_LABEL` | `agent` (you apply it to opt an issue in; remove it to **pause**; close the issue to **kill**) |
| `BRANCH_PREFIX` | `agent/issue-` → a task's canonical branch is `<BRANCH_PREFIX><n>` |
| `REVIEW_CAP` | `3` (max auto-fix iterations before `state:blocked`) |

GraphQL calls split the repo into owner and name: `<OWNER_GRAPHQL>`/`<NAME_GRAPHQL>` are
**derived from `REPO`** (split at the `/`, e.g. `REPO=Airnauts/airside` →
`-F o=Airnauts -F r=airside`) — never a separate knob.

## Filing mode — `/airside-agent file <description>` (no tick)

When invoked with arguments beginning `file`, do **not** run a tick: file **one** GitHub
issue, report its URL, and stop. Run it **inline — no subagent**: filing requires
interviewing the owner first, and only the top-level invocation can converse with the user.

- Follow the **`filing-github-issues` skill** end-to-end — interview first, duplicate check,
  `Area:` title, `enhancement`/`bug` label, self-contained body. The command surface is the
  `create-issue` recipe.
- **Loop opt-in is an explicit interview question:** add `<PICKUP_LABEL>` **only if the owner
  says the agent should also build it**. The default is to file *without* it, so filing never
  accidentally feeds the loop.
- A no-argument invocation never enters this mode; the timer loop always invokes with no
  arguments. (Jira later: this mode maps to the `createTask` seam in `references/providers.md`.)

## State model — GitHub is the source of truth

Idempotency lives in GitHub, **not** in a committed file. Every tick recomputes the truth from
three tiers, in strict precedence — never trust a lower tier when a higher one disagrees:

1. **Observable artifacts (ground truth)** — issue `state`/`stateReason`; the remote branch
   `<BRANCH_PREFIX><n>`; the PR's existence + `isDraft`/`mergedAt`/`state`; PR `headRefOid`;
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
  the head `sha` it reviewed. This (not a state field) is what drives the review→fix loop. Lives on
  the **issue** (machine-only).
- `<!-- airside-agent-review-report:<sha> -->` — the **human-readable** copy of that round's findings,
  posted as a top-level comment on the **PR** (all severities) so review leaves a visible trace.
  Keyed by the reviewed sha (its idempotency key); one per review round.
- `<!-- airside-agent-spec v<n> -->` — the spec (complex path). The **highest version** is current;
  it is the `awaiting-approval` artifact and the builder's source of truth.
- `<!-- airside-agent-note -->` — human-facing notes (escalations, review/promotion summaries,
  "re-approve please").
- Replies/acks the bot posts on PR threads carry the visible prefix `🤖 airside-agent:`; **top-level**
  PR-comment acks also embed `<!-- airside-agent-ack:tl-<commentId> -->`, marking each handled comment
  by id (the top-level idempotency key — see the `in-review` op).

> **Bot-comment rule (the disambiguation device — used everywhere the bot reads "owner" comments).**
> The loop runs under the **owner's own login**, so login can't distinguish bot from human. A comment
> is the **bot's own** (exclude it from every owner-command / actionability check) **iff its body
> contains `<!-- airside-agent` (the HTML marker opener) OR `🤖 airside-agent` (the ack prefix).** A
> human merely *mentioning* "airside-agent" in prose is **not** excluded — match the precise markers,
> never the bare word.

### State JSON

```json
{
  "schema": 1,
  "type": "simple|complex|null",
  "phase": "triage|speccing|awaiting-approval|revising|building|reviewing|in-review|done|blocked|cancelled",
  "branch": "<BRANCH_PREFIX><n>",
  "prNumber": null,
  "specVersion": 0,
  "lastSpecInputHash": null,
  "lastSeenCommentAt": null,
  "reviewIterations": 0,
  "lastReviewedSha": null,
  "updatedAt": "<ISO8601>"
}
```

Written fields: `type`, `phase`, `branch`, `prNumber`, `updatedAt`, plus `specVersion` and
`lastSpecInputHash` (sha256 of the issue `title+body` as of the latest spec — a later body edit ⇒ a
revision). `lastReviewedSha`/`reviewIterations`/`lastSeenCommentAt` are an **informational cache
only**: the review→fix loop is driven by the `airside-agent-review` notes, and the approval flow by
the `airside-agent-spec` comment's timestamp (commands must be newer than it) — never by trusting
these fields or `phase` alone. Keep all keys so the
shape is stable.

### Phase → label

Mirror the computed phase to exactly one `state:*` label (mutually exclusive): `triage`,
`speccing`, `awaiting-approval`, `revising`, `building`, `reviewing`, `in-review`, `done`, `blocked`.
(`cancelled` has no label — it just gets the pickup + state labels stripped.)

## Per-tick algorithm

### 0. Preflight (cheap, once per tick)

- `gh auth status` succeeds; default repo resolves to `<REPO>`.
- Ensure labels exist (idempotent upsert — safe to run every tick):
  `gh label create "<PICKUP_LABEL>" --color 5319e7 --force` … and the `agent:simple` /
  `state:*` labels (see `docs/adr.md` for the full list). Skip if you confirmed them this session.

### 1. Scan — one consolidated read

**Run the bundled read-only script as the tick's first tool call:**

```bash
.claude/skills/airside-agent/scripts/tick-scan.sh <REPO>
```

It performs the whole §1–§2 read fan-out (the `<PICKUP_LABEL>` scan; per issue: body/labels/
all comments incl. the state + spec + review markers, linked-PR state, **mergeability**,
inline review threads, top-level PR comments) and emits **one consolidated JSON document** —
collapsing ~4–6 read calls per issue into one call per tick. The `github.md` read recipes
remain the **spec** of these queries; the script is their executable form (if they disagree,
the recipes win and the script gets fixed). Fall back to the individual recipes if the script
fails, and use them to re-read any single fact mid-tick (e.g. a post-push head).

**Writes are never scripted.** Every write below stays an individual recipe: each is
conditional on reasoning, and their commit-last ordering **is** the crash-recovery design
(ADR-0043) — batching them would hide partial-failure states.

No labelled issues → report "no actionable airside-agent tasks" and end the tick.

### 2. Cheap pass — for EVERY scanned issue, no subagents

The tick-scan JSON already contains everything this pass reads. For each issue `<n>`, in this
order:

**(a) Load state.** The `load-state` recipe (note: editing the state comment later needs the
REST *numeric* id it returns). Parse the JSON between the marker. No state comment yet → this
is a fresh pickup (`phase=null`).

**(b) Terminal check FIRST (kill switch / completion).** The `terminal-check` recipe:

- Issue `CLOSED` → phase = `done` if `stateReason==COMPLETED`, else `cancelled`. Strip
  `<PICKUP_LABEL>` + every `state:*` label; write the terminal phase to the state comment;
  **skip** the issue.
- If state has a `prNumber`: `mergedAt` set ⇒ `done` (strip `<PICKUP_LABEL>`, set `state:done`);
  closed-unmerged ⇒ `cancelled`.

**(c) Reconcile artifacts → compute the true phase.** The `reconcile-artifacts` recipe
(branch probe + PR probe).

- **First, honour resting states.** If the recorded phase is `blocked`, `done`, or `cancelled`, do
  **not** re-derive it from artifacts — these are stable. Run the terminal check in (b) only (a
  merge/close moves them to `done`/`cancelled`); otherwise leave the phase and labels exactly as
  they are and do no op this tick (`blocked` waits for the human to un-block).
- An **open PR** exists (phase not resting) → record its `prNumber` and map by draft state: PR is
  **draft** → phase `reviewing` (the review→fix loop owns it); PR is **ready** (not draft) → phase
  `in-review`. (Merged/closed is the terminal check in (b).) `in-review` is **active** — it rests
  unless you have unresolved review threads, which the §3 `in-review` op applies. The map/label
  write is idempotent (same phase ⇒ no churn), so a finished, comment-free PR still doesn't flap.
- **Mergeability (conflict detection).** When the open PR maps the issue to `reviewing` or
  `in-review`, also read its mergeability — the `mergeable-check` recipe (tick-scan already
  includes it). `MERGEABLE` → no change. `UNKNOWN` → **not actionable this tick**: GitHub
  computes mergeability asynchronously (notably right after a push); treat it as "retry next
  tick", **never** as conflicting. `CONFLICTING` → the issue becomes actionable with the
  **`conflicts` op (§3)**, which **takes priority over the phase's normal op** — a conflicted
  PR can't merge, so review/fix work on top of it is wasted.
- Branch exists, no PR → phase = `building` (a prior build needs to **finish + open the PR**;
  the builder is idempotent and will adopt the branch).
- **No branch, no PR — these phases have no artifact, so honour the state comment / spec comment;
  never re-derive them (or you'll re-spec, or build an unapproved task):**
  - An `airside-agent-spec` comment exists → the spec is posted. Phase = `building` **only if the
    state comment already says `building`** (you approved it); `revising` **only if the state comment
    already says `revising`** (a `/revise` is pending re-spec — see (d2)); otherwise `awaiting-approval`.
    This also crash-collapses a `speccing` op that posted the spec but died before the state update — it
    becomes `awaiting-approval`, never a duplicate spec.
  - No spec comment, recorded phase is `triage` or `speccing` → honour it (mid-entry, crash-safe).
  - No spec comment, recorded phase `building` → `building` (a fresh/approved simple task).
  - No state comment / `phase=null` → **fresh pickup → classify in (d).**

**(d) Classify (fresh pickups only).** Set `type` and the entry phase:

- `agent:simple` label → `type=simple`, phase `building`.
- `agent:complex` label → `type=complex`, phase `speccing`.
- neither → phase `triage` (the triage op in §3 sets `type`, then routes to `building`/`speccing`).

**(d2) Evaluate approval (only when phase is `awaiting-approval`).** Cheap (`gh` only); a `/revise`
defers to the spec-reviser op in §3. **Anchor commands on the artifact, not a mutable watermark:** a
command only counts if it is newer than the spec it answers — the **highest-version
`airside-agent-spec` comment**. Get that anchor and the comments with the `evaluate-approval`
recipe (both are in the tick-scan JSON already).

Consider only **owner commands**: comments where `login == OWNER`, `created_at > SPEC_AT`, and the
body is **not a bot comment** (per the bot-comment rule — no `<!-- airside-agent` / `🤖 airside-agent`;
do **not** exclude on the bare word, or a human who mentions "airside-agent" gets dropped). Classify
each by its **leading line**: `/approve`, `/revise <notes>`, `/stop`; plus a bare-word approve fallback (trimmed +
lowercased ∈ `approve|approved|lgtm|ship it|✅`). Also compute `bodyChanged = sha256(title+body) !=
lastSpecInputHash`. Decide:

- any `/stop` → phase `cancelled`; strip `<PICKUP_LABEL>` + `state:*`; post a note "cancelled per /stop".
- else any `/revise` **or** `bodyChanged` → **revise** (the spec is about to change, so revision wins
  even if an `/approve` is mixed in). **Immediately, in this cheap pass, set phase `revising`** (flip
  label `state:awaiting-approval` → `state:revising`, refresh the state comment) and post a one-line
  `airside-agent-note` ack — `🤖 airside-agent: 🔧 revision queued — re-speccing; a new spec version
  will follow.` This gives instant, correct status instead of a silent `awaiting-approval`. Then hand
  the spec-reviser op (§3) the gathered `/revise` notes (or "the issue description was edited" when only
  `bodyChanged`). **The `revising` phase is the indicator only** — the real trigger stays the
  `SPEC_AT`-anchored `/revise`, so this is crash-safe (see below).
- else any approve → phase `building`. **Approve-with-amendments:** capture any **trailing text after
  the `/approve` token** (e.g. `/approve also rename the prop to X and drop the toast`) as
  **approval amendments** — small, build-time adjustments the builder folds into the approved spec
  **without** a full re-spec round-trip. A **bare** `/approve` (or the `approve|approved|lgtm|ship it|✅`
  fallback) carries no amendments — build the spec as-is. (The amendments are re-read from the
  `/approve` comment by the §3 `building` op, not stored here — GitHub stays the source of truth.)
- else (chatter/questions only) → no-op.

**Crash-safety — no watermark bookkeeping here.** Because commands are anchored to `SPEC_AT`, a
`/revise` stays "newer than the spec" until the reviser posts `v(n+1)` (a newer comment), so the
revision **cannot be dropped** if the reviser op dies mid-flight — the next tick simply re-detects it
(the issue is in `revising`, the `/revise` is still newest, the reviser re-runs). The only state writes
in this cheap pass are the crash-recoverable phase changes (`cancelled` for `/stop`, `revising` for
`/revise`, `building` for `/approve`). `lastSpecInputHash` is advanced **only by the §3 spec ops** when
a new spec version is posted — never here. (`lastSeenCommentAt` is kept in the JSON for shape
stability but is no longer load-bearing.)

**(e) Repair labels + refresh state comment** to the computed phase (create the state comment if
absent) — the `repair-labels` recipe, using the REST numeric id from (a). Remove only the
*recorded previous* phase label (avoids "label not on issue" errors).

### 3. Expensive op — spawn AT MOST ONE subagent

Collect the issues that need an op: **`conflicts`** (a `CONFLICTING` PR — overrides the
phase's normal op, see §2(c)), phase `triage` (classify), `speccing` (author the spec),
`revising` (author the next spec version — set by (d2) on a `/revise`), `building` (build),
`reviewing` (review or fix), or `in-review` **with ≥1 actionable review thread** (apply your
PR comments — see below). Pick the **oldest** by `updatedAt`, do **one** op, then end the tick.

> **Invariant: ≤ 1 subagent spawn per tick.** Everything else is `gh`. This bounds the tick
> (each isolated worktree op pays ~1 min of setup) and prevents N concurrent worktrees. Safe
> because ticks are serial. If nothing needs an op, end the tick.

#### `conflicts` (merge `main` into a conflicted PR)

Triggered by the §2(c) mergeability check; replaces the `reviewing`/`in-review` op for this
issue this tick. **One autonomous attempt per conflict occurrence — no retry loop.**

- **Already attempted?** If the PR's current head commit message carries the
  `Airside-Agent-Conflicts: true` trailer **and** the PR still reads `CONFLICTING`, the one
  autonomous attempt already ran and didn't clear it → phase **`blocked`** (label
  `state:blocked`) + an `airside-agent-note`: "merge conflict needs manual resolution — an
  automated merge of `main` didn't clear it." (The existing "blocked is a resting state the
  owner un-blocks" machinery covers recovery.) This guard is deliberately conservative: it
  keys on the head commit, not the conflict occurrence, so a *new* conflict that appears
  while the trailer commit is still the head (main moved again; the PR didn't) also parks as
  `blocked` rather than getting a fresh attempt — a false positive we accept over risking an
  unbounded merge loop; the owner un-blocking re-arms the attempt.
- **Otherwise attempt it:** spawn `airside-fixer` (worktree — counts as the tick's one
  expensive subagent) with **`MODE: conflicts`** (contract below). It merges `origin/main`
  **into the PR branch** — merge, **not** rebase: never rewrite a pushed PR branch's history,
  never force-push — resolves the conflicts, runs lint + tests, and pushes.
- **Verify by head-delta**, same as the review→fix loop: re-read the head after; unchanged
  (and not `escalate`) → `blocked` + note "fixer made no progress".
- **`STATUS: escalate`** — the fixer judged the conflict beyond mechanical resolution
  (overlapping *semantic* changes where either side's intent could be lost) and pushed
  **nothing** → phase `blocked` + an owner-visible note: "merge conflict needs manual
  resolution: <its one-line reason>".
- **On a successful push,** leave the phase as-is: `reviewing` re-reviews the new head next
  tick; `in-review` carries on. The next tick's mergeability read confirms the conflict
  cleared (immediately after the push it reads `UNKNOWN` — that's the async lag; wait, don't
  re-attempt).

#### `triage` (classify)

Spawn `airside-triage` (read-only, no worktree). Read its `TYPE:` line → set `type` and route:
`simple` → phase `building`; `complex` → phase `speccing`. (Triage defaults to `complex` when
unsure — the gated path is the safe one.)

#### `speccing` (author the spec)

Spawn `airside-spec-author` (read-only, no worktree). Extract the spec between its `<<<SPEC` /
`SPEC>>>` sentinels and post it as a new `airside-agent-spec v1` comment — the `post-spec`
recipe (marker + spec body + the `/approve` / `/revise` / `/stop` footer).

Then set `specVersion=1`, `lastSpecInputHash = sha256(title+body)`, phase `awaiting-approval`. No
watermark is needed — (d2) anchors commands to this spec comment's timestamp, so only replies posted
*after* it count. (If a spec comment already exists — crash recovery — adopt it instead of
re-authoring; reconcile (c) already routes that to `awaiting-approval`.)

#### `revising` (author the next spec version)

The phase set by (d2) on a `/revise`. Spawn `airside-spec-reviser` with the highest-version spec as
`CURRENT_SPEC` and the gathered notes as `REVISION_NOTES`. Post the result as a new
`<!-- airside-agent-spec v(n+1) -->` comment (the `post-spec` recipe, same footer), bump
`specVersion`, set `lastSpecInputHash = sha256(title+body)`, post a short `airside-agent-note`
"applied your revisions — please re-`/approve`", and **set phase back to `awaiting-approval`**
(flip label `state:revising` → `state:awaiting-approval`). Posting the new spec advances the
command anchor (`SPEC_AT`), so the handled `/revise` is now *older* than the spec and won't
re-trigger, while a later `/approve` is newer and will. This ordering is the crash-safety
guarantee: if this op dies before the new spec is posted, the issue stays in `revising` and the
old `/revise` is still the newest command → the next tick re-revises (nothing dropped).

#### `building`

Spawn the **builder** once (contract below). Set `state:building` before spawning (intent); on
`STATUS: ok` with a `PR_NUMBER`, record it and set phase `reviewing` (commit-last — the proof is
the PR artifact, never the label). Builder failed / no PR → `state:blocked` + an
`airside-agent-note` explaining what to do.

**Approval amendments (complex path).** Before spawning, gather any **approve-with-amendments** notes:
fetch the owner's `/approve` comment that is newer than the highest-version spec (the one (d2) acted on)
and take the text **after** the `/approve` token. If non-empty, pass it to the builder as
`APPROVAL_NOTES` — small adjustments to fold into the approved spec without a re-spec. Bare `/approve`
(or a simple task) → no `APPROVAL_NOTES`. (Re-reading from the comment keeps it GitHub-sourced and
crash-safe; the builder is idempotent and will adopt the branch on a re-run.)

#### `reviewing` (the review → fix → re-review loop)

The pivot is an **artifact, not a state field**: is there an `airside-agent-review` note whose
`sha` equals the PR's current `headRefOid`? Read the head + the existing notes with the
`post-review-note` recipe (read side). (We must key on the note, never on `lastReviewedSha` —
a PR can carry that field with no review behind it, and acting on it would promote an
unreviewed PR.)

- **No review note for `HEAD`** (code is new or unreviewed) → **review** is the op. Spawn
  `airside-reviewer` (read-only, no worktree). Save its findings as an `airside-agent-review` note
  **on the issue** (machine JSON keyed by `sha=HEAD` + a human summary — this note is what the loop
  reads back; keep it): the `post-review-note` recipe, write side. **Then, so the findings leave a
  visible trace on the PR itself, post them as a top-level PR comment** — the `post-review-report`
  recipe: a human-readable report of **every** finding (`critical`/`high`/`medium`/`low`), not just
  the auto-fixed highs, one table row per finding. A **clean** review (no findings) still posts a
  one-line sha-marked report (`✅ review clean — <HEAD:0:7>`) so a clean round is traceable too.
  **Idempotency:** before posting, run the recipe's guard — skip if any PR comment already contains
  `airside-agent-review-report:<HEAD>` (crash-safe: the report is keyed by the same sha as the
  review note). Then **end the tick** — acting on the findings happens next tick (keeps it one
  op/tick and crash-safe).
- **A review note for `HEAD` exists** → act on it:
  - `highs` = its findings with severity `critical` or `high`.
  - **`highs` empty** → **CI-gate, then promote.** The reviewer reads the diff, not CI — so before
    readying, check the PR's checks with the `ci-gate` recipe (it returns
    `{failing, pending, total}`):
    - `failing > 0` → **`state:blocked`** + a note ("CI red on a reviewer-clean PR — needs your
      look"). Do **not** loop the fixer on CI red (rabbit hole); a human decides.
    - else `pending > 0` → **wait**: leave phase `reviewing`, write nothing, re-check next tick
      (don't promote a PR whose checks are still running).
    - else (all checks passed/skipped/neutral, **or `total == 0`** — a repo with no CI must not hang)
      → promote: the `promote` recipe → phase `in-review`; post a human summary note (list any
      medium/low for the reviewer to consider). Done.
  - **`highs` non-empty** → check the cap. `H` = number of `airside-agent-review` notes whose
    findings include ≥1 `critical`/`high`. If **`H > REVIEW_CAP`** → phase `blocked` + an escalation
    note listing the unresolved highs (already auto-fixed `REVIEW_CAP` times). Otherwise → **fix**:
    capture `HEAD` (pre-fix sha), spawn `airside-fixer` with the `highs` batch. **Verify progress by
    head-delta, not the fixer's word**: re-read the PR head after; if it still equals the pre-fix
    `HEAD` (no new commit) → phase `blocked` + note "fixer made no progress". Otherwise leave phase
    `reviewing` — the new head has no review note, so the next tick re-reviews. Convergence:
    review → fix → re-review until clean (→ `in-review`) or capped (→ `blocked`).

#### `in-review` (apply your PR review comments)

The ready PR is yours to review; this op applies the comments you leave — both **inline review
threads** (on diff lines) and **top-level conversation comments** (in the main PR thread).

**(i) Inline review threads** — the `inline-threads` recipe (GraphQL — REST can't see resolved
state); it returns each comment's `databaseId` (for replies) and the thread node `id` (for
resolve).

A thread is **actionable** = `isResolved==false` **AND** its **last** comment is by `OWNER` **AND**
that comment is **not a bot comment** (per the bot-comment rule). The bot's marked reply on a thread
makes its last comment the agent's → no longer actionable; `isResolved` is the other gate.

**(ii) Top-level conversation comments** — the `top-level-comments` recipe (a PR is an issue).

There is no per-comment resolve here, so make idempotency **per-comment by id**, not by timestamp (a
timestamp anchor would silently drop a comment posted *while* the fixer op runs — its `created_at`
ends up behind the ack). The bot's ack for a comment carries that comment's id:
`<!-- airside-agent-ack:tl-<commentId> -->`. Collect the set of **acked ids** (every
`airside-agent-ack:tl-<id>` marker found in any PR comment). A top-level comment is **actionable** =
`login==OWNER` **AND** it is **not a bot comment** (per the rule) **AND** its `id` is not in the acked
set. (Per-comment + artifact-based = the top-level analog of inline's `isResolved`; immune to timing.)

**If there are zero actionable items (threads + top-level) → REST: write nothing** (no label, note,
or state PATCH). A read-only tick.

Otherwise build one findings batch, tagging each with its `kind` so you know how to acknowledge it:
- thread → `{id: <threadId>, kind: "thread", path, line, body, replyTo: <last comment databaseId>}`
- top-level → `{id: "tl-<commentId>", kind: "toplevel", body}` (no path/line — a general instruction)

Spawn `airside-fixer` (worktree) **once** with the whole batch. Capture the PR head before; re-read
after as a coarse "did anything change" check. Then **acknowledge per finding, by `kind`** — the
`ack-resolve` recipe:

- **thread + `FIXED`** → marked reply + **resolve** the thread.
- **thread + `SKIPPED`** → marked reply (with the reason), **leave unresolved**.
- **top-level + `FIXED`** → marked top-level reply **tagged with the comment's id**.
- **top-level + `SKIPPED`** → same shape, noting no change and the reason.

For top-level there's no resolve — the **id-tagged ack is the idempotency**: posting
`airside-agent-ack:tl-<commentId>` marks exactly that comment handled, so it isn't re-processed even
if other comments arrive meanwhile. **Never auto-resolve a thread you didn't change, and never skip
the ack** — many comments are questions or nits; the ack stops re-triggering while leaving your
concern visible.

Stay `in-review` (do **not** re-run the automated reviewer — you're driving, and CI runs on the push).
A merge → `done` via the terminal check. **Crash-safety:** if the tick dies after the push but before
acking, the items still look actionable next tick → the fixer re-runs (finds the change already
applied → `no-changes`/`SKIPPED`) and the acks post then; nothing is dropped (cost is a duplicate-safe
re-run and, for a thread, one manual resolve click).

### 4. End-of-tick status table (always — compact, append-only)

**End every tick — after the op, or after a no-op — with ONE compact markdown table** covering
**all active** (open, non-terminal) agent issues: both the ones the **agent is working** and the ones
**waiting on you**. **The header line + the table are the ENTIRE tick output — nothing else.** No
lead-in sentence, no trailing narration, no summary ("N items waiting on you", "once the builder
finishes…"), no per-item bullets, no prose paragraphs. The only exception is a genuinely exceptional
event the table can't convey (a `blocked` reason needing detail, an error, or a `needs input:` /
`failed:` line) — otherwise emit the header + table and stop.
Recompute it from the phases you reconciled in §2 — **no extra subagents, no extra `gh` reads beyond
what you already ran**.

Precede the table with a single header line: **`Tick — <op this tick, or "no-op">`** (≤12 words).
Then the table, exactly these columns:

```
| Task | Phase | Ball | Next |
|------|-------|------|------|
```

- **Task** — markdown-linked, short: `[#<n> <≤4-word title>](https://github.com/<REPO>/issues/<n>)`.
  For `reviewing`/`in-review` link the **PR** instead: `[#<n> PR#<pr> <≤4-word title>](https://github.com/<REPO>/pull/<pr>)`.
- **Phase** — the computed phase verbatim.
- **Ball** — who it's on right now: `🤖` (agent working it: `triage`/`speccing`/`revising`/`building`/`reviewing`)
  or `👤` (you: `awaiting-approval`/`in-review`/`blocked`).
- **Next** — terse next step: `awaiting-approval` → `/approve·/revise·/stop`; `in-review` → `review / merge`;
  `blocked` → `<reason> — decide`; agent phases → what the agent does next (`spec` / `build` / `review` / `fix` / `promote`).

Order rows **👤 first** (blocked → awaiting-approval → in-review), then **🤖** (revising → building → reviewing → speccing → triage). Drop `done`/`cancelled` rows (terminal). If there are **no active issues**, emit the single line `No active agent tasks.` instead of a table. **This table is reporting only — it must never spawn a subagent, mutate GitHub, or count as the tick's one op.**

## Spawn contracts

All contracts pass `REPO` (and where noted `OWNER`) from §Config — the subagents carry no
repo literal of their own. When tick-scan ran, you may also pass a subagent the relevant
slice of its JSON (the issue entry / PR / threads) so it skips re-fetching; live GitHub
remains the source of truth if it re-reads.

### Triage spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-triage"` (no worktree, read-only).
Fallback: `general-purpose` + `.claude/agents/airside-triage.md` preamble. Pass: `ISSUE`, `REPO`.
It ends with `TYPE: simple` or `TYPE: complex`. Route accordingly; default `complex` if the line is
missing/ambiguous (the safe, gated path).

### Spec-author spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-spec-author"` (no worktree). Fallback:
`general-purpose` + `.claude/agents/airside-spec-author.md`. Pass: `ISSUE`, `REPO`. It returns the
spec between `<<<SPEC` / `SPEC>>>` sentinels — extract that body (it may contain code fences, so
match by the **sentinels**, not by a fenced block) and post it as the `airside-agent-spec v1` comment.

### Spec-reviser spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-spec-reviser"` (no worktree). Fallback:
`general-purpose` + `.claude/agents/airside-spec-reviser.md`. Pass: `ISSUE`, `REPO`, `CURRENT_SPEC`
(the highest-version spec body), `REVISION_NOTES`. It returns the full revised spec between `<<<SPEC`
/ `SPEC>>>` — post it as `airside-agent-spec v(n+1)`.

### Builder spawn contract

Spawn with the **Agent tool**, `isolation: "worktree"` (verified to give a real, locally-built
worktree — see `docs/adr.md`), and `subagent_type: "airside-builder"`. If that subagent type is
not yet registered in this session, fall back to `subagent_type: "general-purpose"` and pass the
**full contents of `.claude/agents/airside-builder.md`** as the prompt preamble.

**Pass the builder:** the issue number `<n>`, `REPO`, `OWNER`, the canonical branch
`<BRANCH_PREFIX><n>`, and — when the `building` op gathered them — `APPROVAL_NOTES` (the owner's
approve-with-amendments text). The builder reads the issue itself (`gh issue view`) for the body,
and — for a complex task — the **highest-version `airside-agent-spec` comment** as the approved
spec; it then folds any `APPROVAL_NOTES` into that spec as small, owner-requested adjustments before
implementing (they refine the spec, they don't replace it). Absent/empty `APPROVAL_NOTES` ⇒ build the
spec as-is.

**The builder MUST return** these machine-parseable lines (you grep them):

```
STATUS: ok | failed
BRANCH: <BRANCH_PREFIX><n>
PR: <url>            # absent on failure
PR_NUMBER: <n>       # absent on failure
NOTE: <one line>     # what it did, or why it failed
```

On `STATUS: ok` with a `PR_NUMBER` → record it, phase `reviewing`. On anything else →
`state:blocked` + note.

### Reviewer spawn contract

Spawn with the **Agent tool**, `subagent_type: "airside-reviewer"` (**no worktree** — it's
read-only). Fallback: `subagent_type: "general-purpose"` + the contents of
`.claude/agents/airside-reviewer.md` as preamble. Pass: `PR_NUMBER`, `REPO`, `ISSUE`, `BRANCH`,
and `HEAD_SHA` (the current head). It returns one fenced ```json block:
`{headSha, summary, findings:[{severity,confidence,path,line,title,note,fix}]}` with severity in
`critical|high|medium|low`. Save that JSON verbatim into an `airside-agent-review` note keyed by
`sha=HEAD_SHA`. `highs` = findings where severity ∈ {critical, high}.

### Fixer spawn contract

Spawn with the **Agent tool**, `isolation: "worktree"`, `subagent_type: "airside-fixer"`.
Fallback: `general-purpose` + `.claude/agents/airside-fixer.md` preamble. Pass: `PR_NUMBER`,
`REPO`, `ISSUE`, `BRANCH`, a `MODE`, and — in findings mode — `FINDINGS`:

- **`MODE: findings`** (the default — may be omitted): `FINDINGS` is the batch to apply, each
  finding carrying a stable **`id`**:
  - review→fix loop: the `highs` array (id = a finding key).
  - in-review pass: one finding per actionable item, tagged with `kind` — `{id:<threadId>, kind:"thread",
    path, line, body}` for an inline thread, or `{id:"tl-<commentId>", kind:"toplevel", body}` for a
    top-level PR comment (no path/line).
- **`MODE: conflicts`** (the `conflicts` op — no `FINDINGS`): merge `origin/main` into the PR
  branch (merge, never rebase, never force-push), resolve the conflicts, verify (lint + tests),
  push. Its conflict-resolution merge commit carries the `Airside-Agent-Conflicts: true` trailer
  (the orchestrator's one-attempt guard keys on it). If the conflict is beyond mechanical
  resolution (overlapping semantic changes where either side's intent could be lost), it pushes
  **nothing** and returns `STATUS: escalate` with a one-line reason.

It returns:

```
STATUS: ok | no-changes | failed | escalate
BRANCH: <BRANCH_PREFIX><n>
NEW_HEAD: <sha>
FIXED: <finding ids it changed code for>     # findings mode
SKIPPED: <id=reason; ... or none>            # findings mode
NOTE: <one line>
```

`FIXED`/`SKIPPED` are keyed by finding **id** so you can act per-finding (`escalate` is
conflicts-mode only). **Head-delta** is the ground truth that *something* changed; its
consequence differs by caller:
- **review→fix loop:** head unchanged → `state:blocked` ("fixer made no progress").
- **in-review pass:** head-unchanged / `no-changes` is **not** an error — it just means those threads
  need no code change (already applied, or a question/nit). Resolve only the ids in `FIXED`;
  reply-and-leave-open the rest. **Never block, never auto-resolve an unchanged thread.**
- **conflicts op:** head unchanged and not `escalate` → `state:blocked` ("fixer made no
  progress"); `escalate` → `state:blocked` + the owner note (see the `conflicts` op).

## `gh` gotchas

Collected in the **`gh` gotchas** block at the end of `references/github.md` (label upserts,
REST-vs-GraphQL comment ids, the branch probe, the draft-PR guard, async `mergeable`, the
worktree branch-naming trap).

## Roadmap (all slices shipped)

- **Slice 1** — issue → draft PR (the `building` op).
- **Slice 2** — the `reviewing` review→fix→ready loop.
- **Slice 3** — the complex path (`triage` → `speccing` → `awaiting-approval` grammar).
- **Slice 4** — the `in-review` PR-comment op for **inline** review threads.
- **Slice 5** — the **CI-green gate** before promote, **top-level** PR-comment handling, terminal
  hardening (merge/close → `done`/`cancelled`), and dropping the redundant PROGRESS.md (ADR-0043).
- **#63** — repo-independence (§Config placeholders + the `references/github.md` recipes + the
  provider-seam design), the `conflicts` op, the `file` invocation mode, and `scripts/tick-scan.sh`
  (ADR-0050). The de-brand rename to `air-agent` is a follow-up issue (owner-coordinated cutover).
- **Deferred** (no observed need): round-robin fairness across many concurrently-active issues, and a
  global `MAX_ACTIVE` ceiling — see the scope note at the top.
