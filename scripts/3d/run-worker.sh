#!/usr/bin/env bash
# Run a headless Claude Code 3D View worker that survives usage limits and crashes.
# Each attempt is a fresh `claude -p` run that follows docs/3d/WORKER.md. State lives in the phase
# files and pushed branches, so a new attempt resumes from the last checkpoint. See docs/3d/README.md.
#
#   scripts/3d/run-worker.sh P1.2          # work one package until it is in review, done or blocked
#   scripts/3d/run-worker.sh               # keep taking the next available package until none is left
#
# Environment:
#   VIEW3D_WORKER_NAME      work tree name, default 3d-<package> or 3d-worker   (one per concurrent worker)
#   VIEW3D_MODEL            e.g. sonnet or opus; default: the CLI default
#   VIEW3D_PERMISSION_MODE  default auto
#   VIEW3D_RETRY_WAIT       seconds to wait after a run ends without a status line (limit or crash), default 900
#   VIEW3D_MAX_ATTEMPTS     consecutive failed attempts before giving up, default 24
#   VIEW3D_REPO, VIEW3D_REMOTE, VIEW3D_COORD_BRANCH   as in coord.sh
set -uo pipefail

package="${1:-}"
# 3D View work lives on the fork AlexDumo/OpenMarch-timeline, not on OpenMarch/OpenMarch.
# Use the remote that points at the fork, unless VIEW3D_REMOTE names one.
VIEW3D_REPO="${VIEW3D_REPO:-AlexDumo/OpenMarch-timeline}"
if [ -n "${VIEW3D_REMOTE:-}" ]; then
    REMOTE="$VIEW3D_REMOTE"
else
    REMOTE="$(git remote -v | awk -v r="$VIEW3D_REPO(\\.git)?$" '$2 ~ r && $3 == "(push)" { print $1; exit }')"
    if [ -z "$REMOTE" ]; then
        echo "$(basename "$0"): no git remote points at $VIEW3D_REPO." >&2
        echo "Add one: git remote add timeline https://github.com/$VIEW3D_REPO.git" >&2
        exit 1
    fi
fi
BRANCH="${VIEW3D_COORD_BRANCH:-3d-async}"
name="${VIEW3D_WORKER_NAME:-3d-${package:-worker}}"
mode="${VIEW3D_PERMISSION_MODE:-auto}"
wait_s="${VIEW3D_RETRY_WAIT:-900}"
max_attempts="${VIEW3D_MAX_ATTEMPTS:-24}"

command -v claude >/dev/null || { echo "run-worker.sh: claude CLI not found" >&2; exit 1; }
toplevel="$(git rev-parse --show-toplevel)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
worktree="$toplevel/.claude/worktrees/$name"
log_dir="$common_dir/view3d-logs"
mkdir -p "$log_dir"

if ! git -C "$worktree" rev-parse --git-dir >/dev/null 2>&1; then
    git fetch --quiet "$REMOTE" "$BRANCH" || { echo "run-worker.sh: cannot fetch $REMOTE/$BRANCH" >&2; exit 1; }
    git worktree add --quiet --detach "$worktree" "$REMOTE/$BRANCH" || exit 1
fi

if [ -n "$package" ]; then
    prompt="Follow docs/3d/WORKER.md for work package $package. Resume from its latest checkpoint if it is already yours."
else
    prompt="Follow docs/3d/WORKER.md without a work package ID: resume a package this work tree already owns, otherwise take the next available one."
fi
args=(-p "$prompt" --permission-mode "$mode" --output-format text)
[ -n "${VIEW3D_MODEL:-}" ] && args+=(--model "$VIEW3D_MODEL")

failures=0
while :; do
    log="$log_dir/$name-$(date +%Y%m%d-%H%M%S).log"
    echo "run-worker.sh: starting $name (log: $log)" >&2
    (cd "$worktree" && claude "${args[@]}") 2>&1 | tee "$log"
    status="$(grep -Eo 'VIEW3D-STATUS: [A-Za-z0-9.]+( [a-z-]+)?' "$log" | tail -n1 || true)"
    echo "run-worker.sh: ${status:-no status line}" >&2

    case "$status" in
        "VIEW3D-STATUS: none")
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
