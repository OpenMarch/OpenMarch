// cspell:words AVTB crossfading faststart libwebp libx movflags setpts settb STARTPTS ultrafast xfade
/* eslint-disable no-console -- a command-line script: it reports progress */
// Records the welcome flow's What's new clips from the real app (see README.md).
//
//   node scripts/whats-new-media/record.mjs [clip ...]
//
// Run from apps/desktop after `pnpm build`, on a display (xvfb-run on Linux). Each clip opens
// the bundled demo show, drives the app with Playwright, screen-records one region with
// ffmpeg, and encodes a looping H.264 MP4 and a WebP poster into src/assets/welcome/whats-new.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS } from "./clips.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "../..");
const OUT_DIR = path.join(DESKTOP, "src/assets/welcome/whats-new");
const SHOW = path.join(DESKTOP, "web/public/demos/part1-demo.dots");
const WORK = process.env.WHATS_NEW_WORK
    ? (fs.mkdirSync(process.env.WHATS_NEW_WORK, { recursive: true }),
      process.env.WHATS_NEW_WORK)
    : fs.mkdtempSync(path.join(os.tmpdir(), "whats-new-"));
const require = createRequire(path.join(DESKTOP, "package.json"));
const { _electron: electron } = require("playwright");

/** The window, and the size every clip is scaled to (16:10, the media area's shape). */
const WINDOW = { width: 1600, height: 1000 };
const OUTPUT_WIDTH = 960;
const ASPECT = 16 / 10;
/** Seconds of each loop, and of the crossfade from its end back to its start. */
const FADE = 0.6;

const display = process.env.DISPLAY;
if (!display) {
    console.error("No DISPLAY: run under xvfb-run (see README.md).");
    process.exit(1);
}

// The field draws a simpler view when WebGL runs in software (SwiftShader, as on a headless
// box). The clips should show the full view, so the renderer is reported as a GPU, and the
// notices about it are hidden.
const PRELOAD = path.join(WORK, "report-gpu.cjs");
fs.writeFileSync(
    PRELOAD,
    `require("electron").webFrame.executeJavaScript(${JSON.stringify(`(() => {
        for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
            const get = C.prototype.getParameter;
            C.prototype.getParameter = function (p) {
                const v = get.call(this, p);
                return typeof v === "string" && /swiftshader|llvmpipe/i.test(v) ? "Recording GPU" : v;
            };
        }
    })()`)});
require("electron").webFrame.insertCSS('[data-testid="view3d-quality-notice"] { display: none !important; }');`,
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const even = (n) => Math.round(n / 2) * 2;

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

async function launch() {
    const home = fs.mkdtempSync(path.join(WORK, "home-"));
    const show = path.join(home, "show.dots");
    fs.copyFileSync(SHOW, show);
    const app = await electron.launch({
        executablePath: require("electron"),
        args: [
            path.join(DESKTOP, "dist-electron/main/index.js"),
            show,
            "--no-sandbox",
            "--no-audio",
            "--ignore-gpu-blocklist",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
        ],
        env: {
            ...process.env,
            HOME: home,
            NODE_ENV: "development",
            PLAYWRIGHT_SESSION: "true",
        },
    });
    await app.evaluate(({ session }, file) => {
        session.defaultSession.registerPreloadScript({
            type: "frame",
            filePath: file,
        });
    }, PRELOAD);
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setBounds({ x: 0, y: 0, ...size });
        win.show();
        win.focus();
    }, WINDOW);
    // The demo was made before timelines: convert it, then wait for the show to load.
    await page
        .getByRole("button", { name: "Confirm" })
        .click({ timeout: 30000 });
    for (let i = 0; i < 120; i++) {
        const n = await page
            .evaluate(() => window.fieldTest?.marchers?.().length ?? 0)
            .catch(() => 0);
        if (n > 0) break;
        await wait(500);
    }
    await page.evaluate(() => window.electron.setTheme("light"));
    await wait(1500);
    return { app, page };
}

/** Where a window's page sits on the screen (window frames move it). */
async function screenOrigin(app, match) {
    return app.evaluate(({ BrowserWindow }, m) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
            m ? w.getURL().includes(m) : true,
        );
        const { x, y } = win.getContentBounds();
        return { x, y };
    }, match ?? null);
}

/** Starts recording `box` (page coordinates of the window at `origin`); stop() resolves when written. */
function recordRegion(file, box, origin, cursor) {
    const ff = spawn(
        "ffmpeg",
        [
            "-loglevel",
            "error",
            "-y",
            "-f",
            "x11grab",
            "-draw_mouse",
            cursor ? "1" : "0",
            "-framerate",
            "30",
            "-video_size",
            `${box.width}x${box.height}`,
            "-i",
            `${display}+${origin.x + box.x},${origin.y + box.y}`,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "10",
            "-pix_fmt",
            "yuv420p",
            file,
        ],
        { stdio: ["pipe", "inherit", "inherit"] },
    );
    return {
        stop: () =>
            new Promise((resolve) => {
                ff.on("close", resolve);
                ff.stdin.write("q");
                ff.stdin.end();
            }),
    };
}

/**
 * The finished loop: `seconds` long from `start` seconds into the raw recording, its last
 * FADE seconds crossfading into its first frames, so it repeats without a jump.
 */
function encode(raw, name, { start, seconds }) {
    const mp4 = path.join(OUT_DIR, `${name}.mp4`);
    const webp = path.join(OUT_DIR, `${name}.webp`);
    const graph = [
        `[0:v]fps=30,scale=${OUTPUT_WIDTH}:-2:flags=lanczos,split[a][b]`,
        `[a]trim=start=${start + FADE}:duration=${seconds},setpts=PTS-STARTPTS,settb=AVTB,fps=30[main]`,
        `[b]trim=start=${start}:duration=${FADE},setpts=PTS-STARTPTS,settb=AVTB,fps=30[head]`,
        `[main][head]xfade=transition=fade:duration=${FADE}:offset=${seconds - FADE},format=yuv420p[v]`,
    ].join(";");
    execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-i",
        raw,
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
        "30",
        "-profile:v",
        "high",
        "-movflags",
        "+faststart",
        mp4,
    ]);
    execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
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
    return [mp4, webp];
}

const wanted = process.argv.slice(2);
const clips = CLIPS.filter((c) => !wanted.length || wanted.includes(c.name));
fs.mkdirSync(OUT_DIR, { recursive: true });
let failed = false;
for (const clip of clips) {
    console.log(`>> ${clip.name}`);
    const { app, page } = await launch();
    try {
        let shots = 0;
        /** A screenshot into the work folder, to see what a clip's setup did. */
        const shot = (name, target = page) =>
            target.screenshot({
                path: path.join(WORK, `${clip.name}-${++shots}-${name}.png`),
            });
        const ctx = { app, page, wait, frameAround, screenOrigin, shot };
        const {
            box,
            window: windowMatch,
            target = page,
        } = await clip.prepare(ctx);
        const origin = await screenOrigin(app, windowMatch);
        const raw = path.join(WORK, `${clip.name}.raw.mp4`);
        const rec = recordRegion(raw, box, origin, clip.cursor);
        const began = Date.now();
        await clip.perform({ ...ctx, target });
        const remaining = (clip.seconds + FADE + (clip.lead ?? 0)) * 1000 + 300;
        await wait(Math.max(0, remaining - (Date.now() - began)));
        await rec.stop();
        if (process.env.KEEP_RAW)
            fs.copyFileSync(raw, path.join(OUT_DIR, `${clip.name}.raw.mp4`));
        const files = encode(raw, clip.name, {
            start: clip.lead ?? 0,
            seconds: clip.seconds,
        });
        for (const f of files)
            console.log(
                `   ${path.relative(DESKTOP, f)} ${fs.statSync(f).size} bytes`,
            );
    } catch (error) {
        failed = true;
        console.error(`!! ${clip.name}: ${error.stack ?? error}`);
        await page
            .screenshot({ path: path.join(WORK, `${clip.name}-failed.png`) })
            .catch(() => {});
        console.error(
            `   screenshot: ${path.join(WORK, `${clip.name}-failed.png`)}`,
        );
    } finally {
        await app.close().catch(() => {});
    }
}
process.exit(failed ? 1 : 0);
