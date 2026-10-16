import { describe, expect, it, vi } from "vitest";
import type { FieldPointer } from "../fieldEditor";
import {
    HANDLE_SIZE,
    MIN_SCALE,
    ROTATE_HANDLE_OFFSET,
    boundsOf,
    handleAt,
    handlePoints,
    rotatePositions,
    scaleFor,
    scalePositions,
    snapRotation,
    turnBetween,
} from "../groupTransform";
import type { MarcherPosition } from "../moveGesture";
import { RotateGesture, ScaleGesture } from "../transformGestures";

// A formation 100 wide and 50 tall, from (100, 200) to (200, 250).
const FORMATION: MarcherPosition[] = [
    { id: 1, x: 100, y: 200 },
    { id: 2, x: 200, y: 220 },
    { id: 3, x: 150, y: 250 },
];
const BOX = boundsOf(FORMATION)!;

const pointer = (
    x: number,
    y: number,
    modifiers: Partial<FieldPointer> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x, y },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

describe("boundsOf", () => {
    it("is the marchers' bounds, or null with none", () => {
        expect(BOX).toEqual({ left: 100, top: 200, right: 200, bottom: 250 });
        expect(boundsOf([])).toBeNull();
    });
});

describe("handlePoints and handleAt", () => {
    const frame = { box: BOX, pad: 10, angle: 0 };

    it("puts the handles on the padded box, and the rotate handle above it", () => {
        const handles = handlePoints(frame, 2);
        expect(handles.nw).toEqual({ x: 90, y: 190 });
        expect(handles.n).toEqual({ x: 150, y: 190 });
        expect(handles.e).toEqual({ x: 210, y: 225 });
        expect(handles.se).toEqual({ x: 210, y: 260 });
        expect(handles.w).toEqual({ x: 90, y: 225 });
        // A fixed distance on screen: 40 px at 2 px per unit
        expect(handles.rot).toEqual({
            x: 150,
            y: 190 - ROTATE_HANDLE_OFFSET / 2,
        });
    });

    it("turns the handles with the box while it rotates", () => {
        const handles = handlePoints({ ...frame, angle: 90 }, 1);
        // The top-left corner turns to the top-right
        expect(handles.nw.x).toBeCloseTo(150 + 35);
        expect(handles.nw.y).toBeCloseTo(225 - 60);
    });

    it("takes a press within half a handle's size on screen", () => {
        const zoom = 2;
        const handles = handlePoints(frame, zoom);
        const reach = HANDLE_SIZE / 2 / zoom;
        expect(handleAt(handles, { x: 90 + reach, y: 190 }, zoom)).toBe("nw");
        expect(handleAt(handles, { x: 90 + reach + 0.1, y: 190 }, zoom)).toBe(
            null,
        );
        expect(handleAt(handles, handles.rot, zoom)).toBe("rot");
        expect(handleAt(handles, { x: 150, y: 225 }, zoom)).toBeNull();
    });

    it("takes the nearest handle when their squares overlap", () => {
        const tiny = handlePoints({ box: BOX, pad: 10, angle: 0 }, 0.05);
        expect(handleAt(tiny, { x: 92, y: 192 }, 0.05)).toBe("nw");
        expect(handleAt(tiny, { x: 148, y: 192 }, 0.05)).toBe("n");
    });
});

describe("scaleFor: corners (user story 48)", () => {
    it("scales uniformly from the opposite corner by the pointer's progress along the diagonal", () => {
        // The diagonal is (100, 50): 50 across and 25 down is half again
        const scale = scaleFor("se", BOX, { x: 50, y: 25 }, false);
        expect(scale).toEqual({ anchor: { x: 100, y: 200 }, x: 1.5, y: 1.5 });
        expect(scalePositions(FORMATION, scale)).toEqual([
            { id: 1, x: 100, y: 200 },
            { id: 2, x: 250, y: 230 },
            { id: 3, x: 175, y: 275 },
        ]);
    });

    it("still scales both ways when dragged straight across", () => {
        const scale = scaleFor("se", BOX, { x: 50, y: 0 }, false);
        expect(scale.x).toBe(scale.y);
        expect(scale.x).toBeCloseTo(1.4);
    });

    it("anchors each corner on its opposite", () => {
        expect(scaleFor("nw", BOX, { x: -100, y: -50 }, false)).toEqual({
            anchor: { x: 200, y: 250 },
            x: 2,
            y: 2,
        });
        expect(scaleFor("ne", BOX, { x: 0, y: 0 }, false).anchor).toEqual({
            x: 100,
            y: 250,
        });
        expect(scaleFor("sw", BOX, { x: 0, y: 0 }, false).anchor).toEqual({
            x: 200,
            y: 200,
        });
    });

    it("scales each axis with the pointer when free (Shift)", () => {
        expect(scaleFor("se", BOX, { x: 50, y: 0 }, true)).toEqual({
            anchor: { x: 100, y: 200 },
            x: 1.5,
            y: 1,
        });
        expect(scaleFor("nw", BOX, { x: 50, y: -50 }, true)).toEqual({
            anchor: { x: 200, y: 250 },
            x: 0.5,
            y: 2,
        });
    });

    it("scales a formation in one row along its row only", () => {
        const row = { left: 100, top: 200, right: 200, bottom: 200 };
        expect(scaleFor("se", row, { x: 50, y: 80 }, false)).toEqual({
            anchor: { x: 100, y: 200 },
            x: 1.5,
            y: 1.5,
        });
        expect(scaleFor("se", row, { x: 50, y: 80 }, true).y).toBe(1);
        const point = { left: 5, top: 5, right: 5, bottom: 5 };
        expect(scaleFor("se", point, { x: 50, y: 80 }, false)).toMatchObject({
            x: 1,
            y: 1,
        });
    });
});

describe("scaleFor: middle handles (user story 49)", () => {
    it("scales the handle's axis only, from the opposite side", () => {
        expect(scaleFor("e", BOX, { x: 50, y: 30 }, false)).toEqual({
            anchor: { x: 100, y: 200 },
            x: 1.5,
            y: 1,
        });
        expect(scaleFor("n", BOX, { x: 30, y: -25 }, false)).toEqual({
            anchor: { x: 100, y: 250 },
            x: 1,
            y: 1.5,
        });
        expect(scaleFor("w", BOX, { x: 50, y: 0 }, false).x).toBe(0.5);
    });

    it("ignores Shift", () => {
        expect(scaleFor("e", BOX, { x: 50, y: 30 }, true)).toEqual(
            scaleFor("e", BOX, { x: 50, y: 30 }, false),
        );
    });

    it("can't scale an axis the formation has no extent along", () => {
        const column = { left: 100, top: 200, right: 100, bottom: 300 };
        expect(scaleFor("e", column, { x: 50, y: 0 }, false).x).toBe(1);
    });
});

describe("scaleFor: no flipping (user story 52)", () => {
    it("stops at the smallest scale when dragged past the opposite side", () => {
        expect(scaleFor("e", BOX, { x: -300, y: 0 }, false).x).toBe(MIN_SCALE);
        expect(scaleFor("se", BOX, { x: -300, y: -300 }, false).x).toBe(
            MIN_SCALE,
        );
        expect(scaleFor("nw", BOX, { x: 50, y: 300 }, true)).toMatchObject({
            x: 0.5,
            y: MIN_SCALE,
        });
        const flat = scalePositions(
            FORMATION,
            scaleFor("e", BOX, { x: -300, y: 0 }, false),
        );
        // In the same order across
        expect(flat.map((p) => p.x)).toEqual([100, 101, 100.5]);
    });
});

describe("transforms that change nothing (user story 54)", () => {
    // Saved off the thousandths grid, as an unsnapped drag leaves them
    const loose: MarcherPosition[] = [
        { id: 1, x: 100.12345, y: 200.98765 },
        { id: 2, x: 210.5555, y: 230.4444 },
    ];
    const box = boundsOf(loose)!;

    it("leave every position exactly as it was after whole turns", () => {
        expect(rotatePositions(loose, { x: 0, y: 0 }, 0)).toEqual(loose);
        expect(rotatePositions(loose, { x: 0, y: 0 }, 360)).toEqual(loose);
        expect(rotatePositions(loose, { x: 0, y: 0 }, -720)).toEqual(loose);
    });

    it("leave the axis a middle handle doesn't scale exactly as it was", () => {
        const scaled = scalePositions(
            loose,
            scaleFor("e", box, { x: 20, y: 0 }, false),
        );
        expect(scaled.map((p) => p.y)).toEqual(loose.map((p) => p.y));
        expect(
            scalePositions(loose, scaleFor("se", box, { x: 0, y: 0 }, false)),
        ).toEqual(loose);
    });
});

describe("rotation (user story 50)", () => {
    const center = { x: 0, y: 0 };

    it("measures the turn clockwise on screen, across the half-turn", () => {
        expect(turnBetween(center, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(
            90,
        );
        expect(turnBetween(center, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(
            -90,
        );
        expect(
            turnBetween(center, { x: -1, y: 0.1 }, { x: -1, y: -0.1 }),
        ).toBeCloseTo(11.42, 1);
    });

    it("snaps to 15° unless free", () => {
        expect(snapRotation(37, false)).toBe(30);
        expect(snapRotation(38, false)).toBe(45);
        expect(snapRotation(-7, false)).toBe(0);
        expect(Object.is(snapRotation(-7, false), -0)).toBe(false);
        expect(snapRotation(37, true)).toBe(37);
    });

    it("turns positions about the center, keeping their distances", () => {
        expect(rotatePositions([{ id: 1, x: 10, y: 0 }], center, 90)).toEqual([
            { id: 1, x: 0, y: 10 },
        ]);
        const [turned] = rotatePositions([{ id: 1, x: 3, y: 4 }], center, 33);
        expect(Math.hypot(turned.x, turned.y)).toBeCloseTo(5, 2);
    });
});

/** A host that records what a gesture shows and drops. */
const host = () => ({ show: vi.fn(), drop: vi.fn(), cancel: vi.fn() });
const last = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls.at(-1)![0] as MarcherPosition[];

describe("ScaleGesture", () => {
    it("shows and drops the scaled formation", () => {
        const h = host();
        const gesture = new ScaleGesture(
            pointer(200, 250),
            FORMATION,
            h,
            "e",
            BOX,
        );
        gesture.move(pointer(250, 270));
        expect(last(h.show).map((p) => p.x)).toEqual([100, 250, 175]);
        gesture.end(pointer(250, 270));
        expect(last(h.drop)).toEqual(last(h.show));
    });

    it("moves at a quarter of the pointer's speed while Alt is down (user story 51)", () => {
        const h = host();
        const gesture = new ScaleGesture(
            pointer(200, 250),
            FORMATION,
            h,
            "e",
            BOX,
        );
        gesture.move(pointer(240, 250));
        gesture.move(pointer(280, 250, { alt: true }));
        // 40 at full speed, then 40 at a quarter: 50 across, half again
        expect(last(h.show).map((p) => p.x)).toEqual([100, 250, 175]);
    });

    it("drops what's drawn when the release didn't move, whatever keys changed", () => {
        const h = host();
        const gesture = new ScaleGesture(
            pointer(200, 250),
            FORMATION,
            h,
            "se",
            BOX,
        );
        gesture.move(pointer(250, 250));
        const shown = last(h.show);
        gesture.end(pointer(250, 250, { shift: true }));
        expect(last(h.drop)).toEqual(shown);
    });
});

describe("RotateGesture", () => {
    // The formation's center is (150, 225); the rotate handle above it
    const rot = pointer(150, 150);
    /** The pointer `degrees` clockwise round from the rotate handle. */
    const round = (degrees: number, modifiers: Partial<FieldPointer> = {}) => {
        const radians = ((degrees - 90) * Math.PI) / 180;
        return pointer(
            150 + 75 * Math.cos(radians),
            225 + 75 * Math.sin(radians),
            modifiers,
        );
    };
    /** The angle a gesture drew, from T1 and T2's heading. */
    const heading = (positions: MarcherPosition[]) =>
        (Math.atan2(
            positions[1].y - positions[0].y,
            positions[1].x - positions[0].x,
        ) *
            180) /
        Math.PI;
    const home = heading(FORMATION);

    it("snaps to 15°, and turns freely with Shift", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX);
        gesture.move(round(20));
        gesture.move(round(37));
        expect(gesture.angle()).toBe(30);
        expect(heading(last(h.show)) - home).toBeCloseTo(30);
        gesture.move(round(37, { shift: true }));
        expect(gesture.angle()).toBeCloseTo(37);
    });

    it("turns past half a turn", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX);
        for (let degrees = 30; degrees <= 270; degrees += 30)
            gesture.move(round(degrees));
        expect(gesture.angle()).toBe(270);
    });

    it("turns at a quarter speed with Alt, unsnapped, from the angle drawn (user story 51)", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX);
        gesture.move(round(37));
        expect(gesture.angle()).toBe(30);
        // Pressing Alt where the pointer is: no jump, from the snapped 30°
        gesture.move(round(37, { alt: true }));
        expect(gesture.angle()).toBeCloseTo(30);
        gesture.move(round(77, { alt: true }));
        expect(gesture.angle()).toBeCloseTo(40);
    });

    it("drops the formation at the angle drawn", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX);
        gesture.move(round(90));
        gesture.end(round(90));
        expect(heading(last(h.drop)) - home).toBeCloseTo(90);
        expect(gesture.center).toEqual({ x: 150, y: 225 });
    });
});
