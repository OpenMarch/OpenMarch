// cspell:words AVTB cwebp faststart libwebp libx movflags setpts settb STARTPTS vstack
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
//   --keep-frames     keep the PNG frames in the work folder
//   --max-frames <n>  stop filming each clip after n frames (quick tests)
// Each run's work folder (log, contact sheet, failure screenshots, shows, frames) is
// scripts/whats-new-media/runs/<time>/ (git-ignored), or WHATS_NEW_WORK=<dir>.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS } from "./clips.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "../..");
const DEMO = path.join(DESKTOP, "web/public/demos/part1-demo.dots");
const require = createRequire(path.join(DESKTOP, "package.json"));
const { _electron: electron } = require("playwright");

function parseArgs(argv) {
    const options = {
        clips: [],
        out: path.join(DESKTOP, "src/assets/welcome/whats-new"),
        width: 1280,
        fps: 60,
        window: { width: 1600, height: 1000 },
        softwareGl: false,
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const even = (n) => Math.round(n / 2) * 2;

// Injected into every window before the page's scripts:
// - A virtual clock. While set, performance.now() and every AudioContext's currentTime follow
//   it instead of real time. The app's playback reads its time from the AudioContext, and the
//   3D View extrapolates from performance.now(), so stepping this clock in every window moves
//   the show by exactly that much, and animations step with it.
// - The field draws a simpler view when WebGL runs in software (SwiftShader); the clips should
//   show the full view, so a software renderer is reported as a GPU and its notice is hidden.
const PAGE_SETUP = `(() => {
    if (window.__whatsNewClock) return;
    const realNow = performance.now.bind(performance);
    const origin = performance.timeOrigin;
    let wallMs = null;
    window.__whatsNewClock = {
        set(ms) { wallMs = ms; },
        release() { wallMs = null; },
    };
    performance.now = () => (wallMs === null ? realNow() : wallMs - origin);
    const time = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "currentTime");
    const anchors = new WeakMap();
    Object.defineProperty(BaseAudioContext.prototype, "currentTime", {
        configurable: true,
        get() {
            const real = time.get.call(this);
            if (wallMs === null) { anchors.delete(this); return real; }
            let anchor = anchors.get(this);
            if (!anchor) { anchor = { real, wall: wallMs }; anchors.set(this, anchor); }
            return anchor.real + (wallMs - anchor.wall) / 1000;
        },
    });
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const get = C.prototype.getParameter;
        C.prototype.getParameter = function (p) {
            const v = get.call(this, p);
            return typeof v === "string" && /swiftshader|llvmpipe/i.test(v) ? "Recording GPU" : v;
        };
    }
})()`;
const PRELOAD = path.join(WORK, "page-setup.cjs");
fs.writeFileSync(
    PRELOAD,
    `const { webFrame } = require("electron");
webFrame.executeJavaScript(${JSON.stringify(PAGE_SETUP)});
webFrame.insertCSS('[data-testid="view3d-quality-notice"] { display: none !important; }');`,
);

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

/** Every open window stays fully live (no throttling when covered by another). */
async function keepWindowsLive(app) {
    await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows())
            w.webContents.setBackgroundThrottling(false);
    });
}

/** Opens `source` (a copy of it) in the app, in a profile of its own; returns the app and its window. */
async function launch(source) {
    const home = fs.mkdtempSync(path.join(WORK, "profile-"));
    const show = path.join(home, "show.dots");
    fs.copyFileSync(source, show);
    const gl = options.softwareGl
        ? [
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
              "--ignore-gpu-blocklist",
          ]
        : [];
    const app = await electron.launch({
        executablePath: require("electron"),
        args: [
            path.join(DESKTOP, "dist-electron/main/index.js"),
            show,
            // Settings and recent files go to this run's profile, never the user's own
            `--user-data-dir=${path.join(home, "user-data")}`,
            "--no-sandbox",
            "--no-audio",
            // Each run's profile is new, so on a Mac Chromium would ask for a keychain entry
            // every time
            ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
            ...gl,
        ],
        env: {
            ...process.env,
            // electron-store follows HOME on Linux
            HOME: home,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
        },
    });
    const userData = await app.evaluate(({ app }) => app.getPath("userData"));
    if (!userData.startsWith(home))
        log(
            `   warning: the app's settings are in ${userData}, not this run's profile`,
        );
    await app.evaluate(({ session }, file) => {
        session.defaultSession.registerPreloadScript({
            type: "frame",
            filePath: file,
        });
    }, PRELOAD);
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentBounds({ x: 0, y: 0, ...size });
        win.show();
        win.focus();
    }, WINDOW);
    // A show from before timelines asks to convert first
    const convert = page.getByRole("button", { name: "Confirm" });
    const asked = await convert
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
    if (asked) await convert.click();
    for (let i = 0; i < 120; i++) {
        const n = await page
            .evaluate(() => window.fieldTest?.marchers?.().length ?? 0)
            .catch(() => 0);
        if (n > 0) break;
        await wait(500);
    }
    // The preload only reaches pages loaded after it's registered: reload into it
    await page.reload();
    for (let i = 0; i < 120; i++) {
        const ready = await page
            .evaluate(
                () =>
                    Boolean(window.__whatsNewClock) &&
                    (window.fieldTest?.marchers?.().length ?? 0) > 0,
            )
            .catch(() => false);
        if (ready) break;
        await wait(500);
    }
    await page.evaluate(() => window.electron.setTheme("light"));
    await keepWindowsLive(app);
    await wait(1500);
    return { app, page, show };
}

/** The shows a clip can ask for (`clip.show`): the demo, or "line", the timeline clip's show. */
const shows = {
    demo: DEMO,
    line: path.join(DESKTOP, "scripts/whats-new-media/line-test.dots"),
};
function showFor(name = "demo") {
    if (shows[name]) return shows[name];
    throw new Error(`no show "${name}"`);
}

/**
 * Films a clip: `film.frame()` steps the virtual clock 1/fps seconds in every window, waits for
 * them to draw, and saves a screenshot of the clip's region.
 */
// eslint-disable-next-line max-lines-per-function
function makeFilm({ app, target, box, framesDir }) {
    const step = 1000 / options.fps;
    let wallMs = null;
    let count = 0;
    const windows = () => app.windows();
    const setClock = (ms) =>
        Promise.all(
            windows().map((w) =>
                w
                    .evaluate((t) => window.__whatsNewClock?.set(t), ms)
                    .catch(() => {}),
            ),
        );
    const settle = () =>
        Promise.all(
            windows().map((w) =>
                w
                    .evaluate(
                        () =>
                            new Promise((r) =>
                                requestAnimationFrame(() =>
                                    requestAnimationFrame(r),
                                ),
                            ),
                    )
                    .catch(() => {}),
            ),
        );
    const film = {
        fps: options.fps,
        get frames() {
            return count;
        },
        /** Stops real time: from here on, time moves only by `frame`, `skip` and `hold`. */
        async freeze() {
            wallMs = Date.now();
            await setClock(wallMs);
            await settle();
        },
        /** Moves time on by `seconds` without filming it. */
        async skip(seconds) {
            const n = Math.round(seconds * options.fps);
            for (let i = 0; i < n; i++) {
                wallMs += step;
                await setClock(wallMs);
                await settle();
            }
        },
        /**
         * One frame: time moves on 1/fps seconds (once frozen; otherwise real time runs), then
         * the region is saved.
         */
        async frame(beforeShot) {
            if (count >= options.maxFrames) return;
            if (wallMs !== null) {
                wallMs += step;
                await setClock(wallMs);
            }
            await settle();
            await settle();
            await beforeShot?.(count);
            // Electron's own capture, not Playwright's screenshot: that one cancels a drag
            // under way (the field treats it as a lost pointer)
            const png = await app.evaluate(
                ({ BrowserWindow }, { url, rect }) => {
                    const win = BrowserWindow.getAllWindows().find(
                        (w) => w.webContents.getURL() === url,
                    );
                    return win.webContents
                        .capturePage(rect)
                        .then((image) => image.toPNG().toString("base64"));
                },
                { url: target.url(), rect: box },
            );
            fs.writeFileSync(
                path.join(framesDir, `${String(count).padStart(5, "0")}.png`),
                Buffer.from(png, "base64"),
            );
            count++;
        },
        /** `seconds` of frames, calling `each(i)` before each one. */
        async hold(seconds, each) {
            const n = Math.round(seconds * options.fps);
            for (let i = 0; i < n; i++)
                await film.frame(each ? () => each(i) : undefined);
        },
        /** A mouse drag from `a` to `b` over `seconds`, one even step per frame. */
        async drag(page, a, b, seconds) {
            const n = Math.max(1, Math.round(seconds * options.fps));
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            for (let i = 1; i <= n; i++) {
                await page.mouse.move(
                    a.x + ((b.x - a.x) * i) / n,
                    a.y + ((b.y - a.y) * i) / n,
                );
                // A capped test still finishes the drag, so the clip's later steps work
                if (count < options.maxFrames) await film.frame();
            }
            await page.mouse.up();
        },
        /** Back to real time (for waiting on something that runs on timers). */
        async release() {
            await Promise.all(
                windows().map((w) =>
                    w
                        .evaluate(() => window.__whatsNewClock?.release())
                        .catch(() => {}),
                ),
            );
            wallMs = null;
        },
    };
    return film;
}

/** ffmpeg can write the WebP poster itself (Homebrew's ffmpeg can't: then `cwebp` does). */
const HAS_LIBWEBP = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8",
}).includes("libwebp");

/**
 * The finished loop from the frames: from FADE seconds in, its last FADE seconds blending into
 * the first FADE seconds of frames. The blend reaches them fully on the last frame, which is
 * then the frame just before the first: it repeats without a jump.
 */
function encode(framesDir, name, frameCount) {
    const fps = options.fps;
    const seconds = frameCount / fps;
    if (seconds <= FADE * 2)
        throw new Error(`${name}: only ${frameCount} frames`);
    const length = seconds - FADE;
    const fadeFrames = Math.round(FADE * fps);
    const mp4 = path.join(options.out, `${name}.mp4`);
    const webp = path.join(options.out, `${name}.webp`);
    const part = (label, start, duration) =>
        `[${label}]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,settb=AVTB,fps=${fps}[${label}Part]`;
    const graph = [
        // Exactly 16:10, whatever the region's rounding
        `[0:v]scale=${options.width}:${even(options.width / ASPECT)}:flags=lanczos,format=yuv420p,split=3[body][tail][head]`,
        part("body", FADE, length - FADE),
        part("tail", length, FADE),
        part("head", 0, FADE),
        // Frame N of the tail is (N + 1) / fadeFrames of the way to frame N of the head
        `[tailPart][headPart]blend=all_expr='A+(B-A)*min(1\\,(N+1)/${fadeFrames})'[joined]`,
        `[bodyPart][joined]concat=n=2:v=1:a=0[v]`,
    ].join(";");
    const ffmpeg = (args) =>
        execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
    ffmpeg([
        "-framerate",
        String(fps),
        "-i",
        path.join(framesDir, "%05d.png"),
        "-filter_complex",
        graph,
        "-map",
        "[v]",
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
        mp4,
    ]);
    if (HAS_LIBWEBP)
        ffmpeg([
            "-i",
            mp4,
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-quality",
            "80",
            webp,
        ]);
    else {
        const png = path.join(WORK, `${name}-poster.png`);
        ffmpeg(["-i", mp4, "-frames:v", "1", png]);
        execFileSync("cwebp", ["-quiet", "-q", "80", png, "-o", webp]);
    }
    return { mp4, webp, seconds: length };
}

/** One sheet with a few frames of every clip, one row per clip. */
function contactSheet(clips) {
    const sheet = path.join(WORK, "contact-sheet.png");
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
    execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
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
        const film = makeFilm({ app, target, box, framesDir });
        await clip.perform({ ...ctx, target, film });
        const { mp4, webp, seconds } = encode(
            framesDir,
            clip.name,
            film.frames,
        );
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
    const sheet = contactSheet(made);
    log(`Contact sheet: ${sheet}`);
}
log(`Clips are in ${options.out}. This log: ${LOG}`);
process.exit(failed ? 1 : 0);
