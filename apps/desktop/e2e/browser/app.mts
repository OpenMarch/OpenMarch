import { expect, type CDPSession, type Page } from "@playwright/test";
import type { Show } from "./fixtures.mjs";
import { savedPositions } from "./positions.mjs";
import type { FieldTestLook } from "../../src/field/fieldTestApi";

/** Steps a user takes in the app, shared between specs. */

export type DrawnMarcher = {
    id: number;
    drillNumber: string;
    /** Where the dot is drawn, in field units (as the timeline stores them). */
    x: number;
    y: number;
    /** The dot's position in the viewport, for mouse actions. */
    screen: { x: number; y: number };
    /** False when the dot is scrolled out of the visible field. */
    onScreen: boolean;
    /** How it's drawn: shape, colors, and whether it and its label show. */
    look: FieldTestLook;
    /** Drawn dimmed, outside the isolated move; it can't be selected. */
    dimmed: boolean;
    /**
     * Drawn Not defined (a dashed edge): nothing decides its position on the count shown, no move
     * it's walking or arriving in, no Held hold, no carried shape (#478).
     */
    notDefined: boolean;
    /** Its label is drawn bold: a coordinate of its own is set on the count shown (#478). */
    labelBold: boolean;
};

// Helpers read the field only through the field test API
// (`window.fieldTest`, `src/field/fieldTestApi.ts`), so the scenarios run
// against any field renderer.

/** Waits until the field shows a page and its test API is installed. */
export const waitForField = (page: Page) =>
    page.waitForFunction(() => window.fieldTest?.pageId() != null);

/**
 * Waits until the field holds still on screen: its view, and where its
 * element sits. As a show opens, the field centers its view again once the
 * panels around it have settled (250 ms after it's ready, later on a slow
 * start), so a scenario that reads the zoom or where a marcher is drawn
 * before then works from the wrong view.
 */
export async function waitForSettledField(page: Page) {
    const read = () =>
        page.evaluate(() => {
            const box = document
                .querySelector('[data-testid="fieldCanvas"]')
                ?.getBoundingClientRect();
            let view: unknown = null;
            try {
                view = window.fieldTest?.viewport() ?? null;
            } catch {
                // No field drawn (no WebGL): only the element can move
            }
            return JSON.stringify([
                view,
                box ? [box.x, box.y, box.width, box.height] : null,
            ]);
        });
    let last = await read();
    let still = 0;
    // The same three reads in a row, 150 ms apart: past the 250 ms settle. A
    // big show opens slowly (as the fixture's other waits allow for)
    await expect
        .poll(
            async () => {
                await page.waitForTimeout(150);
                const now = await read();
                still = now === last ? still + 1 : 0;
                last = now;
                return still >= 3;
            },
            { intervals: [0], timeout: 20_000 },
        )
        .toBe(true);
}

/** Reads the marchers drawn on the field. */
export const drawnMarchers = (page: Page): Promise<DrawnMarcher[]> =>
    page.evaluate(() =>
        window.fieldTest!.marchers().map(({ label, ...marcher }) => ({
            ...marcher,
            drillNumber: label,
        })),
    );

/** Screen pixels per field unit at the field's current zoom. */
export const canvasScale = (page: Page): Promise<number> =>
    page.evaluate(() => window.fieldTest!.viewport().zoom);

/** The field's selection, view, handles and gesture in progress, as the field test API reads them. */
export const readField = (page: Page) =>
    page.evaluate(() => {
        const field = window.fieldTest!;
        return {
            selection: field.selection(),
            viewport: field.viewport(),
            handles: field.handles(),
            activeGesture: field.activeGesture(),
        };
    });

/** Adds marchers through the sidebar form, then closes the sidebar. */
export async function createMarchers(
    page: Page,
    { quantity, section }: { quantity: number; section: string },
) {
    const before = (await drawnMarchers(page)).length;

    await page.locator("#sidebar-launcher-marchers").click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const form = page.locator("#marcherForm");
    await form.getByRole("combobox").click();
    await page.getByRole("option", { name: section, exact: true }).click();
    await form
        .getByRole("spinbutton", { name: "Quantity" })
        .fill(`${quantity}`);
    await page.getByTestId("create-marcher-button").click();
    await page.locator("#sidebar-launcher-marchers").click();

    await expect
        .poll(async () => (await drawnMarchers(page)).length)
        .toBe(before + quantity);
}

/**
 * Waits until every marcher is drawn where the show file says it is at the
 * end of the selected page (`savedPositions`). Call it after any step that
 * changes positions or the page.
 */
export async function expectCanvasMatchesShow(show: Show) {
    const round = (value: number) => Math.round(value * 100) / 100;
    await expect
        .poll(async () => {
            const pageId = await show.page.evaluate(() =>
                window.fieldTest!.pageId(),
            );
            const saved = (await savedPositions(show, pageId)).map(
                ({ id, x, y }) => ({ id, x: round(x), y: round(y) }),
            );
            const drawn = (await drawnMarchers(show.page))
                .map(({ id, x, y }) => ({ id, x: round(x), y: round(y) }))
                .sort((a, b) => a.id - b.id);
            // On a mismatch the failure shows both sides.
            return JSON.stringify(drawn) === JSON.stringify(saved)
                ? "canvas matches the show file"
                : { pageId, drawn, saved };
        })
        .toBe("canvas matches the show file");
}

/** Clicks a marcher's dot; with `add`, adds it to the selection (Shift+click). */
export async function clickMarcher(
    page: Page,
    drillNumber: string,
    { add = false }: { add?: boolean } = {},
) {
    const marcher = (await drawnMarchers(page)).find(
        (drawn) => drawn.drillNumber === drillNumber,
    );
    if (!marcher?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    if (add) await page.keyboard.down("Shift");
    await page.mouse.click(marcher.screen.x, marcher.screen.y);
    if (add) await page.keyboard.up("Shift");
}

/** The drill numbers of the marchers selected on the field. */
export const selectedDrillNumbers = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
        const field = window.fieldTest!;
        const selected = new Set(field.selection());
        return field
            .marchers()
            .filter((marcher) => selected.has(marcher.id))
            .map((marcher) => marcher.label)
            .sort();
    });

/** Opens a marcher's row menu in the Marchers sidebar and picks an item. */
export async function marcherRowAction(
    page: Page,
    drillNumber: string,
    item: "Edit" | "Delete",
) {
    const sidebar = page.locator("#marcherListForm");
    if (!(await sidebar.isVisible()))
        await page.locator("#sidebar-launcher-marchers").click();
    // The row's menu button has no accessible name; it's the row's only button.
    await sidebar
        .getByText(drillNumber, { exact: true })
        .locator("xpath=../..")
        .getByRole("button")
        .click();
    await page.getByRole("button", { name: item, exact: true }).click();
}

/**
 * Waits until the app has made no database calls for `quietMs`, i.e. every
 * write a step started has finished. Lets a test act at a person's pace
 * instead of pressing the next key mid-write.
 */
export async function waitForIdle(page: Page, quietMs = 250) {
    await page.evaluate(() => {
        const w = window as any;
        if (w.__omIdle) return;
        const state = { inFlight: 0, last: performance.now() };
        w.__omIdle = state;
        for (const name of ["sqlProxy", "unsafeSqlProxy", "sqlReadBatch"]) {
            const original = w.electron[name];
            w.electron[name] = async (...args: unknown[]) => {
                state.inFlight++;
                try {
                    return await original(...args);
                } finally {
                    state.inFlight--;
                    state.last = performance.now();
                }
            };
        }
    });
    await page.waitForFunction(
        (quiet) => {
            const state = (window as any).__omIdle;
            return (
                state.inFlight === 0 && performance.now() - state.last > quiet
            );
        },
        quietMs,
        { polling: 50 },
    );
}

/**
 * Adds a page flag at the start of a measure: moves the playhead there with
 * the timeline's Go to field, then picks **Create page at playhead** from the playhead's
 * right-click menu. The new page runs from that beat to the next flag (or the
 * show's last page counts).
 */
export async function addPageAt(page: Page, measure: number) {
    await goTo(page, `m${measure}`);
    await page.getByTestId("timeline-playhead").click({ button: "right" });
    await page.getByTestId("timeline-add-page").click();
}

/** Moves the playhead with the timeline's Go to field ("m6" is measure 6). */
export async function goTo(page: Page, where: string) {
    await page.getByTestId("timeline-readout").click();
    const field = page.getByRole("textbox", {
        name: "Go to a page, measure or rehearsal mark",
    });
    await field.fill(where);
    await field.press("Enter");
}

/**
 * Selects a page's box on the timeline ("Page 1"): the edit window is that
 * page's move, so drops and actions edit it.
 */
export async function selectPage(show: Show, pageName: string) {
    // The timeline's box, not an inspector section of the same name
    await show.page
        .getByRole("button", { name: pageName, exact: true })
        .and(show.page.locator("[data-timeline-range-page]"))
        .click();
    await expect(
        show.page.getByRole("heading", { name: pageName }),
    ).toBeVisible();
    await expectCanvasMatchesShow(show);
}

/**
 * Presses at a point in the viewport, drags by `by` screen pixels in `steps`
 * moves, and releases; `beforeRelease` runs with the button still down.
 */
export async function dragFrom(
    page: Page,
    from: { x: number; y: number },
    by: { x: number; y: number },
    {
        steps = 10,
        beforeRelease,
    }: { steps?: number; beforeRelease?: () => Promise<unknown> } = {},
) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + by.x, from.y + by.y, { steps });
    await beforeRelease?.();
    await page.mouse.up();
}

/** Drags a marcher's dot by `by` screen pixels (see `dragFrom`). */
export async function dragMarcher(
    page: Page,
    drillNumber: string,
    by: { x: number; y: number },
    options?: Parameters<typeof dragFrom>[3],
) {
    const marcher = (await drawnMarchers(page)).find(
        (drawn) => drawn.drillNumber === drillNumber,
    );
    if (!marcher?.onScreen)
        throw new Error(`${drillNumber} is not visible on the field`);
    await dragFrom(page, marcher.screen, by, options);
}

/**
 * The cursor the field shows at a point in the viewport, as the browser reads
 * it. The one field reading outside the field test API: it's what the user
 * sees in the page, the same on any renderer, not a renderer internal.
 */
export const fieldCursorAt = (page: Page, at: { x: number; y: number }) =>
    page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element ? getComputedStyle(element).cursor : null;
    }, at);

/**
 * The drill numbers of the marchers the inspector shows as selected, sorted:
 * "Marcher T2" for one, "2 Marchers" and their list for several.
 */
export async function inspectorMarchers(page: Page): Promise<string[]> {
    const single = page.getByText(/^Marcher \S+$/);
    if (await single.isVisible())
        return [(await single.innerText()).replace(/^Marcher /, "")];
    const several = page.getByText(/^\d+ Marchers$/);
    if (!(await several.isVisible())) return [];
    // The list of drill numbers under the heading
    const list = await page
        .locator("p.font-mono")
        .filter({ hasText: /^[^,]+(, [^,]+)+$/ })
        .first()
        .innerText();
    return list.split(", ").sort();
}

/**
 * Changes UI settings (localStorage), then reloads so the app reads them. The
 * app can save its settings while it starts, over the change: until the
 * reloaded app has them, it writes them again.
 */
export async function setUiSettings(
    page: Page,
    settings: Record<string, unknown>,
) {
    const write = () =>
        page.evaluate((settings) => {
            const key = "openmarch:uiSettings";
            const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
            localStorage.setItem(
                key,
                JSON.stringify({ ...stored, ...settings }),
            );
        }, settings);
    const applied = () =>
        page.evaluate((settings) => {
            const stored = JSON.parse(
                localStorage.getItem("openmarch:uiSettings") ?? "{}",
            );
            return Object.entries(settings).every(
                ([key, value]) =>
                    JSON.stringify(stored[key]) === JSON.stringify(value),
            );
        }, settings);
    await expect
        .poll(
            async () => {
                await write();
                await page.reload();
                await waitForField(page);
                // Long enough for the app's start-up saves
                await page.waitForTimeout(500);
                return applied();
            },
            { intervals: [0], timeout: 30_000 },
        )
        .toBe(true);
    // As after the fixture's own load: the field centers its view again once it has settled
    await waitForSettledField(page);
}

/**
 * Opens the Settings window from the File tab, as a user does, and shows
 * `section`. In the browser target the window is a second page of the same
 * context (`fixtures.mts`); in Electron it's the app's own window.
 */
export async function openSettings(page: Page, section: string) {
    await page.getByRole("tab", { name: "File" }).click();
    const [settings] = await Promise.all([
        page.context().waitForEvent("page"),
        page.getByRole("button", { name: "App Settings" }).click(),
    ]);
    await settings.waitForLoadState("domcontentloaded");
    await settings
        .getByRole("navigation")
        .getByRole("button", { name: section, exact: true })
        .click();
    await expect(
        settings.getByRole("heading", { name: section, level: 1 }),
    ).toBeVisible();
    return settings;
}

// Touch and pen, sent through Chromium's own input (CDP), so the app gets the
// same pointer and touch events a tablet sends: `pointerType` "touch" or
// "pen", one pointer per finger, real contact sizes. Points are in viewport
// pixels. See docs/conventions/tablet-parity.md, section 5.

type Point = { x: number; y: number };

/**
 * How wide a fingertip touches, in CSS pixels. Real iPads report fingertips
 * 40–50 px wide in Safari, so the app can't tell a finger from a palm by its
 * size (docs/tablet-layout.md); the helpers press like a real finger.
 */
export const FINGERTIP_WIDTH = 48;

/** Runs `send` with a CDP session on the page, and detaches it after. */
async function withCdp<T>(
    page: Page,
    send: (cdp: CDPSession) => Promise<T>,
): Promise<T> {
    const cdp = await page.context().newCDPSession(page);
    try {
        return await send(cdp);
    } finally {
        await cdp.detach();
    }
}

/** The points `steps` moves along the way from `from` to `to`, `to` last. */
const along = (from: Point, to: Point, steps: number): Point[] =>
    Array.from({ length: steps }, (_, i) => ({
        x: from.x + ((to.x - from.x) * (i + 1)) / steps,
        y: from.y + ((to.y - from.y) * (i + 1)) / steps,
    }));

/**
 * Touches the screen with fingers: each step is where the fingers are, in
 * viewport pixels, finger `i` the same finger in every step. The first step
 * puts them down, each later one moves them, and then they all lift.
 * `holdMs` waits with the fingers down before they lift (a long press).
 */
export async function touchGesture(
    page: Page,
    steps: Point[][],
    { holdMs = 0 }: { holdMs?: number } = {},
) {
    if (steps.length === 0) throw new Error("A touch needs at least one step");
    await withCdp(page, async (cdp) => {
        const send = (
            type: "touchStart" | "touchMove" | "touchEnd",
            points: Point[],
        ) =>
            cdp.send("Input.dispatchTouchEvent", {
                type,
                touchPoints: points.map((p, id) => ({
                    x: p.x,
                    y: p.y,
                    radiusX: FINGERTIP_WIDTH / 2,
                    radiusY: FINGERTIP_WIDTH / 2,
                    force: 1,
                    id,
                })),
            });
        await send("touchStart", steps[0]);
        for (const points of steps.slice(1)) await send("touchMove", points);
        if (holdMs > 0) await page.waitForTimeout(holdMs);
        await send("touchEnd", []);
    });
}

/** Taps one finger at a point. */
export const tap = (page: Page, at: Point) => touchGesture(page, [[at]]);

/**
 * Taps two or more fingers at once (a two-finger tap undoes on iPad; three
 * fingers redo), at `at` and spread `spacing` px apart across.
 */
export function multiFingerTap(
    page: Page,
    at: Point,
    fingers: 2 | 3,
    { spacing = 60 }: { spacing?: number } = {},
) {
    const first = at.x - (spacing * (fingers - 1)) / 2;
    return touchGesture(page, [
        Array.from({ length: fingers }, (_, i) => ({
            x: first + i * spacing,
            y: at.y,
        })),
    ]);
}

/** Presses one finger at a point and holds it still for `ms` before lifting it. */
export const longPress = (
    page: Page,
    at: Point,
    { ms = 700 }: { ms?: number } = {},
) => touchGesture(page, [[at]], { holdMs: ms });

/** Drags one finger from `from` to `to` in `steps` moves. */
export const touchDrag = (
    page: Page,
    from: Point,
    to: Point,
    { steps = 10 }: { steps?: number } = {},
) => touchGesture(page, [[from], ...along(from, to, steps).map((p) => [p])]);

/**
 * Two fingers, `spread` px either side of a point across, move together by
 * `by` in `steps` moves.
 */
export function twoFingerPan(
    page: Page,
    at: Point,
    by: Point,
    { steps = 10, spread = 50 }: { steps?: number; spread?: number } = {},
) {
    const fingers = (p: Point) => [
        { x: p.x - spread, y: p.y },
        { x: p.x + spread, y: p.y },
    ];
    const to = { x: at.x + by.x, y: at.y + by.y };
    return touchGesture(page, [
        fingers(at),
        ...along(at, to, steps).map(fingers),
    ]);
}

/**
 * Two fingers either side of a point across, `from` px from it, spread or
 * close to `to` px from it in `steps` moves: apart zooms in, together out.
 */
export function pinch(
    page: Page,
    at: Point,
    { from, to, steps = 10 }: { from: number; to: number; steps?: number },
) {
    const fingers = (spread: number) => [
        { x: at.x - spread, y: at.y },
        { x: at.x + spread, y: at.y },
    ];
    return touchGesture(
        page,
        Array.from({ length: steps + 1 }, (_, i) =>
            fingers(from + ((to - from) * i) / steps),
        ),
    );
}

/** Drags a pen (an Apple Pencil) from `from` to `to` in `steps` moves. */
export async function penDrag(
    page: Page,
    from: Point,
    to: Point,
    { steps = 12 }: { steps?: number } = {},
) {
    await withCdp(page, async (cdp) => {
        const send = (
            type: "mousePressed" | "mouseMoved" | "mouseReleased",
            p: Point,
        ) =>
            cdp.send("Input.dispatchMouseEvent", {
                type,
                x: p.x,
                y: p.y,
                button: "left",
                buttons: type === "mouseReleased" ? 0 : 1,
                clickCount: type === "mouseMoved" ? 0 : 1,
                pointerType: "pen",
            });
        await send("mouseMoved", from);
        await send("mousePressed", from);
        for (const p of along(from, to, steps)) await send("mouseMoved", p);
        await send("mouseReleased", to);
    });
}

/**
 * Presses a pen (an Apple Pencil) at `at`, holds it for `ms`, moving to each
 * of `wander` in turn first, and lifts it where it ended.
 */
export async function penHold(
    page: Page,
    at: Point,
    { ms = 700, wander = [] }: { ms?: number; wander?: Point[] } = {},
) {
    await withCdp(page, async (cdp) => {
        const send = (
            type: "mousePressed" | "mouseMoved" | "mouseReleased",
            p: Point,
        ) =>
            cdp.send("Input.dispatchMouseEvent", {
                type,
                x: p.x,
                y: p.y,
                button: "left",
                buttons: type === "mouseReleased" ? 0 : 1,
                clickCount: type === "mouseMoved" ? 0 : 1,
                pointerType: "pen",
            });
        await send("mouseMoved", at);
        await send("mousePressed", at);
        for (const p of wander) await send("mouseMoved", p);
        await page.waitForTimeout(ms);
        await send("mouseReleased", wander.at(-1) ?? at);
    });
}

/**
 * Makes the page a touch screen until the returned stop is called: it reports
 * touch points and matches `(hover: none)` and `(pointer: coarse)`, so the
 * app's "auto" input mode lays itself out for touch. For a whole run, use the
 * `touchScreen` fixture option (the `browser-touch` project) instead. After stop,
 * `(hover: none)` stays for the rest of the page (Chromium); the coarse pointer goes.
 */
export async function emulateTouchScreen(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
    });
    // Turn it off before letting go: detaching alone leaves the touch screen on.
    // Chromium still reports `(hover: none)` until the page closes; only the coarse
    // pointer and touch events go away.
    return async () => {
        await cdp.send("Emulation.setTouchEmulationEnabled", {
            enabled: false,
        });
        await cdp.detach();
    };
}
