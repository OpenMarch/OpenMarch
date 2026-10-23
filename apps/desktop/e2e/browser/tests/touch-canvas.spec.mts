import type { CDPSession, Page } from "@playwright/test";
import { test, expect, type Show } from "../fixtures.mjs";
import {
    canvasScale,
    createMarchers,
    drawnMarchers,
    expectCanvasMatchesShow,
    selectedDrillNumbers,
    waitForIdle,
} from "../app.mjs";

/** Fingers on the page through Chromium's touch input (real pointer events) */
async function touchScreen(page: Page) {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 5,
    });
    type Point = { x: number; y: number };
    const send = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: Point[],
    ) =>
        cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
        });
    return {
        /** One finger down and up; `holdMs` keeps it down (a long press) */
        async tap(at: Point, holdMs = 0) {
            await send("touchStart", [at]);
            if (holdMs > 0) await page.waitForTimeout(holdMs);
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
    const marcher = (await drawnMarchers(page)).find((m) => m.onScreen);
    if (!marcher) throw new Error("No marcher is visible on the canvas");
    const before = (await savedPositions(show)).find(
        (p) => p.marcher_id === marcher.id,
    )!;
    const viewBefore = await viewport(page);
    const scale = await canvasScale(page);

    const fingers = await touchScreen(page);
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
    await waitForIdle(page);
    const positionsBefore = await savedPositions(show);
    const zoomBefore = (await viewport(page))[0];

    // Start the pinch on a marcher, so the first finger would drag it
    const marcher = (await drawnMarchers(page)).find((m) => m.onScreen)!;
    const fingers = await touchScreen(page);
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
    const [first, second] = (await drawnMarchers(page)).filter(
        (m) => m.onScreen,
    );
    const fingers = await touchScreen(page);

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
    const empty = { x: firstNow.screen.x, y: firstNow.screen.y + 200 };
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
    await fingers.twoFingerTap(empty, { x: empty.x + 100, y: empty.y });
    await expect.poll(() => savedPositions(show)).toEqual(before);
    await expectCanvasMatchesShow(show);
});
