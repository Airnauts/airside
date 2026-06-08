#!/usr/bin/env bash
#
# WorktreeCreate hook — REPLACES Claude Code's native git worktree creation.
# Claude fires this with JSON on stdin: { "name": "<slug>", "cwd": "<project-root>", ... }
# It must create the worktree, do setup, and print the absolute worktree path (and
# nothing else) on stdout. Any non-zero exit (or missing path) aborts creation.
#
# WHY A HOOK INSTEAD OF native creation + worktree.symlinkDirectories:
# Symlinking the workspace `node_modules` makes every `@airnauts/*` import resolve to
# MAIN's `packages/*` (and their built `dist`), NOT the worktree's. So a worktree could
# not see its own cross-package or widget edits: backend type changes and the
# nextjs-host widget Playwright e2e both silently tested MAIN's build. This hook instead
# gives each worktree a REAL `pnpm install` (so `@airnauts/*` resolve to the worktree's
# OWN packages) and a full `pnpm build` (so every package's `dist` is the worktree's own).
# The pnpm store is global (~/Library/pnpm/store), so install is hard-linked/fast and
# removing a worktree never orphans the primary toolchain.
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

# Base new worktrees on local `main` so unpushed local commits are included (origin/main
# lags local main here). Fall back to HEAD if main is absent. git chatter -> stderr so
# stdout stays path-only.
base="main"
git -C "$cwd" rev-parse --verify --quiet "refs/heads/$base" >/dev/null 2>&1 || base="HEAD"

if git -C "$cwd" show-ref --verify --quiet "refs/heads/$branch"; then
  git -C "$cwd" worktree add "$worktree_path" "$branch" >&2
else
  git -C "$cwd" worktree add -b "$branch" "$worktree_path" "$base" >&2
fi

# Copy gitignored files listed in `.worktreeinclude` (native .worktreeinclude handling is
# NOT applied when a WorktreeCreate hook owns creation, so do it here). One path per line;
# '#' comments and blank lines are skipped.
if [ -f "$cwd/.worktreeinclude" ]; then
  while IFS= read -r rel || [ -n "$rel" ]; do
    rel="${rel%%#*}"; rel="$(printf '%s' "$rel" | xargs 2>/dev/null || true)"
    [ -n "$rel" ] || continue
    if [ -e "$cwd/$rel" ]; then
      mkdir -p "$worktree_path/$(dirname "$rel")"
      cp -R "$cwd/$rel" "$worktree_path/$rel" 2>/dev/null || true
    fi
  done < "$cwd/.worktreeinclude"
fi

# REAL per-worktree install → @airnauts/* resolve to the worktree's OWN packages (the whole
# point). Best-effort: a failed/missing pnpm must not abort the worktree.
if command -v pnpm >/dev/null 2>&1 && [ -f "$worktree_path/pnpm-lock.yaml" ]; then
  ( cd "$worktree_path" && pnpm install --prefer-offline ) >&2 \
    || echo "worktree-create: pnpm install failed; worktree created without deps" >&2

  # Build every package's dist from the worktree's own source so cross-package typecheck/
  # tests and the nextjs-host widget e2e are correct immediately. Best-effort: a build
  # hiccup leaves the worktree usable (run `pnpm build` manually). Cold turbo cache here,
  # so this is the slow step (~tens of seconds).
  ( cd "$worktree_path" && pnpm build ) >&2 \
    || echo "worktree-create: pnpm build failed; run 'pnpm build' in the worktree" >&2
else
  echo "worktree-create: pnpm not found or no pnpm-lock.yaml; skipping install/build" >&2
fi

# Required: emit the absolute worktree path (and nothing else) on stdout.
( cd "$worktree_path" && pwd )
