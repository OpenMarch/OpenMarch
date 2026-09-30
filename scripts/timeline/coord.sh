#!/usr/bin/env bash
# Edit the timeline coordination files (docs/timeline/) on the coordination branch,
# from any checkout, without touching the caller's working tree. See docs/timeline/WORKER.md.
#
#   dir=$(scripts/timeline/coord.sh start)          # fresh checkout of the coordination branch; prints its path
#   ...edit "$dir"/docs/timeline/...
#   scripts/timeline/coord.sh commit "docs(timeline): claim P1.2"   # commit docs/timeline, rebase, push (retries)
#   scripts/timeline/coord.sh path                  # print the checkout path without refreshing it
#
# Environment: TIMELINE_REMOTE (default: the remote pointing at TIMELINE_REPO, AlexDumo/OpenMarch-timeline), TIMELINE_COORD_BRANCH (default timeline-try-2; change the
# default here to main once Phase 0 merges).
set -euo pipefail

# Timeline work lives on the fork AlexDumo/OpenMarch-timeline, not on OpenMarch/OpenMarch.
# Use the remote that points at the fork, unless TIMELINE_REMOTE names one.
TIMELINE_REPO="${TIMELINE_REPO:-AlexDumo/OpenMarch-timeline}"
if [ -n "${TIMELINE_REMOTE:-}" ]; then
    REMOTE="$TIMELINE_REMOTE"
else
    REMOTE="$(git remote -v | awk -v r="$TIMELINE_REPO(\\.git)?$" '$2 ~ r && $3 == "(push)" { print $1; exit }')"
    if [ -z "$REMOTE" ]; then
        echo "$(basename "$0"): no git remote points at $TIMELINE_REPO." >&2
        echo "Add one: git remote add timeline https://github.com/$TIMELINE_REPO.git" >&2
        exit 1
    fi
fi
BRANCH="${TIMELINE_COORD_BRANCH:-timeline-try-2}"

toplevel="$(git rev-parse --show-toplevel)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
# One coordination checkout per calling checkout, so concurrent agents on one machine don't share one.
key="$(printf '%s' "$toplevel" | shasum | cut -c1-10)"
dir="$common_dir/timeline-coord/$key"

die() { echo "coord.sh: $*" >&2; exit 1; }

link_node_modules() {
    # The pre-commit hook runs lint-staged (cspell + prettier on Markdown). Reuse an installed node_modules
    # rather than skipping the hook.
    [ -e "$dir/node_modules" ] && return
    for candidate in "$toplevel/node_modules" "$(dirname "$common_dir")/node_modules"; do
        if [ -d "$candidate" ]; then ln -s "$candidate" "$dir/node_modules"; return; fi
    done
    die "no node_modules found for the pre-commit hook; run 'pnpm install' in this checkout first"
}

cmd_start() {
    git fetch --quiet "$REMOTE" "$BRANCH" \
        || die "cannot fetch $REMOTE/$BRANCH (does the branch exist on the remote?)"
    if git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
        # Discards edits left behind by an earlier run that never committed.
        git -C "$dir" checkout --quiet --detach "$REMOTE/$BRANCH"
        git -C "$dir" reset --quiet --hard "$REMOTE/$BRANCH"
        git -C "$dir" clean --quiet -fd -- docs/timeline
    else
        mkdir -p "$(dirname "$dir")"
        git worktree add --quiet --detach "$dir" "$REMOTE/$BRANCH" >/dev/null
    fi
    link_node_modules
    echo "$dir"
}

cmd_commit() {
    local message="${1:-}"
    [ -n "$message" ] || die "usage: coord.sh commit \"<message>\""
    git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || die "no coordination checkout; run 'coord.sh start' first"
    git -C "$dir" add -- docs/timeline
    if git -C "$dir" diff --cached --quiet; then
        echo "coord.sh: nothing to commit" >&2
        return 0
    fi
    # The pre-commit hook can't spellcheck here (this checkout lives under .git/, which cspell
    # skips), so check the staged Markdown directly.
    local staged
    staged="$(git -C "$dir" diff --cached --name-only --diff-filter=ACM -- '*.md')"
    if [ -n "$staged" ]; then
        (cd "$dir" && printf '%s\n' "$staged" | xargs pnpm exec prettier --write >/dev/null \
            && printf '%s\n' "$staged" | xargs git add -- \
            && printf '%s\n' "$staged" | xargs pnpm exec cspell --no-progress --no-must-find-files) \
            || die "cspell or prettier failed on the staged Markdown; fix it and run commit again"
    fi
    git -C "$dir" commit --quiet -m "$message"
    local attempt
    for attempt in 1 2 3 4 5; do
        if git -C "$dir" push --quiet "$REMOTE" "HEAD:refs/heads/$BRANCH"; then
            echo "coord.sh: pushed to $REMOTE/$BRANCH" >&2
            return 0
        fi
        echo "coord.sh: push rejected (attempt $attempt); rebasing on $REMOTE/$BRANCH" >&2
        git -C "$dir" fetch --quiet "$REMOTE" "$BRANCH"
        if ! git -C "$dir" rebase --quiet "$REMOTE/$BRANCH"; then
            git -C "$dir" rebase --abort || true
            die "rebase conflict: someone else edited the same lines. Run 'coord.sh start', re-read, and redo the edit."
        fi
        sleep $((attempt * 2))
    done
    die "push failed after 5 attempts"
}

case "${1:-}" in
    start) cmd_start ;;
    commit) shift; cmd_commit "$@" ;;
    path) echo "$dir" ;;
    *) die "usage: coord.sh start | commit \"<message>\" | path" ;;
esac
