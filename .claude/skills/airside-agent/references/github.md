# github.md — the GitHub command surface, as named recipes

Every `gh` / `gh api graphql` / `jq` invocation the `airside-agent` orchestrator makes, keyed
by the operation name `SKILL.md` uses ("run the `<name>` recipe"). The runbook keeps the
algorithm; this file keeps the mechanics. This is also the provider boundary — see
`providers.md` for the abstract operation each recipe implements.

> **Sync note (read side).** `scripts/tick-scan.sh` is the executable form of the **read**
> recipes below (`scan`, `load-state`, `terminal-check`, `reconcile-artifacts`,
> `mergeable-check`, `evaluate-approval`'s reads, `inline-threads`, `top-level-comments`) —
> one consolidated JSON per tick. **These recipes are the spec**: if the script and a recipe
> ever disagree, the recipe wins and the script gets fixed. Write operations are deliberately
> **not** scripted (see SKILL.md §1).

Placeholders — substitute from `SKILL.md` §Config and the task at hand:

- `<REPO>`, `<OWNER>`, `<PICKUP_LABEL>`, `<BRANCH_PREFIX>`, `<REVIEW_CAP>` — the config values.
- `<OWNER_GRAPHQL>` / `<NAME_GRAPHQL>` — `REPO` split at the `/` (e.g. `Airnauts/airside` →
  `-F o=Airnauts -F r=airside`).
- `<n>` — the issue number; `<pr>` — the PR number; `<HEAD>` — the PR head sha;
  `<commentId>` — a REST numeric comment id; `<threadId>` — a GraphQL review-thread node id.
- The canonical task branch is `<BRANCH_PREFIX><n>`.

## `scan`

List the actionable issues (the tick's entry point):

```bash
gh issue list --repo <REPO> --label <PICKUP_LABEL> --state open \
  --json number,title,labels,updatedAt
```

## `load-state`

Fetch the state comment. Note: editing it later needs the REST *numeric* id returned here:

```bash
gh api repos/<REPO>/issues/<n>/comments \
  --jq '.[] | select(.body|contains("airside-agent-state")) | {id, body}'
```

## `terminal-check`

Issue closed? PR merged/closed?

```bash
gh issue view <n> --repo <REPO> --json state,stateReason
gh pr view <pr> --repo <REPO> --json state,isDraft,mergedAt
```

## `reconcile-artifacts`

The ground-truth probes (branch, PR):

```bash
git ls-remote --heads origin "refs/heads/<BRANCH_PREFIX><n>"      # branch exists?
gh pr list --repo <REPO> --head <BRANCH_PREFIX><n> --state all \
  --json number,isDraft,state                                      # PR exists?
```

## `mergeable-check`

Read an open PR's mergeability (part of reconcile for `reviewing`/`in-review` PRs):

```bash
gh pr view <pr> --repo <REPO> --json mergeable,mergeStateStatus
```

`mergeable` is one of `MERGEABLE` / `CONFLICTING` / `UNKNOWN`. **`UNKNOWN` means GitHub is
still computing it asynchronously** (notably right after a push) — treat it as "retry next
tick", never as conflicting.

## `evaluate-approval`

Anchor owner commands on the newest spec comment, then read all comments:

```bash
SPEC_AT=$(gh api repos/<REPO>/issues/<n>/comments \
  --jq '[.[]|select(.body|contains("airside-agent-spec"))]|max_by(.created_at).created_at')
gh api repos/<REPO>/issues/<n>/comments \
  --jq '.[] | {createdAt: .created_at, login: .user.login, body}'
```

## `repair-labels`

Write the state comment (PATCH by REST numeric id from `load-state`; plain comment the first
time) and mirror the phase label:

```bash
printf '%s' "<!-- airside-agent-state {json} -->" > /tmp/airside-state-<n>.md
gh api -X PATCH repos/<REPO>/issues/comments/<commentId> -F body=@/tmp/airside-state-<n>.md
# or, first time:  gh issue comment <n> --repo <REPO> --body-file /tmp/airside-state-<n>.md
gh issue edit <n> --repo <REPO> --add-label state:<phase> --remove-label <previous-phase>
```

## `post-spec`

Post a spec version as a new issue comment (body via a temp file — avoids shell-escaping):

```
<!-- airside-agent-spec v<v> -->
<spec markdown>

---
🤖 Reply **`/approve`** to build, **`/revise <notes>`** to change it, or **`/stop`** to cancel.
```

```bash
gh issue comment <n> --repo <REPO> --body-file /tmp/airside-spec-<n>.md
```

## `post-review-note`

Read side — the PR head and the existing review notes (the review→fix pivot):

```bash
HEAD=$(gh pr view <pr> --repo <REPO> --json headRefOid -q .headRefOid)
# all review notes, newest last; the orchestrator parses the JSON in each:
gh api repos/<REPO>/issues/<n>/comments \
  --jq '.[] | select(.body|contains("airside-agent-review")) | .body'
```

Write side — save the reviewer's JSON (keyed by `sha=<HEAD>`) plus a human summary as an
`<!-- airside-agent-review {json} -->` comment **on the issue**:

```bash
gh issue comment <n> --repo <REPO> --body-file /tmp/airside-review-<n>-<HEAD>.md
```

## `post-review-report`

The human-readable copy of a review round, posted top-level **on the PR**, keyed by the
reviewed sha:

```bash
cat > /tmp/airside-review-report-<n>-<HEAD>.md <<'EOF'
<!-- airside-agent-review-report:<HEAD> -->
🤖 **airside-agent review** — `<HEAD:0:7>` · <N> finding(s)

| Sev | Location | Finding |
|-----|----------|---------|
| 🔴 critical | `path:line` | <title> |
| 🟠 high | `path:line` | <title> |
| 🟡 medium | `path:line` | <title> |
| ⚪ low | `path:line` | <title> |

<one-line summary; highs (if any) are being auto-fixed>
EOF
gh pr comment <pr> --repo <REPO> --body-file /tmp/airside-review-report-<n>-<HEAD>.md
```

Idempotency guard — skip the post if this sha's report already exists:

```bash
gh api repos/<REPO>/issues/<pr>/comments \
  --jq 'any(.[]; .body|contains("airside-agent-review-report:<HEAD>"))'
```

## `ci-gate`

Summarize the PR's checks before promoting:

```bash
gh pr view <pr> --repo <REPO> --json statusCheckRollup --jq '
  [.statusCheckRollup[]?] as $all
  | { failing: ([ $all[] | select(((.conclusion // "")|IN("FAILURE","ERROR","CANCELLED","TIMED_OUT","ACTION_REQUIRED")) or ((.state // "")|IN("FAILURE","ERROR"))) ]|length),
      pending: ([ $all[] | select((has("status") and .status!="COMPLETED") or ((.state // "")|IN("PENDING","EXPECTED"))) ]|length),
      total:   ($all|length) }'
```

## `promote`

Draft → ready:

```bash
gh pr ready <pr> --repo <REPO>
```

## `inline-threads`

Inline review threads with resolved state (GraphQL — REST can't see `isResolved`); capture
each comment's `databaseId` (for replies) and the thread node `id` (for resolve):

```bash
gh api graphql -f query='query($o:String!,$r:String!,$p:Int!){
  repository(owner:$o,name:$r){ pullRequest(number:$p){ reviewThreads(first:100){ nodes{
    id isResolved
    comments(first:50){ nodes{ databaseId body author{login} path line } } } } } } }' \
  -F o=<OWNER_GRAPHQL> -F r=<NAME_GRAPHQL> -F p=<pr>
```

## `top-level-comments`

Top-level PR conversation comments (a PR is an issue):

```bash
gh api repos/<REPO>/issues/<pr>/comments \
  --jq '.[] | {id, createdAt: .created_at, login: .user.login, body}'
```

## `ack-resolve`

Acknowledge handled findings, by kind:

- **thread + `FIXED`** → marked reply + **resolve**:

  ```bash
  gh api repos/<REPO>/pulls/<pr>/comments -f body='🤖 airside-agent: addressed in <sha>.' \
    -F in_reply_to=<replyTo>
  gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' \
    -F id=<threadId>
  ```

- **thread + `SKIPPED`** → marked reply (`couldn't auto-apply — <reason>; over to you.`),
  **leave unresolved**.
- **top-level + `FIXED`** → marked top-level reply **tagged with the comment's id**:
  `gh pr comment <pr> --repo <REPO> --body '🤖 airside-agent: addressed "<comment gist>" in <sha>. <!-- airside-agent-ack:tl-<commentId> -->'`
- **top-level + `SKIPPED`** → same shape, noting no change:
  `gh pr comment <pr> --repo <REPO> --body '🤖 airside-agent: noted "<comment gist>" — no code change (<reason>). <!-- airside-agent-ack:tl-<commentId> -->'`

## `create-issue`

File one issue (the `file` invocation mode — conventions in the `filing-github-issues`
skill: interview first, `Area:` title, self-contained body):

```bash
gh issue list --repo <REPO> --state all --search "<keywords>"   # duplicate check first
gh issue create \
  --repo <REPO> \
  --title "<Area>: <short lowercase description>" \
  --label <enhancement|bug> \
  --body-file /tmp/issue-body.md
```

Add `--label <PICKUP_LABEL>` **only on the owner's explicit opt-in** — the default is to
file without it, so a filed issue never accidentally feeds the loop.

## `gh` gotchas (collected)

- **Labels:** `gh label create "<name>" --color <hex> --force` (upsert — never errors on exists).
- **Editing the state comment needs the REST numeric id**, not the GraphQL node id that
  `gh issue view --json comments` returns. Get it from
  `gh api repos/<REPO>/issues/<n>/comments`, then
  `gh api -X PATCH repos/<REPO>/issues/comments/<id> -F body=@file`.
- **Branch probe without 404 noise:** `git ls-remote --heads origin 'refs/heads/<BRANCH_PREFIX><n>'`.
- **Draft PR guard:** `gh pr list --repo <REPO> --head <BRANCH_PREFIX><n> --state all --json number`
  before any create.
- **Draft → ready:** `gh pr ready <pr> --repo <REPO>` (used when a review round comes back with no highs).
- **Review notes are keyed by head sha**, so a re-pushed branch (new head) always re-reviews;
  count notes-with-highs for the cap rather than trusting a mutable counter.
- **`mergeable` is computed asynchronously** — `UNKNOWN` right after a push is normal; re-read
  next tick, never treat it as `CONFLICTING`.
- The worktree hook auto-names the build branch `worktree-<name>`; the builder pushes to the
  canonical name explicitly: `git push origin HEAD:<BRANCH_PREFIX><n>`.
