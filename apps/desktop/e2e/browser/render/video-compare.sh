#!/usr/bin/env bash
# cspell:ignore lutrgb hstack tpsnr lavfi
# Pairs frames of two video export runs (video-compare.spec.mts, #207).
#
#   video-compare.sh <folder> [before-label] [after-label] [fractions...]
#
# For each video in <folder>/<before>, takes the frames at the given fractions
# of its length (default 0.02 0.25 0.5 0.75 0.98) from it and from the video of
# the same name in <folder>/<after>, and writes to <folder>/frames:
#
# - <case>-<t>s.<label>.png: each frame;
# - <case>-<t>s.compare.png: before, after and their difference (times 4, so
#   small differences show) side by side;
# - summary.tsv: the PSNR of each pair (higher is closer; identical is inf).
#
# Needs ffmpeg and ffprobe.
set -euo pipefail

folder=$1
before=${2:-before}
after=${3:-after}
shift $(($# < 3 ? $# : 3))
fractions=("${@:-}")
[ -z "${fractions[0]}" ] && fractions=(0.02 0.25 0.5 0.75 0.98)

out="$folder/frames"
mkdir -p "$out"
printf "case\ttime\tpsnr\n" >"$out/summary.tsv"

frame() { # frame <video> <seconds> <png>
    ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 "$3"
}

for a in "$folder/$before"/*.webm "$folder/$before"/*.mp4; do
    [ -e "$a" ] || continue
    name=$(basename "${a%.*}")
    b=$(ls "$folder/$after/$name".* 2>/dev/null | grep -E '\.(webm|mp4)$' | head -1 || true)
    [ -n "$b" ] || { echo "no $after video for $name" >&2; continue; }
    duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$a")
    for f in "${fractions[@]}"; do
        t=$(awk -v d="$duration" -v f="$f" 'BEGIN { printf "%.2f", d * f }')
        base="$out/$name-${t}s"
        frame "$a" "$t" "$base.$before.png"
        frame "$b" "$t" "$base.$after.png"
        ffmpeg -v error -y -i "$base.$before.png" -i "$base.$after.png" -filter_complex \
            "[0][1]blend=all_mode=difference,lutrgb=r='min(val*4,255)':g='min(val*4,255)':b='min(val*4,255)'[d];[0][1][d]hstack=inputs=3" \
            "$base.compare.png"
        psnr=$(ffmpeg -v info -i "$base.$before.png" -i "$base.$after.png" -lavfi psnr -f null - 2>&1 |
            sed -n 's/.*average:\([^ ]*\).*/\1/p')
        printf "%s\t%s\t%s\n" "$name" "$t" "$psnr" >>"$out/summary.tsv"
    done
done
column -t "$out/summary.tsv"
