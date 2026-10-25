// cspell:words menuitemradio
import type { CDPSession, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    createMarchers,
    drawnMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    clickMarcher,
    waitForIdle,
} from "../app.mjs";

/** Half a real fingertip's width as Safari on an iPad reports it (CSS px) */
const FINGER_RADIUS = 24;

/** Fingers on the page through Chromium's touch input (real pointer events) */
async function touchScreen(page: Page) {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
    });
    // A touch screen lays the app out for fingers, which resizes the field:
    // let that settle before reading where marchers are
    await page
        .waitForFunction(
            () => document.documentElement.dataset.input === "touch",
            null,
            { timeout: 3000 },
        )
        .catch(() => {});
    await page.waitForTimeout(400);
    // New marchers line up along the field's top-left edge, where panels can
    // cover them: put them in the middle of the view, at the same zoom
    await page.evaluate(() => {
        const canvas = window.canvas as any;
        const marchers = canvas.getCanvasMarchers();
        if (marchers.length === 0) return;
        const xs = marchers.map((m: any) => m.getCenterPoint().x);
        const ys = marchers.map((m: any) => m.getCenterPoint().y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const zoom = canvas.getZoom();
        canvas.setViewportTransform([
            zoom,
            0,
            0,
            zoom,
            canvas.getWidth() / 2 - cx * zoom,
            canvas.getHeight() / 2 - cy * zoom,
        ]);
        canvas.requestRenderAll();
    });
    type Point = { x: number; y: number };
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            // A real iPad reports a fingertip about 48 px wide
            touchPoints: points.map((p, id) => ({
                x: p.x,
                y: p.y,
                id,
                radiusX: FINGER_RADIUS,
                radiusY: FINGER_RADIUS,
            })),
        });
    return {
        /** One finger down and up; `holdMs` keeps it down (a long press) */
        async tap(at: Point, holdMs = 0) {
            await send("touchStart", [at]);
            if (holdMs > 0) await page.waitForTimeout(holdMs);
            await send("touchEnd", []);
        },
        /** Press and hold still (a long press), then drag */
        async holdDrag(from: Point, to: Point, holdMs = 700) {
            await send("touchStart", [from]);
            await page.waitForTimeout(holdMs);
            const steps = 12;
            for (let i = 1; i <= steps; i++) {
                await send("touchMove", [
                    {
                        x: from.x + ((to.x - from.x) * i) / steps,
                        y: from.y + ((to.y - from.y) * i) / steps,
                    },
                ]);
            }
            await send("touchEnd", []);
        },
        /** A careful drag: creeps for `creepMs` (under the long-press slop), then slides */
        async slowDrag(from: Point, to: Point, creepMs = 800) {
            await send("touchStart", [from]);
            const t0 = Date.now();
            let creep = 0;
            while (Date.now() - t0 < creepMs) {
                creep = Math.min(4, creep + 0.25);
                await send("touchMove", [{ x: from.x, y: from.y + creep }]);
                await page.waitForTimeout(25);
            }
            const start = { x: from.x, y: from.y + creep };
            const steps = 40;
            for (let i = 1; i <= steps; i++) {
                await send("touchMove", [
                    {
                        x: start.x + ((to.x - start.x) * i) / steps,
                        y: start.y + ((to.y - start.y) * i) / steps,
                    },
                ]);
                await page.waitForTimeout(10);
            }
            await send("touchEnd", []);
        },
        /** Two fingers down and up together */
        async twoFingerTap(a: Point, b: Point) {
            await send("touchStart", [a]);
            await send("touchStart", [a, b]);
            await send("touchEnd", []);
        },
        /** One finger from `from` to `to` in steps */
        async drag(from: Point, to: Point, steps = 12) {
            await send("touchStart", [from]);
            for (let i = 1; i <= steps; i++) {
                await send("touchMove", [
                    {
                        x: from.x + ((to.x - from.x) * i) / steps,
                        y: from.y + ((to.y - from.y) * i) / steps,
                    },
                ]);
            }
            await send("touchEnd", []);
        },
        /** Two fingers spreading apart around a centre */
        async pinch(center: Point, fromGap: number, toGap: number, steps = 12) {
            const at = (gap: number): Point[] => [
                { x: center.x - gap / 2, y: center.y },
                { x: center.x + gap / 2, y: center.y },
            ];
            await send("touchStart", [at(fromGap)[0]]);
            await send("touchStart", at(fromGap));
            for (let i = 1; i <= steps; i++) {
                await send(
                    "touchMove",
                    at(fromGap + ((toGap - fromGap) * i) / steps),
                );
            }
            await send("touchEnd", []);
        },
    };
}

/** Whether a finger at this point lands on the field itself, not a panel or button over it */
const onField = (page: Page, p: { x: number; y: number }) =>
    page.evaluate(
        ({ x, y }) =>
            document.elementFromPoint(x, y) ===
            (window.canvas as any).upperCanvasEl,
        p,
    );

/**
 * Like drawnMarchers, but also right for marchers inside a multi-selection,
 * whose positions Fabric keeps relative to the selection.
 */
const drawnOnScreen = async (page: Page) => {
    const drawn = await drawnMarchers(page);
    const screens = await page.evaluate(() => {
        const canvas = window.canvas as any;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        const vpt = canvas.viewportTransform;
        const cssScale = rect.width / canvas.width;
        return canvas.getCanvasMarchers().map((marcher: any) => {
            let p = marcher.getCenterPoint();
            if (marcher.group) {
                const m = marcher.group.calcTransformMatrix();
                p = {
                    x: m[0] * p.x + m[2] * p.y + m[4],
                    y: m[1] * p.x + m[3] * p.y + m[5],
                };
            }
            const screen = {
                x: rect.x + (p.x * vpt[0] + vpt[4]) * cssScale,
                y: rect.y + (p.y * vpt[3] + vpt[5]) * cssScale,
            };
            return {
                id: marcher.marcherObj.id,
                screen,
                onScreen:
                    screen.x > rect.left &&
                    screen.x < rect.right &&
                    screen.y > rect.top &&
                    screen.y < rect.bottom,
            };
        });
    });
    return drawn.map((d) => {
        const s = screens.find((x: { id: number }) => x.id === d.id);
        return s ? { ...d, screen: s.screen, onScreen: s.onScreen } : d;
    });
};

/**
 * Marchers a finger can reach: drawn inside the canvas and not covered by a
 * panel (which marchers those are depends on the window and the layout).
 */
async function touchableMarchers(page: Page) {
    const all = await drawnOnScreen(page);
    const out = [];
    for (const m of all)
        if (m.onScreen && (await onField(page, m.screen))) out.push(m);
    return out;
}

/** Two points 100 px apart on empty field, clear of marchers and anything over the canvas */
async function emptyFieldPair(page: Page) {
    const rect = await page.evaluate(() => {
        const r = (window.canvas as any).upperCanvasEl.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const marchers = await drawnMarchers(page);
    const clear = (p: { x: number; y: number }) =>
        marchers.every(
            (m) => Math.hypot(m.screen.x - p.x, m.screen.y - p.y) > 60,
        );
    for (const fy of [0.85, 0.7, 0.55, 0.4, 0.25])
        for (const fx of [0.3, 0.45, 0.15, 0.6]) {
            const a = {
                x: rect.left + rect.width * fx,
                y: rect.top + rect.height * fy,
            };
            const b = { x: a.x + 100, y: a.y };
            if (
                clear(a) &&
                clear(b) &&
                (await onField(page, a)) &&
                (await onField(page, b))
            )
                return [a, b] as const;
        }
    throw new Error("No empty field to tap on");
}

/** A finger tap on the middle of an element */
async function tapElement(
    fingers: { tap: (p: { x: number; y: number }) => Promise<void> },
    locator: import("@playwright/test").Locator,
) {
    // The pill can still be settling into its spot: wait until it stays put
    let box = (await locator.boundingBox())!;
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const again = (await locator.boundingBox())!;
        if (again.x === box.x && again.y === box.y) break;
        box = again;
    }
    await fingers.tap({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const viewport = (page: Page) =>
    page.evaluate(() => [...(window.canvas as any).viewportTransform]);

const savedPositions = (show: Show) =>
    show.query<{ marcher_id: number; x: number; y: number }>(
        "SELECT marcher_id, x, y FROM marcher_pages ORDER BY marcher_id",
    );

test("one finger drags a marcher without moving the view", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [marcher] = await touchableMarchers(page);
    if (!marcher) throw new Error("No marcher is visible on the canvas");
    const before = (await savedPositions(show)).find(
        (p) => p.marcher_id === marcher.id,
    )!;
    const viewBefore = await viewport(page);
    const scale = await canvasScale(page);

    const by = { x: 160, y: 90 };
    await fingers.drag(marcher.screen, {
        x: marcher.screen.x + by.x,
        y: marcher.screen.y + by.y,
    });

    await expect
        .poll(async () => {
            const now = (await savedPositions(show)).find(
                (p) => p.marcher_id === marcher.id,
            )!;
            return Math.abs(now.x - (before.x + by.x / scale));
        })
        .toBeLessThan(1);
    const after = (await savedPositions(show)).find(
        (p) => p.marcher_id === marcher.id,
    )!;
    expect(Math.abs(after.y - (before.y + by.y / scale))).toBeLessThan(1);
    expect(await viewport(page)).toEqual(viewBefore);
    await expectCanvasMatchesShow(show);
});

test("two fingers zoom the view and move no marcher", async ({ show }) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    await waitForIdle(page);
    const positionsBefore = await savedPositions(show);
    const zoomBefore = (await viewport(page))[0];

    // Start the pinch on a marcher, so the first finger would drag it
    const [marcher] = await touchableMarchers(page);
    await fingers.pinch(
        { x: marcher.screen.x + 50, y: marcher.screen.y },
        100,
        220,
    );

    await expect
        .poll(async () => (await viewport(page))[0] / zoomBefore)
        .toBeGreaterThan(1.8);
    await waitForIdle(page);
    expect(await savedPositions(show)).toEqual(positionsBefore);
    await expectCanvasMatchesShow(show);
});

test("a long press adds a marcher to the selection and a two-finger tap undoes", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [first, second] = await touchableMarchers(page);

    // A tap selects one marcher; a long press on another adds it
    await fingers.tap(first.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([first.drillNumber]);
    // The first touch switches the layout to touch mode, which can move the
    // field on screen: find the second marcher again
    await waitForIdle(page);
    const drawnNow = await drawnMarchers(page);
    const secondNow = drawnNow.find(
        (m) => m.drillNumber === second.drillNumber,
    )!;
    const firstNow = drawnNow.find((m) => m.drillNumber === first.drillNumber)!;
    await fingers.tap(secondNow.screen, 700);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([first.drillNumber, second.drillNumber].sort());
    // A tap on empty field clears it
    const [empty, empty2] = await emptyFieldPair(page);
    await fingers.tap(empty);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual([]);

    // Drag, then undo it with two fingers
    await waitForIdle(page);
    const before = await savedPositions(show);
    await fingers.drag(firstNow.screen, {
        x: firstNow.screen.x + 120,
        y: firstNow.screen.y + 60,
    });
    await expect.poll(() => savedPositions(show)).not.toEqual(before);
    await waitForIdle(page);
    await fingers.twoFingerTap(empty, empty2);
    await expect.poll(() => savedPositions(show)).toEqual(before);
    await expectCanvasMatchesShow(show);
});

test("a slow, careful drag of a selected marcher moves it and keeps it selected", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    let [marcher] = await touchableMarchers(page);
    await fingers.tap(marcher.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([marcher.drillNumber]);
    await waitForIdle(page);
    marcher = (await drawnMarchers(page)).find(
        (m) => m.drillNumber === marcher.drillNumber,
    )!;
    const before = (await savedPositions(show)).find(
        (p) => p.marcher_id === marcher.id,
    )!;
    const scale = await canvasScale(page);
    const by = { x: 0, y: 90 };

    await fingers.slowDrag(marcher.screen, {
        x: marcher.screen.x + by.x,
        y: marcher.screen.y + by.y,
    });

    await expect
        .poll(async () => {
            const now = (await savedPositions(show)).find(
                (p) => p.marcher_id === marcher.id,
            )!;
            return Math.abs(now.y - (before.y + by.y / scale));
        })
        .toBeLessThan(1.5);
    expect(await selectedDrillNumbers(page)).toEqual([marcher.drillNumber]);
});

test("a multi-selection's box follows its marchers after undo, and a tap inside it picks one marcher", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const visible = () => touchableMarchers(page);
    const [a] = await visible();
    await fingers.tap(a.screen);
    await waitForIdle(page);
    const [b, c] = (await visible()).filter(
        (m) => m.drillNumber !== a.drillNumber,
    );
    const third = (await drawnOnScreen(page)).find(
        (m) => m.drillNumber === c.drillNumber,
    )!;
    // Long press adds b and c
    await fingers.tap(b.screen, 700);
    await fingers.tap(third.screen, 700);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([a.drillNumber, b.drillNumber, c.drillNumber].sort());

    // Drag the group by one of its marchers a finger can reach, then undo with two fingers
    await waitForIdle(page);
    const grip = (await touchableMarchers(page)).find((m) =>
        [a.drillNumber, b.drillNumber, c.drillNumber].includes(m.drillNumber),
    );
    if (!grip) throw new Error("No selected marcher is reachable");
    const beforeDrag = await savedPositions(show);
    await fingers.drag(grip.screen, {
        x: grip.screen.x + 100,
        y: grip.screen.y + 80,
    });
    await expect.poll(() => savedPositions(show)).not.toEqual(beforeDrag);
    await waitForIdle(page);
    const [empty, empty2] = await emptyFieldPair(page);
    await fingers.twoFingerTap(empty, empty2);
    await expect.poll(() => savedPositions(show)).toEqual(beforeDrag);
    await waitForIdle(page);
    await expectCanvasMatchesShow(show);

    // The selection box is where its marchers are
    const boxOffset = () =>
        page.evaluate(() => {
            const canvas = window.canvas as any;
            const group = canvas.getActiveObject();
            if (!group || group.type !== "activeSelection") return null;
            const box = group.getCenterPoint();
            const m = group.calcTransformMatrix();
            const centers = group
                .getObjects()
                .map((o: any) => o.getCenterPoint())
                .map((p: any) => ({
                    x: m[0] * p.x + m[2] * p.y + m[4],
                    y: m[1] * p.x + m[3] * p.y + m[5],
                }));
            const xs = centers.map((p: any) => p.x);
            const ys = centers.map((p: any) => p.y);
            const mid = {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2,
            };
            return {
                boxVsChildren: Math.hypot(box.x - mid.x, box.y - mid.y),
            };
        });
    await expect
        .poll(async () => (await boxOffset())?.boxVsChildren ?? Infinity)
        .toBeLessThan(15);

    // A tap on a marcher inside the box that isn't selected selects just it
    const outsider = (await touchableMarchers(page)).find(
        (m) =>
            ![a.drillNumber, b.drillNumber, c.drillNumber].includes(
                m.drillNumber,
            ),
    );
    if (outsider) {
        await fingers.tap(outsider.screen);
        await expect
            .poll(() => selectedDrillNumbers(page))
            .toEqual([outsider.drillNumber]);
    }
});

test("a finger's small wobble on a marcher doesn't move it; a real drag moves it the whole way", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [marcher] = await touchableMarchers(page);
    await fingers.tap(marcher.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([marcher.drillNumber]);
    await waitForIdle(page);
    const before = await savedPositions(show);
    const [at] = (await touchableMarchers(page)).filter(
        (m) => m.drillNumber === marcher.drillNumber,
    );

    // 11 px of drift, slowly (past the old 10 px tap slop)
    await fingers.drag(at.screen, { x: at.screen.x + 11, y: at.screen.y }, 10);
    await waitForIdle(page);
    expect(await savedPositions(show)).toEqual(before);
    await expectCanvasMatchesShow(show);

    // A real drag: the marcher ends up the full distance away, under the finger
    const scale = await canvasScale(page);
    await fingers.drag(at.screen, { x: at.screen.x + 80, y: at.screen.y });
    const mine = (rows: { marcher_id: number; x: number }[]) =>
        rows.find((r) => r.marcher_id === marcher.id)!;
    await expect
        .poll(async () =>
            Math.abs(
                mine(await savedPositions(show)).x -
                    (mine(before).x + 80 / scale),
            ),
        )
        .toBeLessThan(1.5);
});

test("an empty selection box keeps the selection; a tap clears it", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [marcher] = await touchableMarchers(page);
    await fingers.tap(marcher.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([marcher.drillNumber]);
    await waitForIdle(page);
    const [from, to] = await emptyFieldPair(page);
    await fingers.drag(from, { x: to.x, y: to.y - 20 });
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual([marcher.drillNumber]);
    await fingers.tap(from);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual([]);
});

test("in the Pan drag mode, one finger on empty field moves the view and selects nothing", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [marcher] = await touchableMarchers(page);
    await fingers.tap(marcher.screen);
    await waitForIdle(page);
    // Drag: Box, opened, then Pan
    const modeButton = page.getByTestId("field-drag-mode");
    await expect(modeButton).toBeVisible();
    await tapElement(fingers, modeButton);
    await tapElement(fingers, page.getByRole("menuitemradio", { name: /Pan/ }));
    await expect(modeButton).toContainText("Pan");
    const positions = await savedPositions(show);
    const viewBefore = await viewport(page);
    const [from] = await emptyFieldPair(page);
    await fingers.drag(from, { x: from.x + 120, y: from.y - 60 });
    await waitForIdle(page);
    const viewAfter = await viewport(page);
    expect(viewAfter[4] - viewBefore[4]).toBeCloseTo(120, -1);
    expect(viewAfter[5] - viewBefore[5]).toBeCloseTo(-60, -1);
    expect(await savedPositions(show)).toEqual(positions);
    expect(await selectedDrillNumbers(page)).toEqual([marcher.drillNumber]);
});

test("mouse: Shift-click on a selected marcher under a handle takes it out instead of scaling", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    // Neighbors in one row: the selection's side handles sit on their dots
    await clickMarcher(page, "B1");
    await clickMarcher(page, "B2", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B1", "B2"]);
    const b1 = (await drawnOnScreen(page)).find((m) => m.drillNumber === "B1")!;
    // Hover first, as a real pointer does on its way to the dot
    await page.mouse.move(b1.screen.x, b1.screen.y);
    await page.keyboard.down("Shift");
    await page.mouse.click(b1.screen.x, b1.screen.y);
    await page.keyboard.up("Shift");
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B2"]);
});

test("with Add on, a tap on a selected marcher's label toggles it and nothing crashes", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [a, b, c] = await touchableMarchers(page);
    await fingers.tap(a.screen);
    // Latch Add. (On a busy test machine a tap can take long enough to count
    // as a long press, which explains instead: tap again until it's on.)
    const addOn = page.getByRole("button", { name: /^Add, on/ });
    for (
        let attempt = 0;
        attempt < 3 && !(await addOn.isVisible());
        attempt++
    ) {
        await tapElement(
            fingers,
            page.getByRole("button", { name: /^Add: hold/ }),
        );
        await addOn
            .waitFor({ state: "visible", timeout: 2000 })
            .catch(() => {});
    }
    await expect(addOn).toBeVisible();
    // The help opens on first use; close it with "?"
    const help = page.getByRole("note");
    await page.waitForTimeout(300);
    if (await help.isVisible()) {
        await tapElement(
            fingers,
            page.getByRole("button", { name: "What these buttons do" }),
        );
        await expect(help).toBeHidden();
    }
    for (const m of [b, c]) {
        const now = (await drawnOnScreen(page)).find(
            (d) => d.drillNumber === m.drillNumber,
        )!;
        await fingers.tap(now.screen);
    }
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([a.drillNumber, b.drillNumber, c.drillNumber].sort());
    // 7 px above c's dot, on its label
    const cNow = (await drawnOnScreen(page)).find(
        (d) => d.drillNumber === c.drillNumber,
    )!;
    await fingers.tap({ x: cNow.screen.x, y: cNow.screen.y - 7 });
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([a.drillNumber, b.drillNumber].sort());
    // (The fixture fails the test on any page error, e.g. a stack overflow)
});

test("a press near a marcher but not on its dot moves the view, not the marcher", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    await waitForIdle(page);
    const before = await savedPositions(show);
    const [m] = await touchableMarchers(page);
    // 18 px below the dot: within a tap's reach, but not on the dot
    const start = { x: m.screen.x, y: m.screen.y + 18 };
    const viewBefore = await viewport(page);
    await fingers.drag(start, { x: start.x + 120, y: start.y + 60 });
    await waitForIdle(page);
    expect(await savedPositions(show)).toEqual(before);
    expect((await viewport(page))[4]).not.toBe(viewBefore[4]);
    // Near the same marcher, a tap picks it
    const mNow = (await drawnOnScreen(page)).find(
        (d) => d.drillNumber === m.drillNumber,
    )!;
    await fingers.tap({ x: mNow.screen.x, y: mNow.screen.y + 18 });
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([m.drillNumber]);
});

test("a long press on the only selected marcher keeps it selected", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [m] = await touchableMarchers(page);
    await fingers.tap(m.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([m.drillNumber]);
    await fingers.tap(m.screen, 700);
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual([m.drillNumber]);
});

test("the tap that closes the help doesn't touch the field", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [m, other] = await touchableMarchers(page);
    await fingers.tap(m.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([m.drillNumber]);
    // On a busy test machine a tap can take long enough to count as a long
    // press (which explains instead): tap again until the help is open
    const help = page.getByRole("note");
    for (let attempt = 0; attempt < 3 && !(await help.isVisible()); attempt++) {
        await tapElement(
            fingers,
            page.getByRole("button", { name: "What these buttons do" }),
        );
        await help.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    }
    await expect(help).toBeVisible();
    // On another marcher, and on empty field: neither changes the selection
    const otherNow = (await drawnOnScreen(page)).find(
        (d) => d.drillNumber === other.drillNumber,
    )!;
    await fingers.tap(otherNow.screen);
    await expect(page.getByRole("note")).toBeHidden();
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual([m.drillNumber]);
});

test("mouse: a one-row selection offers no handles that scale it up or down", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    await clickMarcher(page, "B1");
    await clickMarcher(page, "B2", { add: true });
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B1", "B2"]);
    const visible = await page.evaluate(() => {
        const group = (window.canvas as any).getActiveObject();
        return ["mt", "mb", "ml", "mr"].map((c) => group.isControlVisible(c));
    });
    expect(visible).toEqual([false, false, true, true]);
});

test("mouse: a click a few px off a dot still selects the marcher", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const dot = await page.evaluate(() => {
        const canvas = window.canvas as any;
        const marcher = canvas
            .getCanvasMarchers()
            .find((m: any) => m.marcherObj.drill_number === "B2");
        const p = marcher.getAbsoluteCoords();
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        const vpt = canvas.viewportTransform;
        const css = rect.width / canvas.width;
        const r = 5 * vpt[0] * css; // the dot's radius on screen
        return {
            x: rect.x + (p.x * vpt[0] + vpt[4]) * css,
            y: rect.y + (p.y * vpt[3] + vpt[5]) * css,
            r,
        };
    });
    // Below the dot, outside it by 3 px
    await page.mouse.click(dot.x, dot.y + dot.r + 3);
    await expect.poll(() => selectedDrillNumbers(page)).toEqual(["B2"]);
});

test("the tap that closes a long-press explanation doesn't touch the field", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    const [m, other] = await touchableMarchers(page);
    await fingers.tap(m.screen);
    await expect
        .poll(() => selectedDrillNumbers(page))
        .toEqual([m.drillNumber]);
    // Long press "Drag": it explains instead of opening the menu. (On a busy
    // test machine the shared long-press timer can miss and the press opens
    // the menu instead: close it and press again.)
    const modeButton = page.getByTestId("field-drag-mode");
    const bubble = page.getByTestId("long-press-bubble");
    const menu = page.getByRole("menu", { name: "Drag from empty field" });
    for (
        let attempt = 0;
        attempt < 3 && !(await bubble.isVisible());
        attempt++
    ) {
        if (await menu.isVisible()) await tapElement(fingers, modeButton);
        const box = (await modeButton.boundingBox())!;
        await fingers.tap(
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            800,
        );
        await bubble
            .waitFor({ state: "visible", timeout: 2000 })
            .catch(() => {});
    }
    await expect(bubble).toBeVisible();
    const otherNow = (await drawnOnScreen(page)).find(
        (d) => d.drillNumber === other.drillNumber,
    )!;
    await fingers.tap(otherNow.screen);
    await expect(bubble).toBeHidden();
    await page.waitForTimeout(300);
    expect(await selectedDrillNumbers(page)).toEqual([m.drillNumber]);
});

test("by default one finger on empty field moves the view; press and hold, then drag, selects", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    const fingers = await touchScreen(page);
    await expect(page.getByTestId("field-drag-mode")).toContainText("Auto");
    await waitForIdle(page);
    const positions = await savedPositions(show);

    // A plain drag moves the view by the finger's distance and selects nothing
    const [from] = await emptyFieldPair(page);
    const viewBefore = await viewport(page);
    await fingers.drag(from, { x: from.x + 90, y: from.y - 40 });
    const viewAfter = await viewport(page);
    expect(viewAfter[4] - viewBefore[4]).toBeCloseTo(90, -1);
    expect(viewAfter[5] - viewBefore[5]).toBeCloseTo(-40, -1);
    expect(await selectedDrillNumbers(page)).toEqual([]);

    // Press and hold beside the row, then drag a box across it
    const row = await touchableMarchers(page);
    const left = Math.min(...row.map((m) => m.screen.x)) - 30;
    const right = Math.max(...row.map((m) => m.screen.x)) + 30;
    const y = row[0].screen.y;
    await fingers.holdDrag({ x: left, y: y - 30 }, { x: right, y: y + 30 });
    await expect
        .poll(async () => (await selectedDrillNumbers(page)).length)
        .toBe(row.length);
    expect(await savedPositions(show)).toEqual(positions);
});

test("a group drag moves in whole coordinate-rounding steps, and the readout says so", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    await waitForIdle(page);
    // Round to every 2 steps on both axes
    // Round to every 2 steps on both axes, through the settings store (as
    // if changed in another window)
    await page.evaluate(() => {
        const key = "openmarch:uiSettings";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        settings.coordinateRounding = { nearestXSteps: 2, nearestYSteps: 2 };
        const raw = JSON.stringify(settings);
        localStorage.setItem(key, raw);
        window.dispatchEvent(
            new StorageEvent("storage", { key, newValue: raw }),
        );
    });
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (window.canvas as any).uiSettings?.coordinateRounding
                        ?.nearestXSteps,
            ),
        )
        .toBe(2);
    const pps = await page.evaluate(
        () => (window.canvas as any).fieldProperties.pixelsPerStep as number,
    );
    // Screen positions are read before selecting: inside a selection the
    // helper's positions are relative to the selection
    const [marcher] = (await drawnMarchers(page)).filter((m) => m.onScreen);
    await page.keyboard.press("Control+a");
    await expect
        .poll(async () => (await selectedDrillNumbers(page)).length)
        .toBe(4);
    const before = await savedPositions(show);
    const scale = await canvasScale(page);
    // 3.3 steps right and 1.2 steps down: snaps to 4 and 2 steps
    const to = {
        x: marcher.screen.x + 3.3 * pps * scale,
        y: marcher.screen.y + 1.2 * pps * scale,
    };
    await page.mouse.move(marcher.screen.x, marcher.screen.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await expect(page.getByTestId("drag-step-readout")).toHaveText(
        /4 steps to .* · 2 steps toward the front/,
    );
    await page.mouse.up();
    await expect.poll(() => savedPositions(show)).not.toEqual(before);
    const after = await savedPositions(show);
    for (const [i, b] of before.entries()) {
        expect(after[i].x - b.x).toBeCloseTo(4 * pps, 3);
        expect(after[i].y - b.y).toBeCloseTo(2 * pps, 3);
    }

    // A single marcher snaps to the 2-step grid; the readout matches the drop
    await page.keyboard.press("Escape");
    await waitForIdle(page);
    const [one] = (await drawnMarchers(page)).filter((m) => m.onScreen);
    const oneBefore = (await savedPositions(show)).find(
        (p) => p.marcher_id === one.id,
    )!;
    await page.mouse.move(one.screen.x, one.screen.y);
    await page.mouse.down();
    await page.mouse.move(
        one.screen.x + 3.3 * pps * scale,
        one.screen.y + 1.2 * pps * scale,
        { steps: 12 },
    );
    const readout = await page.getByTestId("drag-step-readout").textContent();
    await page.mouse.up();
    await expect
        .poll(async () =>
            (await savedPositions(show)).find((p) => p.marcher_id === one.id),
        )
        .not.toEqual(oneBefore);
    const oneAfter = (await savedPositions(show)).find(
        (p) => p.marcher_id === one.id,
    )!;
    const steps = (n: number) => Math.round((n / pps) * 4) / 4;
    const dx = steps(oneAfter.x - oneBefore.x);
    const dy = steps(oneAfter.y - oneBefore.y);
    expect(readout).toContain(`${dx} steps to`);
    expect(readout).toContain(`${dy} steps toward the front`);
});

test("resizing the window keeps a zoomed-in view of empty field (no re-fit)", async ({
    show,
}) => {
    const { page } = show;
    await createMarchers(page, { quantity: 4, section: "Baritone" });
    await expectCanvasMatchesShow(show);
    // Zoom in on an empty spot near the field's bottom-right corner
    await page.evaluate(() => {
        const canvas = window.canvas as any;
        const field = canvas.fieldProperties;
        const zoom = 3;
        const x = field.width * 0.9;
        const y = field.height * 0.9;
        canvas.setViewportTransform([
            zoom,
            0,
            0,
            zoom,
            canvas.getWidth() / 2 - x * zoom,
            canvas.getHeight() / 2 - y * zoom,
        ]);
    });
    const centre = () =>
        page.evaluate(() => {
            const canvas = window.canvas as any;
            const v = canvas.viewportTransform;
            return {
                zoom: v[0],
                x: (canvas.getWidth() / 2 - v[4]) / v[0],
                y: (canvas.getHeight() / 2 - v[5]) / v[0],
            };
        });
    const before = await centre();
    const size = page.viewportSize()!;
    await page.setViewportSize({
        width: size.width - 200,
        height: size.height - 100,
    });
    await page.waitForTimeout(800);
    const after = await centre();
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
});
