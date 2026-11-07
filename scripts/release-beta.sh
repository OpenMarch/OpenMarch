#!/usr/bin/env bash
# Land a beta on OpenMarch/OpenMarch and tag it. See docs/releases/beta.md.
#
#   scripts/release-beta.sh 0.2.0-beta.2 [commit]
#
# commit defaults to the tip of fork main. Before running, that commit must have
# the version in apps/desktop/package.json, and an open pull request from it into
# prerelease/<major>.<minor> on OpenMarch/OpenMarch must have every check green.
#
# The script fast-forwards prerelease/<major>.<minor> to the commit, then tags it
# v<version> and pushes the tag, which starts the signed release build. It asks
# before each push and skips steps that are already done, so it's safe to rerun.
#
# Needs git, gh (logged in) and org-admin push rights on OpenMarch/OpenMarch.
# cspell:ignore statusCheckRollup
set -euo pipefail

UPSTREAM_REPO="OpenMarch/OpenMarch"
FORK_REPO="AlexDumo/OpenMarch-timeline"

die() { echo "error: $*" >&2; exit 1; }
confirm() {
    read -r -p "$1 [y/N] " answer
    [[ "$answer" == [yY] ]] || { echo "Stopped. Nothing else was pushed."; exit 1; }
}

[[ $# -ge 1 && $# -le 2 ]] || die "usage: scripts/release-beta.sh <version, e.g. 0.2.0-beta.2> [commit]"
VERSION="$1"
[[ "$VERSION" =~ ^([0-9]+)\.([0-9]+)\.[0-9]+-beta\.[1-9][0-9]*$ ]] \
    || die "'$VERSION' isn't a beta version like 0.2.0-beta.2"
BRANCH="prerelease/${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
TAG="v$VERSION"

command -v gh >/dev/null 2>&1 || die "gh isn't installed (https://cli.github.com)"

# Find the remotes by URL, whatever they're called locally.
remote_for() {
    git remote -v | awk -v repo="$1" '$3 == "(push)" && $2 ~ ("[:/]" repo "(\\.git)?$") { print $1; exit }'
}
UPSTREAM=$(remote_for "$UPSTREAM_REPO")
FORK=$(remote_for "$FORK_REPO")
[[ -n "$UPSTREAM" ]] || die "no remote points at $UPSTREAM_REPO"
[[ -n "$FORK" ]] || die "no remote points at $FORK_REPO (git remote add timeline https://github.com/$FORK_REPO.git)"

echo "Fetching..."
git fetch --quiet "$FORK" main
git fetch --quiet --tags "$UPSTREAM"
current=$(git ls-remote "$UPSTREAM" "refs/heads/$BRANCH" | cut -f1)
[[ -n "$current" ]] || die "$UPSTREAM_REPO has no $BRANCH branch. The first beta of a version creates it; see docs/releases/beta.md."
git fetch --quiet "$UPSTREAM" "$BRANCH"

if [[ $# -eq 2 ]]; then
    TARGET=$(git rev-parse --verify "$2^{commit}") || die "can't find commit $2"
else
    TARGET=$(git rev-parse "$FORK/main")
fi
git merge-base --is-ancestor "$TARGET" "$FORK/main" || die "${TARGET:0:9} isn't on fork main"

pkg_version=$(git show "$TARGET:apps/desktop/package.json" | sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' | head -1)
[[ "$pkg_version" == "$VERSION" ]] \
    || die "apps/desktop/package.json at ${TARGET:0:9} is $pkg_version, not $VERSION. Bump it on fork main first."

# The commit the tag points at (the ^{} line for annotated tags, else the plain one).
tag_lines=$(git ls-remote --tags "$UPSTREAM" "refs/tags/$TAG")
tag_remote=$(printf '%s\n' "$tag_lines" | awk '$2 ~ /\^\{\}$/ { print $1; found = 1 } END { if (!found) exit 1 }' \
    || printf '%s\n' "$tag_lines" | head -1 | cut -f1)
if [[ -n "$tag_remote" && "$tag_remote" != "$TARGET" ]]; then
    die "$TAG already exists upstream at ${tag_remote:0:9}. Never move a published tag; use the next beta number."
fi

echo
echo "Version:  $VERSION"
echo "Commit:   $(git log -1 --format='%h %s' "$TARGET")"
echo "Branch:   $UPSTREAM_REPO $BRANCH (now ${current:0:9})"
echo "Tag:      $TAG"
echo

# Step 1: fast-forward the prerelease branch.
if [[ "$current" == "$TARGET" ]]; then
    echo "$BRANCH is already at ${TARGET:0:9}. Skipping step 1."
else
    git merge-base --is-ancestor "$current" "$TARGET" \
        || die "${TARGET:0:9} doesn't contain ${current:0:9}, so $BRANCH can't fast-forward. Was a fork PR squash-merged? See docs/releases/beta.md."

    pr=$(gh pr list -R "$UPSTREAM_REPO" --base "$BRANCH" --state open --json number,headRefOid \
        -q ".[] | select(.headRefOid == \"$TARGET\") | .number" | head -1)
    [[ -n "$pr" ]] || die "no open pull request into $BRANCH has head ${TARGET:0:9}. Open the sync pull request first (docs/releases/beta.md, step 2)."
    not_green=$(gh pr view "$pr" -R "$UPSTREAM_REPO" --json statusCheckRollup \
        -q '[.statusCheckRollup[] | select(.name != null and .name != "") | select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL") | "\(.name) (\(.conclusion // .status))"] | join(", ")')
    [[ -z "$not_green" ]] || die "#$pr isn't green yet: $not_green"
    echo "Sync pull request #$pr: all checks green."

    echo "Step 1: fast-forward $BRANCH ${current:0:9} -> ${TARGET:0:9}."
    confirm "Push the branch?"
    git push --force-with-lease="refs/heads/$BRANCH:$current" "$UPSTREAM" "$TARGET:refs/heads/$BRANCH"
fi

# Step 2: tag and push the tag.
if [[ -n "$tag_remote" ]]; then
    echo "$TAG already exists upstream at ${TARGET:0:9}. Skipping step 2."
else
    if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
        [[ "$(git rev-parse "$TAG^{commit}")" == "$TARGET" ]] \
            || die "your local tag $TAG points somewhere else; delete it (git tag -d $TAG) and rerun"
    else
        git tag "$TAG" "$TARGET"
    fi
    echo
    echo "Step 2: push tag $TAG at ${TARGET:0:9}. This starts the signed release build."
    confirm "Push the tag?"
    git push "$UPSTREAM" "refs/tags/$TAG"
fi

echo
echo "Done. Next (docs/releases/beta.md, steps 5-7):"
echo "  Build:   https://github.com/$UPSTREAM_REPO/actions/workflows/desktop-release.yaml"
echo "  Release: https://github.com/$UPSTREAM_REPO/releases"
echo "  When the build finishes, write the notes on the $TAG draft, tick \"Set as a pre-release\","
echo "  leave \"Set as the latest release\" off, and publish."
