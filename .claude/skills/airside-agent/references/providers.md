# providers.md — the tracker/VCS provider seam (design only)

The orchestrator's algorithm (`SKILL.md`) is provider-agnostic; everything
provider-specific lives in the named recipes of `github.md`. This file names the abstract
operations that boundary must supply, so GitHub is *one implementation* and a different
tracker (Jira) plus a VCS host could be another later. **Documentation only — no code, no
adapter, no provider switch.**

| Abstract operation | What the orchestrator needs | GitHub recipe (`github.md`) |
|---|---|---|
| `listActionableTasks` | the open tasks opted into the loop | `scan` |
| `createTask` | file a new task (the `file` invocation mode) | `create-issue` |
| `readTaskState` | task status + the persisted state/spec/review markers | `load-state`, `terminal-check`, `evaluate-approval` |
| `writeTaskState` | update the structured state + its human-visible mirror | `repair-labels` |
| `postThreadedComment` | specs, notes, reports, acks on a task or change request | `post-spec`, `post-review-note`, `post-review-report`, `ack-resolve` |
| `openChangeRequest` | publish a branch as a draft change request | builder contract (`reconcile-artifacts` guards it) |
| `readyChangeRequest` | promote draft → ready after the CI gate | `promote` (gated by `ci-gate`) |
| `mergeChangeRequest` | merge — **human-owned today**, observed via terminal-check | `terminal-check` |
| `readMergeability` | can the change request merge cleanly? (drives the `conflicts` op) | `mergeable-check` |
| `readReviewThreads` | the human's inline + top-level review comments | `inline-threads`, `top-level-comments` |
| `resolveReviewThread` | mark a handled thread resolved | `ack-resolve` |

A second implementation would be **Jira (tracker) + a VCS host** behind the same table —
Jira's first concrete need is `createTask` (the `file` mode files to Jira instead of GitHub).
Switching providers is out of scope until then; when it happens, the recipes file for that
provider replaces `github.md` op-for-op and `SKILL.md` doesn't change.
