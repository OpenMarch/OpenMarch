#!/usr/bin/env bash
# Regenerates the OpenMarch v0.1.7 show files in this folder with v0.1.7's own code (see
# generateV017Files.ts and README.md). Usage: generate.sh [v0.1.7 checkout]
# Without an argument it adds a temporary worktree of tag v0.1.7 and removes it afterwards.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checkout="${1:-}"
temporary=""
if [ -z "$checkout" ]; then
    checkout="$(mktemp -d)/openmarch-v017"
    git -C "$here" worktree add --detach "$checkout" v0.1.7
    temporary="$checkout"
fi
target="$checkout/apps/desktop/src/__test__/generateV017Files.test.ts"
cleanup() {
    rm -f "$target"
    rmdir "$(dirname "$target")" 2>/dev/null || true
    if [ -n "$temporary" ]; then git -C "$here" worktree remove --force "$temporary"; fi
}
trap cleanup EXIT
test "$(git -C "$checkout" rev-parse HEAD)" = "$(git -C "$checkout" rev-parse 'v0.1.7^{commit}')" ||
    { echo "$checkout is not at v0.1.7" >&2; exit 1; }
(cd "$checkout" && pnpm install --frozen-lockfile && pnpm --filter "@openmarch/desktop^..." build)
mkdir -p "$(dirname "$target")"
cp "$here/generateV017Files.ts" "$target"
rm -f "$here"/*.dots "$here"/*.v017.json
(cd "$checkout/apps/desktop" && V017_OUT_DIR="$here" pnpm exec vitest run src/__test__/generateV017Files.test.ts)
