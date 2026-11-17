// cspell:words AVTB cwebp faststart libwebp libx movflags setpts settb STARTPTS vstack tpad
// Turning recorded frames into H.264 clips and WebP stills.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const even = (n) => Math.round(n / 2) * 2;

/** ffmpeg can write WebP itself (Homebrew's ffmpeg can't: then `cwebp` does). */
const HAS_LIBWEBP = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8",
}).includes("libwebp");

const ffmpeg = (args) =>
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);

/** A WebP from an image or a video's first frame. `width` scales it down (never up). */
export function toWebp(input, webp, { quality = 80, width, work } = {}) {
    const scale = width
        ? ["-vf", `scale='min(${width},iw)':-2:flags=lanczos`]
        : [];
    if (HAS_LIBWEBP) {
        ffmpeg([
            "-i",
            input,
            "-frames:v",
            "1",
            ...scale,
            "-c:v",
            "libwebp",
            "-quality",
            String(quality),
            webp,
        ]);
        return;
    }
    const png = path.join(
        work ?? path.dirname(webp),
        `${path.basename(webp)}.png`,
    );
    ffmpeg(["-i", input, "-frames:v", "1", ...scale, png]);
    execFileSync("cwebp", ["-quiet", "-q", String(quality), png, "-o", webp]);
    fs.rmSync(png, { force: true });
}

const H264 = (frameCount, fps) => [
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "28",
    "-profile:v",
    "high",
    // One keyframe, at the start: x264's default of one every 250 frames shows as a jump
    // in quality partway through a clip
    "-g",
    String(frameCount),
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
];

/**
 * A looping clip from the frames in `framesDir` (`%05d.png`), as `mp4`, with its first frame
 * as `poster` (WebP). `size` is the output `{ width, height }` (even numbers).
 *
 * `loop`:
 * - "crossfade": the last `fade` seconds blend into the first, ending on the frame just
 *   before the first, so it repeats without a jump (What's new clips).
 * - "hold": the last frame holds for `hold` seconds, then it starts again (docs clips,
 *   where the end state is what the reader needs to see).
 */
export function encodeClip({
    framesDir,
    frameCount,
    fps,
    size,
    mp4,
    poster,
    loop = "hold",
    fade = 0.6,
    hold = 1.2,
    work,
}) {
    const seconds = frameCount / fps;
    const scale = `scale=${even(size.width)}:${even(size.height)}:flags=lanczos,format=yuv420p`;
    const input = [
        "-framerate",
        String(fps),
        "-i",
        path.join(framesDir, "%05d.png"),
    ];
    let length;
    if (loop === "crossfade") {
        if (seconds <= fade * 2)
            throw new Error(`${mp4}: only ${frameCount} frames`);
        length = seconds - fade;
        const fadeFrames = Math.round(fade * fps);
        const part = (label, start, duration) =>
            `[${label}]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,settb=AVTB,fps=${fps}[${label}Part]`;
        const graph = [
            `[0:v]${scale},split=3[body][tail][head]`,
            part("body", fade, length - fade),
            part("tail", length, fade),
            part("head", 0, fade),
            // Frame N of the tail is (N + 1) / fadeFrames of the way to frame N of the head
            `[tailPart][headPart]blend=all_expr='A+(B-A)*min(1\\,(N+1)/${fadeFrames})'[joined]`,
            `[bodyPart][joined]concat=n=2:v=1:a=0[v]`,
        ].join(";");
        ffmpeg([
            ...input,
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            ...H264(frameCount, fps),
            mp4,
        ]);
    } else {
        length = seconds + hold;
        ffmpeg([
            ...input,
            "-vf",
            `${scale},tpad=stop_mode=clone:stop_duration=${hold}`,
            ...H264(frameCount + Math.round(hold * fps), fps),
            mp4,
        ]);
    }
    if (poster) toWebp(mp4, poster, { work });
    return { seconds: length };
}

/** One sheet with a few frames of every clip, one row per clip. */
export function contactSheet(clips, sheet) {
    const rows = clips.map(({ mp4, seconds }) => ({ mp4, step: seconds / 6 }));
    const inputs = rows.flatMap(({ mp4 }) => ["-i", mp4]);
    const graph =
        rows
            .map(
                ({ step }, i) =>
                    `[${i}:v]fps=1/${step.toFixed(3)},scale=320:-2,tile=6x1:padding=4:color=white[r${i}]`,
            )
            .join(";") +
        `;${rows.map((_, i) => `[r${i}]`).join("")}vstack=inputs=${rows.length}[s]`;
    ffmpeg([
        ...inputs,
        "-filter_complex",
        rows.length > 1
            ? graph
            : graph
                  .replace(/;\[r0\]vstack=inputs=1\[s\]$/, "")
                  .replace("[r0]", "[s]"),
        "-map",
        "[s]",
        "-frames:v",
        "1",
        sheet,
    ]);
    return sheet;
}
