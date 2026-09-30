#!/usr/bin/env bash
# Run a headless Claude Code timeline worker that survives usage limits and crashes.
# Each attempt is a fresh `claude -p` run that follows docs/timeline/WORKER.md. State lives in the phase
# files and pushed branches, so a new attempt resumes from the last checkpoint. See docs/timeline/README.md.
#
#   scripts/timeline/run-worker.sh P1.2          # work one package until it is in review, done or blocked
#   scripts/timeline/run-worker.sh               # keep taking the next available package until none is left
#
# Environment:
#   TIMELINE_WORKER_NAME      work tree name, default tl-<package> or tl-worker   (one per concurrent worker)
#   TIMELINE_MODEL            e.g. sonnet or opus; default: the CLI default
#   TIMELINE_PERMISSION_MODE  default auto
#   TIMELINE_RETRY_WAIT       seconds to wait after a run ends without a status line (limit or crash), default 900
#   TIMELINE_MAX_ATTEMPTS     consecutive failed attempts before giving up, default 24
#   TIMELINE_REPO, TIMELINE_REMOTE, TIMELINE_COORD_BRANCH   as in coord.sh
set -uo pipefail

package="${1:-}"
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
name="${TIMELINE_WORKER_NAME:-tl-${package:-worker}}"
mode="${TIMELINE_PERMISSION_MODE:-auto}"
wait_s="${TIMELINE_RETRY_WAIT:-900}"
max_attempts="${TIMELINE_MAX_ATTEMPTS:-24}"

command -v claude >/dev/null || { echo "run-worker.sh: claude CLI not found" >&2; exit 1; }
toplevel="$(git rev-parse --show-toplevel)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
worktree="$toplevel/.claude/worktrees/$name"
log_dir="$common_dir/timeline-logs"
mkdir -p "$log_dir"

if ! git -C "$worktree" rev-parse --git-dir >/dev/null 2>&1; then
    git fetch --quiet "$REMOTE" "$BRANCH" || { echo "run-worker.sh: cannot fetch $REMOTE/$BRANCH" >&2; exit 1; }
    git worktree add --quiet --detach "$worktree" "$REMOTE/$BRANCH" || exit 1
fi

if [ -n "$package" ]; then
    prompt="Follow docs/timeline/WORKER.md for work package $package. Resume from its latest checkpoint if it is already yours."
else
    prompt="Follow docs/timeline/WORKER.md without a work package ID: resume a package this work tree already owns, otherwise take the next available one."
fi
args=(-p "$prompt" --permission-mode "$mode" --output-format text)
[ -n "${TIMELINE_MODEL:-}" ] && args+=(--model "$TIMELINE_MODEL")

failures=0
while :; do
    log="$log_dir/$name-$(date +%Y%m%d-%H%M%S).log"
    echo "run-worker.sh: starting $name (log: $log)" >&2
    (cd "$worktree" && claude "${args[@]}") 2>&1 | tee "$log"
    status="$(grep -Eo 'TIMELINE-STATUS: [A-Za-z0-9.]+( [a-z-]+)?' "$log" | tail -n1 || true)"
    echo "run-worker.sh: ${status:-no status line}" >&2

    case "$status" in
        "TIMELINE-STATUS: none")
            echo "run-worker.sh: nothing available; stopping" >&2
            exit 0 ;;
        *" in-review" | *" done" | *" blocked")
            failures=0
            [ -n "$package" ] && exit 0
            continue ;;                       # auto mode: take the next package
        *" in-progress")
            failures=0
            sleep 60 ;;                       # checkpoint saved, work not finished: continue shortly
        *)
            failures=$((failures + 1))        # usage limit, crash or network: wait, then resume from the checkpoint
            if [ "$failures" -ge "$max_attempts" ]; then
                echo "run-worker.sh: $failures failed attempts in a row; giving up" >&2
                exit 1
            fi
            echo "run-worker.sh: attempt $failures/$max_attempts failed; retrying in ${wait_s}s" >&2
            sleep "$wait_s" ;;
    esac
done
