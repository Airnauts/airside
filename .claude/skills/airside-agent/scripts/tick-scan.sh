#!/usr/bin/env bash
# tick-scan.sh — the READ side of one airside-agent tick as ONE consolidated JSON document.
#
# Usage: tick-scan.sh <REPO> [PICKUP_LABEL] [BRANCH_PREFIX]
#   e.g. tick-scan.sh Airnauts/airside            (defaults: agent, agent/issue-)
#
# Read-only: never writes to GitHub. This script is the executable form of the read recipes
# in ../references/github.md (scan, load-state, terminal-check, reconcile-artifacts,
# mergeable-check, evaluate-approval reads, inline-threads, top-level-comments) — THE RECIPES
# ARE THE SPEC: if this script and a recipe ever disagree, the recipe wins and this script
# gets fixed. Write operations stay individual recipes by design (SKILL.md §1).
set -euo pipefail

REPO="${1:?usage: tick-scan.sh <REPO> [PICKUP_LABEL] [BRANCH_PREFIX]}"
PICKUP_LABEL="${2:-agent}"
BRANCH_PREFIX="${3:-agent/issue-}"
OWNER_GRAPHQL="${REPO%%/*}"
NAME_GRAPHQL="${REPO#*/}"

# scan
issues_json=$(gh issue list --repo "$REPO" --label "$PICKUP_LABEL" --state open \
  --json number,title,labels,updatedAt)

out="[]"
for n in $(jq -r '.[].number' <<<"$issues_json"); do
  branch="${BRANCH_PREFIX}${n}"

  # terminal-check (issue side) + body/labels
  issue=$(gh issue view "$n" --repo "$REPO" \
    --json number,title,state,stateReason,labels,body,updatedAt)

  # load-state + evaluate-approval reads: every comment, with the REST numeric id
  comments=$(gh api "repos/$REPO/issues/$n/comments" --paginate \
    --jq '[.[] | {id, createdAt: .created_at, login: .user.login, body}]')

  # reconcile-artifacts: branch probe
  branch_exists=false
  if [ -n "$(git ls-remote --heads "https://github.com/$REPO.git" "refs/heads/$branch")" ]; then
    branch_exists=true
  fi

  # reconcile-artifacts (PR) + terminal-check (PR side) + mergeable-check, in one read.
  # Prefer the open PR for the branch; otherwise the first (newest) one.
  prs=$(gh pr list --repo "$REPO" --head "$branch" --state all \
    --json number,state,isDraft,mergedAt,headRefOid,mergeable,mergeStateStatus)
  pr=$(jq '([.[] | select(.state=="OPEN")] + .)[0] // null' <<<"$prs")

  # inline-threads + top-level-comments — only meaningful for an open PR
  threads="[]"
  pr_comments="[]"
  pr_number=$(jq -r '.number // empty' <<<"$pr")
  pr_state=$(jq -r '.state // empty' <<<"$pr")
  if [ -n "$pr_number" ] && [ "$pr_state" = "OPEN" ]; then
    threads=$(gh api graphql -f query='query($o:String!,$r:String!,$p:Int!){
      repository(owner:$o,name:$r){ pullRequest(number:$p){ reviewThreads(first:100){ nodes{
        id isResolved
        comments(first:50){ nodes{ databaseId body author{login} path line } } } } } } }' \
      -F o="$OWNER_GRAPHQL" -F r="$NAME_GRAPHQL" -F p="$pr_number" \
      --jq '.data.repository.pullRequest.reviewThreads.nodes')
    pr_comments=$(gh api "repos/$REPO/issues/$pr_number/comments" --paginate \
      --jq '[.[] | {id, createdAt: .created_at, login: .user.login, body}]')
  fi

  entry=$(jq -n \
    --argjson issue "$issue" \
    --argjson comments "$comments" \
    --arg branch "$branch" \
    --argjson branchExists "$branch_exists" \
    --argjson pr "$pr" \
    --argjson reviewThreads "$threads" \
    --argjson prComments "$pr_comments" \
    '$issue + {branch: $branch, branchExists: $branchExists, comments: $comments,
               pr: $pr, reviewThreads: $reviewThreads, prComments: $prComments}')
  out=$(jq --argjson e "$entry" '. + [$e]' <<<"$out")
done

jq -n \
  --arg repo "$REPO" \
  --arg pickupLabel "$PICKUP_LABEL" \
  --arg branchPrefix "$BRANCH_PREFIX" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson issues "$out" \
  '{repo: $repo, pickupLabel: $pickupLabel, branchPrefix: $branchPrefix,
    generatedAt: $generatedAt, issues: $issues}'
