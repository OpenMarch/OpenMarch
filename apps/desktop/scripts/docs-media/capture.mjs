/* eslint-disable no-console -- a command-line script: it reports progress */
// Captures the user guide's screenshots and clips from the real app (see README.md).
//
//   node scripts/docs-media/capture.mjs [shot-id | chapter ...] [options]
//   scripts/media-kit/in-docker.sh scripts/docs-media/capture.mjs [...]   (headless Linux)
//
// Run from apps/desktop after building the app. Every shot is defined in shots/<chapter>.mjs.
// With no names, every shot is captured. Each one is captured in light and dark, at 2× pixels,
// with the input overlay (pointer, clicks, keys) wherever the shot turns it on.
//
// Options:
//   --theme light|dark   only one theme (default: both)
//   --software-gl        draw with SwiftShader (Docker without a GPU, CI; in-docker.sh adds it)
//   --gpu-gl             draw on the GPU via ANGLE/Vulkan (Docker with an NVIDIA GPU; in-docker.sh adds it)
//   --max-frames <n>     stop each clip after n frames (quick tests)
//   --list               list the shots and exit
// Output: apps/website/public/docs/media/<chapter>/<id>.<theme>.(webp|mp4), and
// apps/website/src/data/docs-media.json (sizes and kinds, read by the site's <Shot>).
// Each run's work folder (log, contact sheet, failures, and results.json: one entry per shot
// and theme, with its outcome) is scripts/docs-media/runs/<time>/ (git-ignored), or
// DOCS_MEDIA_WORK=<dir>.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    DESKTOP,
    capture,
    even,
    freezeClocks,
    launch,
    makeFilm,
    wait,
    waitInPage,
    waitUntilSteady,
} from "../media-kit/app.mjs";
import { contactSheet, encodeClip, toWebp } from "../media-kit/encode.mjs";
import { writePreload } from "../media-kit/page-setup.mjs";
import { loadShots, showPath } from "./shot-list.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE = path.resolve(DESKTOP, "../website");
const MEDIA = path.join(WEBSITE, "public/docs/media");
const MANIFEST = path.join(WEBSITE, "src/data/docs-media.json");

/** The app window every shot uses, in points. */
const WINDOW = { width: 1600, height: 1000 };
/** Device pixels per point: images are captured at 2× and scaled to their output width. */
const SCALE = 2;
const FPS = 30;

function parseArgs(argv) {
    const options = {
        names: [],
        themes: ["light", "dark"],
        softwareGl: false,
        gpuGl: false,
        maxFrames: Infinity,
        list: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--theme") options.themes = [argv[++i]];
        else if (arg === "--software-gl") options.softwareGl = true;
        else if (arg === "--gpu-gl") options.gpuGl = true;
        else if (arg === "--max-frames") options.maxFrames = Number(argv[++i]);
        else if (arg === "--list") options.list = true;
        else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
        else options.names.push(arg);
    }
    return options;
}

/** The box around `locator` (window points), grown by `pad`, kept inside the window. */
async function around(locator, pad = 12) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`nothing to frame: ${locator}`);
    const x = Math.max(0, Math.floor(b.x - pad));
    const y = Math.max(0, Math.floor(b.y - pad));
    const right = Math.min(WINDOW.width, Math.ceil(b.x + b.width + pad));
    const bottom = Math.min(WINDOW.height, Math.ceil(b.y + b.height + pad));
    return { x, y, width: right - x, height: bottom - y };
}

/** Two boxes' union (for a crop that spans a control and what it changed). */
function union(...boxes) {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
}

const WHOLE = { x: 0, y: 0, ...WINDOW };

/** Merges this run's entries into the manifest, under a lock (runs can overlap). */
function writeManifest({ prune = false } = {}) {
    const lock = `${MANIFEST}.lock`;
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    for (let i = 0; ; i++) {
        try {
            fs.mkdirSync(lock);
            break;
        } catch {
            if (i > 600) throw new Error(`${lock} is stuck: delete it`);
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
    }
    try {
        const current = fs.existsSync(MANIFEST)
            ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
            : {};
        const next = { ...current, ...manifest };
        // Shots that no longer exist leave the manifest (their files are reported, not deleted)
        if (prune && pruneMissing)
            for (const id of Object.keys(next))
                if (!shots.some((s) => s.id === id)) {
                    log(
                        `   ${id} is no longer a shot: delete its files in public/docs/media`,
                    );
                    delete next[id];
                }
        const sorted = Object.fromEntries(
            Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
        );
        fs.writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 4)}\n`);
    } finally {
        fs.rmdirSync(lock);
    }
}

const options = parseArgs(process.argv.slice(2));
const shots = await loadShots();
if (options.list) {
    for (const s of shots) console.log(`${s.chapter}/${s.id} (${s.kind})`);
    process.exit(0);
}
const chosen = options.names.length
    ? shots.filter(
          (s) =>
              options.names.includes(s.id) || options.names.includes(s.chapter),
      )
    : shots;
for (const name of options.names)
    if (!shots.some((s) => s.id === name || s.chapter === name))
        throw new Error(`no shot or chapter "${name}"`);

const WORK =
    process.env.DOCS_MEDIA_WORK ??
    path.join(HERE, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(WORK, { recursive: true });
const LOG = path.join(WORK, "capture.log");
const log = (line) => {
    console.log(line);
    fs.appendFileSync(LOG, `${line}\n`);
};
const PRELOAD = writePreload(WORK, { overlay: true });

// This run's entries; merged into the manifest at the end (other runs may be writing it too)
const manifest = {};
const pruneMissing = options.names.length === 0;

log(
    `Docs media: ${chosen.length} shot(s), ${options.themes.join(" and ")}; work folder ${WORK}`,
);
let failed = 0;
const clips = [];
/** One entry per shot and theme, for scripts (refresh.mjs): what was written, or the error. */
const results = [];
/** Saves what's done so far, so a crash or a time limit doesn't lose the shots already recorded. */
function saveProgress() {
    writeManifest();
    const file = path.join(WORK, "results.json");
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(results, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
}
for (const shot of chosen) {
    const outDir = path.join(MEDIA, shot.chapter);
    fs.mkdirSync(outDir, { recursive: true });
    for (const theme of shot.themes ?? options.themes) {
        if (!options.themes.includes(theme)) continue;
        log(`>> ${shot.chapter}/${shot.id} (${theme})`);
        const source = showPath(shot);
        // One show that won't open costs that shot, not the rest of the run
        let launched;
        try {
            launched = await launch({
                source,
                work: WORK,
                preload: PRELOAD,
                window: WINDOW,
                theme,
                softwareGl: options.softwareGl,
                gpuGl: options.gpuGl,
                uiSettings: shot.uiSettings,
                mode: shot.mode ?? "expert",
                scale: SCALE,
                log,
            });
        } catch (error) {
            failed++;
            log(`!! ${shot.id} (${theme}): ${error.stack ?? error}`);
            results.push({
                id: shot.id,
                chapter: shot.chapter,
                theme,
                kind: shot.kind,
                ok: false,
                error: String(error.stack ?? error),
            });
            saveProgress();
            continue;
        }
        const { app, page } = launched;
        let frameBox = WHOLE;
        const overlay = {
            enable: () =>
                page.evaluate((f) => {
                    window.__docsOverlay.setFrame(f);
                    window.__docsOverlay.enable();
                }, frameBox),
            disable: () => page.evaluate(() => window.__docsOverlay.disable()),
            place: (x, y) =>
                page.evaluate(
                    ([px, py]) => window.__docsOverlay.place(px, py),
                    [x, y],
                ),
            show: (text) =>
                page.evaluate((t) => window.__docsOverlay.show(t), text),
        };
        const ctx = {
            app,
            page,
            theme,
            window: WINDOW,
            whole: WHOLE,
            around,
            union,
            overlay,
            wait,
            waitInPage: (check, seconds) => waitInPage(page, check, seconds),
            log,
        };
        try {
            const prepared = (await shot.setup?.(ctx)) ?? {};
            let box = prepared.box ?? WHOLE;
            box = {
                x: even(box.x),
                y: even(box.y),
                width: even(box.width),
                height: even(box.height),
            };
            frameBox = box;
            const base = path.join(outDir, `${shot.id}.${theme}`);
            const result = {
                id: shot.id,
                chapter: shot.chapter,
                theme,
                kind: shot.kind,
            };
            const target = prepared.target ?? page;
            // The view settles before anything is filmed (#766, #767)
            const steady = () =>
                waitUntilSteady(app, target, box).then(
                    (ok) =>
                        ok || log("   warning: the view never stopped moving"),
                );
            if (shot.kind === "clip") {
                const framesDir = path.join(WORK, `${shot.id}-${theme}-frames`);
                fs.rmSync(framesDir, { recursive: true, force: true });
                fs.mkdirSync(framesDir);
                const film = makeFilm({
                    app,
                    target,
                    box,
                    framesDir,
                    fps: FPS,
                    maxFrames: options.maxFrames,
                });
                await steady();
                await film.freeze();
                await shot.perform({ ...ctx, film, box });
                const width = Math.min(shot.width ?? 1280, box.width * SCALE);
                const size = {
                    width: even(width),
                    height: even((width * box.height) / box.width),
                };
                const { seconds } = encodeClip({
                    framesDir,
                    frameCount: film.frames,
                    fps: FPS,
                    size,
                    mp4: `${base}.mp4`,
                    poster: `${base}.webp`,
                    loop: "hold",
                    hold: shot.hold ?? 1.2,
                    work: WORK,
                });
                fs.rmSync(framesDir, { recursive: true, force: true });
                clips.push({ mp4: `${base}.mp4`, seconds });
                manifest[shot.id] = {
                    chapter: shot.chapter,
                    kind: "clip",
                    width: size.width,
                    height: size.height,
                    seconds: Number(seconds.toFixed(2)),
                };
                results.push({
                    ...result,
                    ok: true,
                    files: [`${base}.mp4`, `${base}.webp`],
                });
                log(
                    `   ${film.frames} frames → ${base}.mp4 (${fs.statSync(`${base}.mp4`).size} bytes)`,
                );
            } else {
                await shot.perform?.(ctx);
                await wait(shot.settle ?? 400);
                await steady();
                await freezeClocks(app);
                const png = path.join(WORK, `${shot.id}-${theme}.png`);
                fs.writeFileSync(png, await capture(app, target, box));
                const width = Math.min(shot.width ?? 1600, box.width * SCALE);
                toWebp(png, `${base}.webp`, { width, quality: 82, work: WORK });
                manifest[shot.id] = {
                    chapter: shot.chapter,
                    kind: "still",
                    width: even(width),
                    height: even((width * box.height) / box.width),
                };
                results.push({ ...result, ok: true, files: [`${base}.webp`] });
                log(
                    `   → ${base}.webp (${fs.statSync(`${base}.webp`).size} bytes)`,
                );
            }
        } catch (error) {
            failed++;
            log(`!! ${shot.id} (${theme}): ${error.stack ?? error}`);
            const failure = path.join(WORK, `${shot.id}-${theme}-failed.png`);
            await page.screenshot({ path: failure }).catch(() => {});
            log(`   screenshot: ${failure}`);
            results.push({
                id: shot.id,
                chapter: shot.chapter,
                theme,
                kind: shot.kind,
                ok: false,
                error: String(error.stack ?? error),
                screenshot: fs.existsSync(failure) ? failure : undefined,
            });
        } finally {
            await app.close().catch(() => {});
        }
        saveProgress();
    }
}
writeManifest({ prune: true });
if (clips.length)
    log(
        `Contact sheet: ${contactSheet(clips, path.join(WORK, "contact-sheet.png"))}`,
    );
log(failed ? `${failed} capture(s) failed. Log: ${LOG}` : `Done. Log: ${LOG}`);
process.exit(failed ? 1 : 0);
