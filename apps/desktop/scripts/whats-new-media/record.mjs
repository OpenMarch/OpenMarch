/* eslint-disable no-console -- a command-line script: it reports progress */
// Records the welcome flow's What's new clips from the real app (see README.md).
//
//   node scripts/whats-new-media/record.mjs [clip ...] [options]
//
// Run from apps/desktop after building the app. It launches the built Electron app with
// Playwright, sets each clip up, then films it frame by frame: a virtual clock (injected into
// every window) stands in for the app's time, so each frame is exactly 1/fps seconds after the
// last however slowly the machine draws. Frames are screenshots of the clip's region; ffmpeg
// turns them into a looping H.264 MP4 and a WebP poster, and a contact sheet of every clip.
//
// Options:
//   --out <dir>       where the clips go (default src/assets/welcome/whats-new)
//   --width <px>      output width, 16:10 (default 1280)
//   --fps <n>         frames per second (default 60)
//   --window <w>x<h>  the app window's size in points (default 1600x1000; it must fit the screen)
//   --software-gl     draw with SwiftShader (machines without a GPU, Docker)
//   --gpu-gl          draw on the GPU via ANGLE/Vulkan (Docker with an NVIDIA GPU passed in)
//   --keep-frames     keep the PNG frames in the work folder
//   --max-frames <n>  stop filming each clip after n frames (quick tests)
// Each run's work folder (log, contact sheet, failure screenshots, shows, frames) is
// scripts/whats-new-media/runs/<time>/ (git-ignored), or WHATS_NEW_WORK=<dir>.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS } from "./clips.mjs";
import {
    DESKTOP,
    even,
    keepWindowsLive,
    launch as launchApp,
    makeFilm,
    wait,
} from "../media-kit/app.mjs";
import { contactSheet, encodeClip } from "../media-kit/encode.mjs";
import { writePreload } from "../media-kit/page-setup.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(DESKTOP, "web/public/demos/part1-demo.dots");

function parseArgs(argv) {
    const options = {
        clips: [],
        out: path.join(DESKTOP, "src/assets/welcome/whats-new"),
        width: 1280,
        fps: 60,
        window: { width: 1600, height: 1000 },
        softwareGl: false,
        gpuGl: false,
        keepFrames: false,
        maxFrames: Infinity,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--out") options.out = path.resolve(argv[++i]);
        else if (arg === "--width") options.width = Number(argv[++i]);
        else if (arg === "--fps") options.fps = Number(argv[++i]);
        else if (arg === "--window") {
            const [width, height] = argv[++i].split("x").map(Number);
            options.window = { width, height };
        } else if (arg === "--software-gl") options.softwareGl = true;
        else if (arg === "--gpu-gl") options.gpuGl = true;
        else if (arg === "--keep-frames") options.keepFrames = true;
        else if (arg === "--max-frames") options.maxFrames = Number(argv[++i]);
        else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
        else options.clips.push(arg);
    }
    if (!(options.width > 0) || options.width % 2)
        throw new Error("--width must be even");
    if (!(options.fps > 0)) throw new Error("--fps must be positive");
    return options;
}

const options = parseArgs(process.argv.slice(2));
const WORK =
    process.env.WHATS_NEW_WORK ??
    path.join(HERE, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(WORK, { recursive: true });
const LOG = path.join(WORK, "record.log");
const log = (line) => {
    console.log(line);
    fs.appendFileSync(LOG, `${line}\n`);
};

/** The window, and the shape every clip is cut to (16:10, the media area's). */
const WINDOW = options.window;
const ASPECT = 16 / 10;
/** Seconds of the crossfade from each loop's end back to its start. */
const FADE = 0.6;

const PRELOAD = writePreload(WORK);

/** A box of the clip's shape around `box` (its centre kept), at least `minWidth` wide. */
export function frameAround(box, minWidth = 0) {
    let width = Math.max(box.width, box.height * ASPECT, minWidth);
    let height = width / ASPECT;
    width = Math.min(width, WINDOW.width);
    height = Math.min(height, WINDOW.height);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const x = Math.min(Math.max(0, cx - width / 2), WINDOW.width - width);
    const y = Math.min(Math.max(0, cy - height / 2), WINDOW.height - height);
    return { x: even(x), y: even(y), width: even(width), height: even(height) };
}

/** Opens `source` (a copy of it) in the app, in a profile of its own; returns the app and its window. */
function launch(source) {
    return launchApp({
        source,
        work: WORK,
        preload: PRELOAD,
        window: WINDOW,
        theme: "light",
        softwareGl: options.softwareGl,
        gpuGl: options.gpuGl,
        log,
    });
}

/** The shows a clip can ask for (`clip.show`): the demo, "line" (the timeline clip's show) or "tempo". */
const shows = {
    demo: DEMO,
    line: path.join(DESKTOP, "scripts/whats-new-media/line-test.dots"),
    tempo: path.join(DESKTOP, "scripts/whats-new-media/tempo-changes.dots"),
};
function showFor(name = "demo") {
    if (shows[name]) return shows[name];
    throw new Error(`no show "${name}"`);
}

// A clip waiting on a feature (`pending`, the PR that lands it) is recorded only when named.
const clips = CLIPS.filter((c) =>
    options.clips.length ? options.clips.includes(c.name) : !c.pending,
);
for (const name of options.clips)
    if (!CLIPS.some((c) => c.name === name))
        throw new Error(`no clip "${name}"`);
fs.mkdirSync(options.out, { recursive: true });
log(
    `What's new clips: ${clips.map((c) => c.name).join(", ")} at ${options.fps} fps, ${options.width} px wide`,
);
log(`   work folder: ${WORK}`);
for (const c of CLIPS)
    if (c.pending && !options.clips.includes(c.name))
        log(`-- ${c.name}: skipped until ${c.pending} is on main`);

let failed = false;
const made = [];
for (const clip of clips) {
    log(`>> ${clip.name}`);
    const { app, page } = await launch(showFor(clip.show));
    let shots = 0;
    /** A screenshot into the work folder, to see what a clip's setup did. */
    const shot = (name, target = page) =>
        target.screenshot({
            path: path.join(WORK, `${clip.name}-${++shots}-${name}.png`),
        });
    try {
        const ctx = {
            app,
            page,
            wait,
            frameAround,
            shot,
            keepWindowsLive,
            log,
            windowSize: WINDOW,
        };
        const { box, target = page } = await clip.prepare(ctx);
        await keepWindowsLive(app);
        const framesDir = path.join(WORK, `${clip.name}-frames`);
        fs.rmSync(framesDir, { recursive: true, force: true });
        fs.mkdirSync(framesDir);
        const film = makeFilm({
            app,
            target,
            box,
            framesDir,
            fps: options.fps,
            maxFrames: options.maxFrames,
        });
        await clip.perform({ ...ctx, target, film });
        const mp4 = path.join(options.out, `${clip.name}.mp4`);
        const webp = path.join(options.out, `${clip.name}.webp`);
        const { seconds } = encodeClip({
            framesDir,
            frameCount: film.frames,
            fps: options.fps,
            size: {
                width: options.width,
                height: even(options.width / ASPECT),
            },
            mp4,
            poster: webp,
            loop: "crossfade",
            fade: FADE,
            work: WORK,
        });
        made.push({ name: clip.name, mp4, seconds });
        log(`   ${film.frames} frames, ${seconds.toFixed(2)} s loop`);
        for (const f of [mp4, webp])
            log(`   ${f} (${fs.statSync(f).size} bytes)`);
        if (!options.keepFrames)
            fs.rmSync(framesDir, { recursive: true, force: true });
    } catch (error) {
        failed = true;
        log(`!! ${clip.name}: ${error.stack ?? error}`);
        const failure = path.join(WORK, `${clip.name}-failed.png`);
        await page.screenshot({ path: failure }).catch(() => {});
        log(`   screenshot: ${failure}`);
    } finally {
        await app.close().catch(() => {});
    }
}
if (made.length) {
    const sheet = contactSheet(made, path.join(WORK, "contact-sheet.png"));
    log(`Contact sheet: ${sheet}`);
}
log(`Clips are in ${options.out}. This log: ${LOG}`);
process.exit(failed ? 1 : 0);
