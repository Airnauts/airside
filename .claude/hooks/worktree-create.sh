#!/usr/bin/env bash
#
# WorktreeCreate hook — REPLACES Claude Code's native git worktree creation.
# Claude fires this with JSON on stdin: { "name": "<slug>", "cwd": "<project-root>", ... }
# It must create the worktree, do setup, and print the absolute worktree path on
# stdout. Any non-zero exit (or missing path) aborts worktree creation, so this
# script keeps the dependency install best-effort and never fails over it.
#
set -euo pipefail

# Hook environments can have a minimal PATH; make the tools we need discoverable.
export PATH="$HOME/Library/pnpm:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# The pnpm standalone launcher execs `node`; recover it from nvm when the hook
# environment doesn't already provide it (newest install wins).
if ! command -v node >/dev/null 2>&1; then
  for d in $(ls -dt "$HOME"/.nvm/versions/node/*/bin 2>/dev/null); do
    if [ -x "$d/node" ]; then export PATH="$d:$PATH"; break; fi
  done
fi

input="$(cat)"

read_field() {
  # $1 = field name. Prefer jq; fall back to a minimal sed parser.
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r --arg k "$1" '.[$k] // empty'
  else
    printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"
  fi
}

name="$(read_field name)"
cwd="$(read_field cwd)"

[ -n "$name" ] || { echo "worktree-create: missing 'name' in hook input" >&2; exit 1; }
[ -n "$cwd" ]  || { echo "worktree-create: missing 'cwd' in hook input" >&2; exit 1; }

worktree_path="$cwd/.claude/worktrees/$name"
branch="worktree-$name"

# Base new worktrees on local `main` so unpushed local commits are included
# (origin/main lags behind local main in this repo). Fall back to HEAD if main
# is absent. All git chatter goes to stderr so stdout stays path-only.
base="main"
git -C "$cwd" rev-parse --verify --quiet "refs/heads/$base" >/dev/null 2>&1 || base="HEAD"

if git -C "$cwd" show-ref --verify --quiet "refs/heads/$branch"; then
  git -C "$cwd" worktree add "$worktree_path" "$branch" >&2
else
  git -C "$cwd" worktree add -b "$branch" "$worktree_path" "$base" >&2
fi

# Best-effort install — a failed/missing pnpm must not abort the worktree.
if command -v pnpm >/dev/null 2>&1 && [ -f "$worktree_path/pnpm-lock.yaml" ]; then
  ( cd "$worktree_path" && pnpm install ) >&2 \
    || echo "worktree-create: pnpm install failed; worktree created without deps" >&2
else
  echo "worktree-create: pnpm not found or no pnpm-lock.yaml; skipping install" >&2
fi

# Required: emit the absolute worktree path (and nothing else) on stdout.
( cd "$worktree_path" && pwd )
