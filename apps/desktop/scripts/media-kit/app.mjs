// Launching the built app for a recording, and filming it frame by frame. Shared by the
// What's new clips (scripts/whats-new-media) and the docs media (scripts/docs-media).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DESKTOP = path.resolve(HERE, "../..");
const require = createRequire(path.join(DESKTOP, "package.json"));
const { _electron: electron } = require("playwright");

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const even = (n) => Math.round(n / 2) * 2;

/** Every open window stays fully live (no throttling when covered by another). */
export async function keepWindowsLive(app) {
    await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows())
            w.webContents.setBackgroundThrottling(false);
    });
}

/** Waits until `check()` in the page is true, up to `seconds`. */
export async function waitInPage(page, check, seconds = 60) {
    for (let i = 0; i < seconds * 2; i++) {
        const ok = await page.evaluate(check).catch(() => false);
        if (ok) return true;
        await wait(500);
    }
    return false;
}

/**
 * Opens a copy of `source` (a .dots file) in the built app, in a profile of its own, and
 * returns the app, its window and the copy's path.
 *
 * - `work`: the run's folder (profiles and shows go under it).
 * - `preload`: from `writePreload` (media-kit/page-setup.mjs).
 * - `window`: the content size in points, `{ width, height }`.
 * - `theme`: "light" or "dark".
 * - `softwareGl`: draw with SwiftShader (machines without a GPU, Docker).
 * - `gpuGl`: draw on the GPU through ANGLE's Vulkan backend (Docker with an NVIDIA GPU passed
 *   in; in-docker.sh picks it when the machine has one). Under Xvfb this is the only way to reach
 *   the GPU: ANGLE's GL backend gets Mesa's software llvmpipe.
 * - `uiSettings`: settings merged into the app's stored UI settings before it loads the show.
 * - `mode`: "basic" or "expert" (the app setting; automated sessions default to Expert).
 * - `scale`: device pixels per point (2 for sharp docs images; the screen must fit it).
 * - `log`: for warnings.
 */
// eslint-disable-next-line max-lines-per-function
export async function launch({
    source,
    work,
    preload,
    window: size,
    theme = "light",
    softwareGl = false,
    gpuGl = false,
    uiSettings,
    mode,
    scale = 1,
    log = () => {},
}) {
    const home = fs.mkdtempSync(path.join(work, "profile-"));
    const show = path.join(home, "show.dots");
    fs.copyFileSync(source, show);
    const gl = gpuGl
        ? [
              "--use-gl=angle",
              "--use-angle=vulkan",
              "--enable-features=Vulkan",
              "--ignore-gpu-blocklist",
          ]
        : softwareGl
          ? [
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
                // SwiftShader composites the panels' see-through surfaces into gray blocks;
                // software compositing draws them right (WebGL still uses SwiftShader)
                "--disable-gpu-compositing",
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
            ...(scale !== 1 ? [`--force-device-scale-factor=${scale}`] : []),
            ...(process.env.MEDIA_EXTRA_ARGS?.split(" ").filter(Boolean) ?? []),
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
    }, preload);
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, s) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentBounds({ x: 0, y: 0, ...s });
        win.show();
        win.focus();
    }, size);
    // A show from before timelines asks to convert first. Under load the question can come
    // late, so keep watching for it until the show's marchers are on the field.
    const convert = page.getByRole("button", { name: "Confirm" });
    for (let i = 0; i < 240; i++) {
        if (await convert.isVisible().catch(() => false))
            await convert.click().catch(() => {});
        const loaded = await page
            .evaluate(() => (window.fieldTest?.marchers?.().length ?? 0) > 0)
            .catch(() => false);
        if (loaded) break;
        await wait(500);
    }
    if (uiSettings)
        await page.evaluate((patch) => {
            const key = "openmarch:uiSettings";
            const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
            const state = stored.state ?? stored;
            const next = stored.state
                ? { ...stored, state: { ...state, ...patch } }
                : { ...state, ...patch };
            localStorage.setItem(key, JSON.stringify(next));
        }, uiSettings);
    if (mode)
        await page.evaluate(
            (m) => window.electron.send("settings:set", { editorMode: m }),
            mode,
        );
    if (mode) await wait(300);
    // The theme is read when the page loads, so it's stored before the reload
    await page.evaluate((t) => window.electron.setTheme(t), theme);
    // The preload only reaches pages loaded after it's registered: reload into it
    await page.reload();
    await waitInPage(
        page,
        () =>
            Boolean(window.__whatsNewClock) &&
            (window.fieldTest?.marchers?.().length ?? 0) > 0,
    );
    await keepWindowsLive(app);
    await wait(1500);
    await fitField(page, log);
    return { app, page, show };
}

/**
 * Fits the field to its pane again, as the zoom readout's reset does, and waits for it to
 * land. The app fits the field only while the panels around it are still laying out as the
 * show opens; on a slow machine the timeline can finish sizing after that, and the field
 * keeps the old fit (about 18 points off, #767). So this waits for the panes to stop resizing
 * first, because a resize after the fit keeps the field's zoom and top-left instead of fitting.
 */
async function fitField(page, log) {
    const layout = () =>
        page
            .evaluate(() =>
                JSON.stringify(
                    [
                        ...document.querySelectorAll(
                            'canvas, [data-testid="timeline-pane"]',
                        ),
                    ].map((el) => el.getBoundingClientRect()),
                ),
            )
            .catch(() => "");
    let before = "";
    for (let same = 0, i = 0; same < 3 && i < 40; i++) {
        await wait(250);
        const now = await layout();
        same = now === before ? same + 1 : 0;
        before = now;
    }
    const reset = page.getByRole("button", { name: /reset zoom and center/i });
    try {
        await reset.click({ timeout: 5000 });
    } catch (error) {
        log(`   warning: couldn't fit the field to its pane: ${error.message}`);
        return;
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur?.());
    let last = "";
    for (let same = 0, i = 0; same < 3 && i < 40; i++) {
        await wait(250);
        const now = await page
            .evaluate(() => JSON.stringify(window.fieldTest?.viewport()))
            .catch(() => "");
        same = now === last ? same + 1 : 0;
        last = now;
    }
}

/**
 * A still of `rect` (window points) in `target`, as PNG bytes. Electron's own capture, not
 * Playwright's screenshot: that one cancels a drag under way (the field treats it as a lost
 * pointer), and it never shows the overlay's pointer mid-gesture.
 */
export async function capture(app, target, rect) {
    const png = await app.evaluate(
        ({ BrowserWindow }, { url, rect: r }) => {
            const win = BrowserWindow.getAllWindows().find(
                (w) => w.webContents.getURL() === url,
            );
            return win.webContents
                .capturePage(r)
                .then((image) => image.toPNG().toString("base64"));
        },
        { url: target.url(), rect },
    );
    return Buffer.from(png, "base64");
}

/** Waits two frames in every open window, so each one draws what it has now. */
async function drawEveryWindow(app) {
    await Promise.all(
        app
            .windows()
            .map((w) =>
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
}

/**
 * Waits until `rect` of `target` stops changing: two captures `gapMs` apart give the same
 * pixels. A view still easing into place (the field fitting itself to its pane, the 3D View's
 * camera arriving) would otherwise be caught at a different point on each run. Returns false
 * (and the picture is taken anyway) if it's still changing after `seconds`.
 */
export async function waitUntilSteady(
    app,
    target,
    rect,
    { gapMs = 500, seconds = 20 } = {},
) {
    const end = Date.now() + seconds * 1000;
    let last = await capture(app, target, rect);
    while (Date.now() < end) {
        await wait(gapMs);
        const next = await capture(app, target, rect);
        if (next.equals(last)) return true;
        last = next;
    }
    return false;
}

/**
 * Stops the clock in every open window (the 3D View's too) and lets each draw once, so nothing
 * the clock drives moves between here and the capture. Time stays stopped until the app closes.
 */
export async function freezeClocks(app) {
    const ms = Date.now();
    await Promise.all(
        app
            .windows()
            .map((w) =>
                w
                    .evaluate((t) => window.__whatsNewClock?.set(t), ms)
                    .catch(() => {}),
            ),
    );
    await drawEveryWindow(app);
    await drawEveryWindow(app);
}

/**
 * Films `box` of `target` into `framesDir`: `film.frame()` steps the virtual clock 1/fps
 * seconds in every window, waits for them to draw, and saves a screenshot of the region.
 * `maxFrames` caps a clip (quick tests).
 */
// eslint-disable-next-line max-lines-per-function
export function makeFilm({ app, target, box, framesDir, fps, maxFrames }) {
    const step = 1000 / fps;
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
    const settle = () => drawEveryWindow(app);
    const film = {
        fps,
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
            const n = Math.round(seconds * fps);
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
            if (count >= maxFrames) return;
            if (wallMs !== null) {
                wallMs += step;
                await setClock(wallMs);
            }
            await settle();
            await settle();
            await beforeShot?.(count);
            fs.writeFileSync(
                path.join(framesDir, `${String(count).padStart(5, "0")}.png`),
                await capture(app, target, box),
            );
            count++;
        },
        /** `seconds` of frames, calling `each(i)` before each one. */
        async hold(seconds, each) {
            const n = Math.round(seconds * fps);
            for (let i = 0; i < n; i++)
                await film.frame(each ? () => each(i) : undefined);
        },
        /** The mouse glides from where it is to `b` over `seconds`, filmed. */
        async moveTo(page, from, b, seconds) {
            const n = Math.max(1, Math.round(seconds * fps));
            for (let i = 1; i <= n; i++) {
                // Eased, so the pointer starts and stops the way a hand does
                const t = i / n;
                const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
                await page.mouse.move(
                    from.x + (b.x - from.x) * e,
                    from.y + (b.y - from.y) * e,
                );
                if (count < maxFrames) await film.frame();
            }
        },
        /**
         * A mouse drag from `a` to `b` over `seconds`, one even step per frame. `button` is
         * "left" (default) or "right".
         */
        async drag(page, a, b, seconds, { button = "left" } = {}) {
            const n = Math.max(1, Math.round(seconds * fps));
            await page.mouse.move(a.x, a.y);
            await page.mouse.down({ button });
            for (let i = 1; i <= n; i++) {
                await page.mouse.move(
                    a.x + ((b.x - a.x) * i) / n,
                    a.y + ((b.y - a.y) * i) / n,
                );
                // A capped test still finishes the drag, so the clip's later steps work
                if (count < maxFrames) await film.frame();
            }
            await page.mouse.up({ button });
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
