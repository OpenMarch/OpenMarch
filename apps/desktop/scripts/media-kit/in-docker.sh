#!/bin/bash
# Runs a recording script inside the media image, on a virtual screen. On a machine with an
# NVIDIA GPU (and the NVIDIA Container Toolkit's CDI spec) it passes the GPU in and the app draws
# on it (--gpu-gl); elsewhere, CI included, it draws with SwiftShader (--software-gl).
# MEDIA_GPU=0 forces SwiftShader, e.g. to match what CI records.
#
#   scripts/media-kit/in-docker.sh scripts/docs-media/capture.mjs [args...]
#   scripts/media-kit/in-docker.sh scripts/whats-new-media/record.mjs timeline
#
# Run from apps/desktop after building the app. Builds the image (openmarch-media) the
# first time. Output lands in the repo as if the script ran on this machine.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$DESKTOP" && git rev-parse --show-toplevel)"
COMMON="$(cd "$DESKTOP" && cd "$(git rev-parse --git-common-dir)/.." && pwd)"
IMAGE=openmarch-media
# At most MEDIA_SLOTS (default 3) recordings at once on this machine: each one is a whole
# Electron app (drawing in software where there's no GPU). Later ones wait for a free slot.
SLOTS="${MEDIA_SLOTS:-3}"
LOCKS="${TMPDIR:-/tmp}/openmarch-media-locks"
mkdir -p "$LOCKS"
while :; do
    for i in $(seq "$SLOTS"); do
        exec 9>"$LOCKS/slot-$i"
        if flock -n 9; then break 2; fi
    done
    sleep 2
done
docker image inspect "$IMAGE" >/dev/null 2>&1 ||
    docker build -q -t "$IMAGE" "$HERE" >/dev/null
MOUNTS=(-v "$REPO:$REPO")
[ "$COMMON" != "$REPO" ] && MOUNTS+=(-v "$COMMON:$COMMON:ro")
# Created here, as you: Docker would create a missing mount point as root
[ -n "${DOCS_MEDIA_WORK:-}" ] && mkdir -p "$DOCS_MEDIA_WORK"
[ -n "${DOCS_MEDIA_WORK:-}" ] && MOUNTS+=(-v "$DOCS_MEDIA_WORK:$DOCS_MEDIA_WORK") &&
    ENV_WORK=(-e "DOCS_MEDIA_WORK=$DOCS_MEDIA_WORK") || ENV_WORK=()
GPU=(); GL=--software-gl
# Needs the NVIDIA driver and the NVIDIA Container Toolkit's CDI spec (`nvidia-ctk cdi generate`);
# a machine with only the driver draws in software rather than failing at `docker run`
if [ "${MEDIA_GPU:-1}" != 0 ] && nvidia-smi -L >/dev/null 2>&1 &&
    grep -qs 'nvidia.com/gpu' /etc/cdi/* /var/run/cdi/*; then
    # CDI device: `docker run --gpus all` fails on some Docker versions
    GPU=(--device nvidia.com/gpu=all -e NVIDIA_DRIVER_CAPABILITIES=all); GL=--gpu-gl
fi
echo "in-docker.sh: drawing with ${GL#--}" >&2
docker run --rm --init "${GPU[@]}" --shm-size=1g --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e MEDIA_EXTRA_ARGS="${MEDIA_EXTRA_ARGS:-}" "${ENV_WORK[@]}" "${MOUNTS[@]}" -w "$DESKTOP" "$IMAGE" \
    xvfb-run -a -s "-screen 0 3840x2400x24" node "$@" "$GL"
