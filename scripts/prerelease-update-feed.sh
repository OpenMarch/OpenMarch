#!/usr/bin/env bash
# Write the update feed files a prerelease's updaters look for.
#
#   scripts/prerelease-update-feed.sh <dir with latest-*.yml> <out dir> <channel>
#
# electron-builder publishes per-arch feeds (`channel: "latest-${arch}"` in
# electron-builder.json5) because each Mac arch builds on its own runner and one
# shared latest-mac.yml would be overwritten. Stable updaters read those. An app on
# a prerelease version (0.2.0-beta.3) ignores that channel: electron-updater's
# GitHub provider takes the channel from the newest release's tag instead
# ("beta"), asks for beta-mac.yml / beta.yml / beta-linux.yml /
# beta-linux-arm64.yml, then falls back to latest-mac.yml etc. Neither name has
# the arch, so beta updaters found nothing (v0.2.0-beta.4).
#
# This copies each per-arch feed to the name a <channel> updater asks for, and
# joins the two Mac feeds into one (electron-updater's MacUpdater picks the files
# with "arm64" in the name on Apple Silicon and the others on Intel). A Windows or
# Linux feed whose build is missing is skipped; a missing Mac arch is an error.
set -euo pipefail

[[ $# -eq 3 ]] || { echo "usage: $0 <dir with latest-*.yml> <out dir> <channel>" >&2; exit 2; }
IN="$1"
OUT="$2"
CHANNEL="$3"
mkdir -p "$OUT"

copy() {
    if [[ -f "$IN/$1" ]]; then
        cp "$IN/$1" "$OUT/$2"
        echo "$2 <- $1"
    fi
}
copy latest-x64.yml "$CHANNEL.yml"
copy latest-x64-linux.yml "$CHANNEL-linux.yml"
copy latest-arm64-linux-arm64.yml "$CHANNEL-linux-arm64.yml"

# The `files:` entries of a feed: the lines between `files:` and the next top-level key
files_of() { awk '/^files:/ { on = 1; next } /^[^ ]/ { on = 0 } on' "$1"; }
version_of() { sed -n 's/^version: //p' "$1"; }

MAC_FEEDS=()
for arch in x64 arm64; do
    [[ -f "$IN/latest-$arch-mac.yml" ]] && MAC_FEEDS+=("$IN/latest-$arch-mac.yml")
done
# One Mac feed alone would send Apple Silicon Macs the Intel build (MacUpdater falls back to
# the non-arm64 files), so write no Mac feed rather than half of one.
if [[ ${#MAC_FEEDS[@]} -eq 1 ]]; then
    echo "error: only ${MAC_FEEDS[0]##*/} exists; rebuild the other macOS arch first" >&2
    exit 1
fi
if [[ ${#MAC_FEEDS[@]} -eq 2 ]]; then
    FIRST="${MAC_FEEDS[0]}"
    VERSION=$(version_of "$FIRST")
    for feed in "${MAC_FEEDS[@]}"; do
        [[ "$(version_of "$feed")" == "$VERSION" ]] \
            || { echo "error: $feed is version $(version_of "$feed"), not $VERSION" >&2; exit 1; }
    done
    {
        echo "version: $VERSION"
        echo "files:"
        for feed in "${MAC_FEEDS[@]}"; do files_of "$feed"; done
        # path, sha512 and releaseDate of the first feed (older updaters read path/sha512)
        grep -E '^(path|sha512|releaseDate):' "$FIRST"
    } > "$OUT/$CHANNEL-mac.yml"
    echo "$CHANNEL-mac.yml <- ${MAC_FEEDS[*]##*/}"
fi
