import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures.mjs";
import {
    FINGERTIP_WIDTH,
    emulateTouchScreen,
    longPress,
    multiFingerTap,
    penDrag,
    pinch,
    tap,
    touchDrag,
    twoFingerPan,
} from "../app.mjs";

// The shared touch and pen helpers (`app.mts`): each sends what a tablet
// sends. These read the pointer events the page receives, not what the app
// does with them; the area scenarios check that.

type Recorded = {
    type: string;
    pointerType: string;
    pointerId: number;
    x: number;
    y: number;
    width: number;
    time: number;
};

/** Starts recording every pointer event the page receives, before the app sees it. */
const record = (page: Page) =>
    page.evaluate(() => {
        const events: Recorded[] = [];
        (window as unknown as { __touchEvents: Recorded[] }).__touchEvents =
            events;
        for (const type of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
        ])
            window.addEventListener(
                type,
                (event) => {
                    const e = event as PointerEvent;
                    events.push({
                        type: e.type,
                        pointerType: e.pointerType,
                        pointerId: e.pointerId,
                        x: e.clientX,
                        y: e.clientY,
                        width: e.width,
                        time: performance.now(),
                    });
                },
                true,
            );
    });

const recorded = (page: Page) =>
    page.evaluate(
        () =>
            (window as unknown as { __touchEvents: Recorded[] }).__touchEvents,
    );

/** The recorded events of one type. */
const ofType = (events: Recorded[], type: string) =>
    events.filter((event) => event.type === type);

/** A point over the field, away from the panels. */
async function overField(page: Page) {
    const box = await page.getByTestId("fieldCanvas").boundingBox();
    if (!box) throw new Error("The field is not on screen");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("tap: one finger down and up at the point, fingertip-sized", async ({
    show,
}) => {
    const { page } = show;
    const at = await overField(page);
    await record(page);
    await tap(page, at);
    const events = await recorded(page);
    const [down] = ofType(events, "pointerdown");
    const ups = ofType(events, "pointerup");
    expect(ofType(events, "pointerdown")).toHaveLength(1);
    expect(ups).toHaveLength(1);
    expect(down).toMatchObject({ pointerType: "touch", ...at });
    expect(down.width).toBeCloseTo(FINGERTIP_WIDTH, 0);
    expect(ups[0].pointerId).toBe(down.pointerId);
});

test("touchDrag: one finger moves from one point to the other", async ({
    show,
}) => {
    const { page } = show;
    const from = await overField(page);
    const to = { x: from.x + 100, y: from.y + 60 };
    await record(page);
    await touchDrag(page, from, to, { steps: 5 });
    const events = await recorded(page);
    expect(ofType(events, "pointerdown")).toMatchObject([
        { pointerType: "touch", ...from },
    ]);
    const moves = ofType(events, "pointermove");
    expect(moves.length).toBeGreaterThanOrEqual(5);
    expect(moves.at(-1)).toMatchObject({ pointerType: "touch", ...to });
    expect(ofType(events, "pointerup")).toHaveLength(1);
});

test("longPress: one finger held still for the time asked", async ({
    show,
}) => {
    const { page } = show;
    const at = await overField(page);
    await record(page);
    await longPress(page, at, { ms: 600 });
    const events = await recorded(page);
    const [down] = ofType(events, "pointerdown");
    const [up] = ofType(events, "pointerup");
    expect(down).toMatchObject({ pointerType: "touch", ...at });
    expect(ofType(events, "pointermove")).toHaveLength(0);
    expect(up.time - down.time).toBeGreaterThanOrEqual(600);
});

test("twoFingerPan: two fingers move together by the same amount", async ({
    show,
}) => {
    const { page } = show;
    const at = await overField(page);
    await record(page);
    await twoFingerPan(page, at, { x: 80, y: -40 }, { spread: 50 });
    const events = await recorded(page);
    const downs = ofType(events, "pointerdown");
    expect(downs).toHaveLength(2);
    expect(new Set(downs.map((d) => d.pointerId)).size).toBe(2);
    for (const down of downs) {
        const last = ofType(events, "pointermove")
            .filter((move) => move.pointerId === down.pointerId)
            .at(-1)!;
        expect(last.x - down.x).toBeCloseTo(80, 0);
        expect(last.y - down.y).toBeCloseTo(-40, 0);
    }
    expect(ofType(events, "pointerup")).toHaveLength(2);
});

test("pinch: two fingers either side of the point spread apart", async ({
    show,
}) => {
    const { page } = show;
    const at = await overField(page);
    await record(page);
    await pinch(page, at, { from: 50, to: 100 });
    const events = await recorded(page);
    const downs = ofType(events, "pointerdown");
    expect(downs.map((d) => d.x).sort((a, b) => a - b)).toEqual([
        at.x - 50,
        at.x + 50,
    ]);
    const lastX = downs.map(
        (down) =>
            ofType(events, "pointermove")
                .filter((move) => move.pointerId === down.pointerId)
                .at(-1)!.x,
    );
    expect(lastX.sort((a, b) => a - b)).toEqual([at.x - 100, at.x + 100]);
});

for (const fingers of [2, 3] as const)
    test(`multiFingerTap: ${fingers} fingers down and up at once`, async ({
        show,
    }) => {
        const { page } = show;
        const at = await overField(page);
        await record(page);
        await multiFingerTap(page, at, fingers);
        const events = await recorded(page);
        const downs = ofType(events, "pointerdown");
        expect(downs).toHaveLength(fingers);
        expect(downs.every((d) => d.pointerType === "touch")).toBe(true);
        expect(ofType(events, "pointermove")).toHaveLength(0);
        expect(ofType(events, "pointerup")).toHaveLength(fingers);
        // All down before any lifts
        const firstUp = events.findIndex((e) => e.type === "pointerup");
        const lastDown = events.findLastIndex((e) => e.type === "pointerdown");
        expect(lastDown).toBeLessThan(firstUp);
    });

test("penDrag: a pen presses, moves and releases", async ({ show }) => {
    const { page } = show;
    const from = await overField(page);
    const to = { x: from.x - 80, y: from.y + 40 };
    await record(page);
    await penDrag(page, from, to);
    const events = await recorded(page);
    expect(ofType(events, "pointerdown")).toMatchObject([
        { pointerType: "pen", ...from },
    ]);
    expect(ofType(events, "pointermove").at(-1)).toMatchObject({
        pointerType: "pen",
        ...to,
    });
    expect(ofType(events, "pointerup")).toMatchObject([
        { pointerType: "pen", ...to },
    ]);
});

test("emulateTouchScreen: the page is a touch screen until stopped", async ({
    show,
    touchScreen,
}) => {
    test.skip(touchScreen, "Already a touch screen for the whole run");
    const { page } = show;
    const media = () =>
        page.evaluate(() => ({
            coarse: matchMedia("(pointer: coarse)").matches,
            hover: matchMedia("(hover: hover)").matches,
        }));
    expect(await media()).toEqual({ coarse: false, hover: true });
    const stop = await emulateTouchScreen(page);
    expect(await media()).toEqual({ coarse: true, hover: false });
    await stop();
    // Chromium keeps `(hover: none)` for the rest of the page; the pointer is fine again
    expect((await media()).coarse).toBe(false);
});

test.describe("on a touch screen (touchScreen)", () => {
    test.use({ touchScreen: true });

    test("the app lays itself out for touch, and the mouse still presses as a mouse", async ({
        show,
    }) => {
        const { page } = show;
        expect(
            await page.evaluate(() => ({
                coarse: matchMedia("(pointer: coarse)").matches,
                input: document.documentElement.dataset.input,
            })),
        ).toEqual({ coarse: true, input: "touch" });
        const at = await overField(page);
        await record(page);
        await page.mouse.click(at.x, at.y);
        expect(ofType(await recorded(page), "pointerdown")).toMatchObject([
            { pointerType: "mouse" },
        ]);
    });
});
