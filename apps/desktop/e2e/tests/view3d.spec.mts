/* eslint-disable no-console */
/**
 * 3D View end to end (ADR 0002 Verification, docs/3d P4.3): open the window
 * from the editor; play, pause and seek in the editor and check the window's
 * show time follows within 50 ms; change the venue from the window, undo and
 * redo it in the editor, and check it persists after reopening the show; and
 * check the window makes no network requests.
 *
 * Headless CI may have no WebGL. The window then shows a fallback message
 * instead of the scene, so the sync and venue checks read the overlay's DOM
 * (the readout and the venue and lighting pickers), and the scene wrapper's
 * `data-kit` / `data-lighting` are checked only when WebGL is available.
 */
import { test } from "../fixtures.mjs";
import { expect, type Page } from "playwright/test";
import type { ElectronApplication } from "playwright";

/** The largest difference allowed between the window's and the editor's show time. */
const SYNC_TOLERANCE_MS = 50;
/** The editor's timeline clock, `MM:SS.mmm`. */
const EDITOR_CLOCK_PATTERN = /^\d{2}:\d{2}\.\d{3}$/;

/** Protocols that never leave the machine. */
const LOCAL_PROTOCOLS = [
    "file:",
    "devtools:",
    "data:",
    "blob:",
    "chrome:",
    "chrome-extension:",
    "about:",
];
const isLocalUrl = (url: string) =>
    LOCAL_PROTOCOLS.some((protocol) => url.startsWith(protocol));

/** `MM:SS.mmm` to milliseconds. */
function parseEditorClock(text: string): number {
    const [minutes, seconds] = text.split(":");
    return Math.round((Number(minutes) * 60 + Number(seconds)) * 1000);
}

interface EditorSample {
    showMs: number;
    wallMs: number;
}

/**
 * The editor's clock text and the wall time it was read at. Reads after the
 * clock's animation frame and React's render of it, so the text is at most a
 * few milliseconds old.
 */
async function sampleEditor(editor: Page): Promise<EditorSample> {
    const sample = await editor.evaluate(async (pattern) => {
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
        // React renders the clock's state update in a message task queued
        // during that frame; this one runs after it.
        await new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
        });
        const regex = new RegExp(pattern);
        const clock = [...document.querySelectorAll("span")].find((span) =>
            regex.test(span.textContent ?? ""),
        );
        return {
            text: clock?.textContent ?? null,
            wallMs: performance.timeOrigin + performance.now(),
        };
    }, EDITOR_CLOCK_PATTERN.source);
    if (!sample.text) throw new Error("The editor's timeline clock is missing");
    return { showMs: parseEditorClock(sample.text), wallMs: sample.wallMs };
}

/**
 * The window's show time and the wall time it was read at. The readout writes
 * `data-show-ms` in an animation frame callback registered before this one,
 * so in the same frame it is current.
 */
async function sampleWindow(view3d: Page): Promise<EditorSample> {
    return view3d.evaluate(async () => {
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
        const el = document.querySelector<HTMLElement>(
            '[data-testid="view3d-show-time"]',
        );
        return {
            showMs: Number(el?.dataset.showMs ?? NaN),
            wallMs: performance.timeOrigin + performance.now(),
        };
    });
}

interface EditorClock {
    playing: boolean;
    anchorShowMs: number;
    anchorWallMs: number;
}

/** What the spec records in main, kept on Electron's `app` object. */
interface MainRecorder {
    __view3dE2eClocks?: EditorClock[];
    __view3dE2eRequests?: { url: string; webContentsId?: number }[];
    __view3dE2eIds?: number[];
}

/**
 * Records every clock the editor publishes, as main receives it. Each one is
 * the editor's own playback position (`anchorShowMs`) at a wall time
 * (`anchorWallMs`), which makes it the reference for the window's show time.
 */
async function recordEditorClocks(app: ElectronApplication) {
    await app.evaluate((electron) => {
        const store = electron.app as unknown as MainRecorder;
        store.__view3dE2eClocks = [];
        electron.ipcMain.on("view3d:clock", (_event, clock: EditorClock) => {
            store.__view3dE2eClocks!.push(clock);
        });
    });
}

async function editorClocks(app: ElectronApplication): Promise<EditorClock[]> {
    return app.evaluate(
        (electron) =>
            (electron.app as unknown as MainRecorder).__view3dE2eClocks ?? [],
    );
}

/**
 * The editor's show time at `wallMs`, interpolated between the two playing
 * clocks the editor published around it (it re-sends one every second), or
 * null if `wallMs` isn't between two playing clocks.
 */
function editorShowMsAt(
    clocks: readonly EditorClock[],
    wallMs: number,
): number | null {
    for (let i = 0; i + 1 < clocks.length; i++) {
        const a = clocks[i];
        const b = clocks[i + 1];
        if (!a.playing || !b.playing) continue;
        if (a.anchorWallMs <= wallMs && wallMs < b.anchorWallMs) {
            const t =
                (wallMs - a.anchorWallMs) / (b.anchorWallMs - a.anchorWallMs);
            return a.anchorShowMs + t * (b.anchorShowMs - a.anchorShowMs);
        }
    }
    return null;
}

/** Paused: the window's show time equals the editor's clock. */
async function expectPausedInSync(editor: Page, view3d: Page) {
    await expect(view3d.getByTestId("view3d-sync-readout")).toHaveAttribute(
        "data-playing",
        "false",
    );
    await expect
        .poll(
            async () => {
                const [ed, win] = await Promise.all([
                    sampleEditor(editor),
                    sampleWindow(view3d),
                ]);
                // The editor's clock truncates to whole ms; the window rounds.
                return Math.abs(win.showMs - ed.showMs);
            },
            { message: "paused show time matches the editor's clock" },
        )
        .toBeLessThanOrEqual(1);
}

/** The window's readout shows `pageName` as the selected page. */
async function expectWindowPage(view3d: Page, pageName: string) {
    const readout = view3d.getByTestId("view3d-sync-readout");
    const selected = view3d.getByTestId("view3d-selected-page");
    await expect(selected).toHaveText(`Page ${pageName}`);
    const selectedId = await readout.getAttribute("data-selected-page-id");
    expect(selectedId).toBeTruthy();
    await expect(selected).toHaveAttribute("data-page-id", selectedId!);
}

/** Adds a page after the last one with the timeline's add button. */
async function addPage(editor: Page, expectedName: string) {
    await editor.locator("#pages").getByRole("button").click();
    await expect(editor.locator("#app")).toContainText(`Page ${expectedName}`, {
        timeout: 15_000,
    });
}

/** Selects a page by clicking its name in the timeline. */
async function selectPage(editor: Page, pageName: string) {
    await editor
        .locator("div")
        .filter({ hasText: new RegExp(`^${pageName}$`) })
        .first()
        .click();
    await expect(
        editor.getByRole("button", { name: `Page ${pageName}` }),
    ).toBeVisible();
}

/**
 * Records every request main sees, with the web contents that made it.
 * Installed before the window opens, so it covers the window's first load.
 */
async function recordRequests(app: ElectronApplication) {
    await app.evaluate((electron) => {
        const store = electron.app as unknown as MainRecorder;
        store.__view3dE2eRequests = [];
        electron.session.defaultSession.webRequest.onBeforeRequest(
            (details, callback) => {
                store.__view3dE2eRequests!.push({
                    url: details.url,
                    webContentsId: details.webContentsId,
                });
                callback({});
            },
        );
    });
}

/** Remembers the open 3D View window's web contents, so its requests count after it closes. */
async function rememberView3dWindow(app: ElectronApplication) {
    await app.evaluate((electron) => {
        const store = electron.app as unknown as MainRecorder;
        const ids = electron.BrowserWindow.getAllWindows()
            .filter((w) => w.webContents.getURL().includes("view=3d"))
            .map((w) => w.webContents.id);
        store.__view3dE2eIds = [...(store.__view3dE2eIds ?? []), ...ids];
    });
}

/** Requests main saw from the 3D View windows' web contents. */
async function view3dRequests(app: ElectronApplication): Promise<string[]> {
    return app.evaluate((electron) => {
        const store = electron.app as unknown as MainRecorder;
        const ids = new Set(store.__view3dE2eIds ?? []);
        return (store.__view3dE2eRequests ?? [])
            .filter((r) => r.webContentsId && ids.has(r.webContentsId))
            .map((r) => r.url);
    });
}

/** Opens the 3D View from the View toolbar tab and returns its page. */
async function openView3d(
    app: ElectronApplication,
    editor: Page,
    networkUrls: string[],
): Promise<Page> {
    await editor.getByRole("tab", { name: "View" }).click();
    const opened = app.waitForEvent("window");
    await editor.getByRole("button", { name: "Open 3D View" }).click();
    const view3d = await opened;
    view3d.on("request", (request) => {
        if (!isLocalUrl(request.url())) networkUrls.push(request.url());
    });
    await view3d.waitForLoadState();
    expect(view3d.url()).toContain("view=3d");
    await rememberView3dWindow(app);
    await expect(view3d.getByTestId("view3d-overlay")).toBeVisible({
        timeout: 20_000,
    });
    return view3d;
}

/** The active option's value in one of the overlay's segmented pickers. */
async function pickerValue(view3d: Page, testId: string) {
    const active = view3d.getByTestId(testId).locator('[data-state="on"]');
    await expect(active).toHaveCount(1);
    return active.getAttribute("data-value");
}

async function expectVenue(
    view3d: Page,
    kit: string,
    lighting: string,
    webgl: boolean,
) {
    const venue = view3d.getByTestId("view3d-venue-picker");
    const light = view3d.getByTestId("view3d-lighting-picker");
    await expect(venue.locator(`[data-value="${kit}"]`)).toHaveAttribute(
        "data-state",
        "on",
    );
    await expect(light.locator(`[data-value="${lighting}"]`)).toHaveAttribute(
        "data-state",
        "on",
    );
    if (webgl) {
        // The scene reports the kit and lighting it actually built.
        const scene = view3d.getByTestId("view3d-scene");
        await expect(scene).toHaveAttribute("data-kit", kit, {
            timeout: 20_000,
        });
        await expect(scene).toHaveAttribute("data-lighting", lighting);
    }
}

async function hasWebGl(view3d: Page): Promise<boolean> {
    return view3d.evaluate(() => {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    });
}

// eslint-disable-next-line max-lines-per-function
test("3D View follows the editor and saves the venue", async ({
    electronApp,
}, testInfo) => {
    test.setTimeout(240_000);
    const { app, page: editor, databasePath } = electronApp;
    const networkUrls: string[] = [];
    await recordRequests(app);
    await recordEditorClocks(app);

    // A show with several pages.
    await expect(editor.getByRole("button", { name: "Page 0" })).toBeVisible({
        timeout: 20_000,
    });
    for (const name of ["1", "2", "3"]) await addPage(editor, name);

    // Open the window from the editor.
    let view3d = await openView3d(app, editor, networkUrls);
    const webgl = await hasWebGl(view3d);
    console.log(`3D View WebGL: ${webgl ? "available" : "unavailable"}`);
    testInfo.annotations.push({
        type: "webgl",
        description: webgl ? "available" : "unavailable (fallback shown)",
    });
    if (!webgl) {
        await expect(
            view3d.getByText("3D View needs WebGL", { exact: false }),
        ).toBeVisible();
    }

    // Seek: selecting pages moves the window to that page's set, exactly.
    await selectPage(editor, "3");
    await expectWindowPage(view3d, "3");
    await expectPausedInSync(editor, view3d);
    await selectPage(editor, "1");
    await expectWindowPage(view3d, "1");
    await expectPausedInSync(editor, view3d);
    await editor.getByLabel("First page").click();
    await expectWindowPage(view3d, "0");
    await expectPausedInSync(editor, view3d);

    // Play: the window's clock runs with the editor's.
    await editor.getByTitle(/^Play or pause/).click();
    await expect(view3d.getByTestId("view3d-sync-readout")).toHaveAttribute(
        "data-playing",
        "true",
    );
    // Sample the window's show time for a few seconds of playback, and
    // compare each sample with the editor's playback position at the same
    // wall time, interpolated between the clocks the editor published around
    // it. The editor's on-screen clock isn't the reference while playing: it
    // re-renders through React and lagged its own audio position by up to
    // ~160 ms on a loaded headless box.
    const samples: EditorSample[] = [];
    for (let i = 0; i < 24; i++) {
        samples.push(await sampleWindow(view3d));
        await editor.waitForTimeout(150);
    }
    // The next heartbeat brackets the last samples.
    await editor.waitForTimeout(1200);
    const clocks = await editorClocks(app);
    const errors = samples.flatMap((sample) => {
        const expected = editorShowMsAt(clocks, sample.wallMs);
        return expected === null ? [] : [sample.showMs - expected];
    });
    const rounded = errors.map((e) => Math.round(e * 10) / 10);
    console.log("3D View sync error while playing (ms):", rounded.join(", "));
    testInfo.annotations.push({
        type: "sync error while playing (ms)",
        description: rounded.join(", "),
    });
    expect(errors.length).toBeGreaterThanOrEqual(15);
    for (const error of errors) {
        expect(Math.abs(error)).toBeLessThanOrEqual(SYNC_TOLERANCE_MS);
    }
    // The window's show time advanced with playback.
    expect(samples[samples.length - 1].showMs).toBeGreaterThan(
        samples[0].showMs + 2000,
    );

    // Pause: the window holds where the editor holds.
    await editor.getByTitle(/^Play or pause/).click();
    await expectPausedInSync(editor, view3d);

    // Seek again after playing.
    await selectPage(editor, "2");
    await expectWindowPage(view3d, "2");
    await expectPausedInSync(editor, view3d);

    // Venue and lighting from the window's overlay.
    const initialKit = (await pickerValue(view3d, "view3d-venue-picker"))!;
    const initialLighting = (await pickerValue(
        view3d,
        "view3d-lighting-picker",
    ))!;
    await expectVenue(view3d, initialKit, initialLighting, webgl);

    const kit = initialKit === "college" ? "bighs" : "college";
    await view3d
        .getByTestId("view3d-venue-picker")
        .locator(`[data-value="${kit}"]`)
        .click();
    await expect(
        view3d
            .getByTestId("view3d-venue-picker")
            .locator(`[data-value="${kit}"]`),
    ).toHaveAttribute("data-state", "on");
    const kitLighting = (await pickerValue(view3d, "view3d-lighting-picker"))!;
    // college and bighs both offer day, dusk and night.
    const lighting = kitLighting === "dusk" ? "night" : "dusk";
    await view3d
        .getByTestId("view3d-lighting-picker")
        .locator(`[data-value="${lighting}"]`)
        .click();
    await expectVenue(view3d, kit, lighting, webgl);

    // Undo in the editor reverts each change; redo puts it back.
    await editor.getByRole("tab", { name: "File" }).click();
    const undo = editor.getByRole("button", { name: "Undo", exact: true });
    const redo = editor.getByRole("button", { name: "Redo", exact: true });
    await undo.click();
    await expectVenue(view3d, kit, kitLighting, webgl);
    await undo.click();
    await expectVenue(view3d, initialKit, initialLighting, webgl);
    await redo.click();
    await expectVenue(view3d, kit, kitLighting, webgl);
    await redo.click();
    await expectVenue(view3d, kit, lighting, webgl);

    // Close the show (which closes the window) and reopen both.
    const closed = view3d.waitForEvent("close");
    await editor.getByRole("button", { name: "Exit File" }).click();
    await closed;
    await expect(editor.getByText("Recent Files")).toBeVisible({
        timeout: 20_000,
    });
    // What the launch page's recent-file card does.
    const code = await editor.evaluate(
        (path) =>
            (
                window as unknown as {
                    electron: {
                        openRecentFile: (p: string) => Promise<number>;
                    };
                }
            ).electron.openRecentFile(path),
        databasePath,
    );
    expect(code).toBe(200);
    await expect(
        editor.getByRole("button", { name: /^Page \d/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    view3d = await openView3d(app, editor, networkUrls);
    await expectVenue(view3d, kit, lighting, webgl);
    // The reopened window picks up the editor's selection.
    const selectedName = (
        await editor
            .getByRole("button", { name: /^Page \d/ })
            .first()
            .textContent()
    )
        ?.replace(/^Page /, "")
        .trim();
    expect(selectedName).toBeTruthy();
    await expectWindowPage(view3d, selectedName!);
    await expectPausedInSync(editor, view3d);

    // No network requests from the window, by Playwright or by main.
    const mainSeen = await view3dRequests(app);
    // The window did load its files through main, so the recorder works.
    expect(mainSeen.some((url) => url.startsWith("file:"))).toBe(true);
    const mainNetwork = mainSeen.filter((url) => !isLocalUrl(url));
    expect(networkUrls, "window requests seen by Playwright").toEqual([]);
    expect(mainNetwork, "window requests seen by main").toEqual([]);
});
