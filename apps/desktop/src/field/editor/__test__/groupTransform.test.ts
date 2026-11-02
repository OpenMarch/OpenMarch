import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldPointer } from "../fieldEditor";
import { fieldKeys } from "../fieldKeys";
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
import {
    onScreenToggles,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";

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
    it("keeping the ratio, scales uniformly from the opposite corner by the pointer's progress along the diagonal", () => {
        // The diagonal is (100, 50): 50 across and 25 down is half again
        const scale = scaleFor("se", BOX, { x: 50, y: 25 }, true);
        expect(scale).toEqual({ anchor: { x: 100, y: 200 }, x: 1.5, y: 1.5 });
        expect(scalePositions(FORMATION, scale)).toEqual([
            { id: 1, x: 100, y: 200 },
            { id: 2, x: 250, y: 230 },
            { id: 3, x: 175, y: 275 },
        ]);
    });

    it("keeping the ratio, still scales both ways when dragged straight across", () => {
        const scale = scaleFor("se", BOX, { x: 50, y: 0 }, true);
        expect(scale.x).toBe(scale.y);
        expect(scale.x).toBeCloseTo(1.4);
    });

    it("anchors each corner on its opposite", () => {
        expect(scaleFor("nw", BOX, { x: -100, y: -50 }, true)).toEqual({
            anchor: { x: 200, y: 250 },
            x: 2,
            y: 2,
        });
        expect(scaleFor("ne", BOX, { x: 0, y: 0 }, true).anchor).toEqual({
            x: 100,
            y: 250,
        });
        expect(scaleFor("sw", BOX, { x: 0, y: 0 }, true).anchor).toEqual({
            x: 200,
            y: 200,
        });
    });

    it("scales each axis with the pointer by default, as a box shape's corner does (#545)", () => {
        expect(scaleFor("se", BOX, { x: 50, y: 0 }, false)).toEqual({
            anchor: { x: 100, y: 200 },
            x: 1.5,
            y: 1,
        });
        expect(scaleFor("nw", BOX, { x: 50, y: -50 }, false)).toEqual({
            anchor: { x: 200, y: 250 },
            x: 0.5,
            y: 2,
        });
    });

    it("scales a formation in one row along its row only", () => {
        const row = { left: 100, top: 200, right: 200, bottom: 200 };
        expect(scaleFor("se", row, { x: 50, y: 80 }, true)).toEqual({
            anchor: { x: 100, y: 200 },
            x: 1.5,
            y: 1.5,
        });
        expect(scaleFor("se", row, { x: 50, y: 80 }, false).y).toBe(1);
        const point = { left: 5, top: 5, right: 5, bottom: 5 };
        expect(scaleFor("se", point, { x: 50, y: 80 }, true)).toMatchObject({
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

    it("scales the other axis by the same amount with constrain, about the center line (#545)", () => {
        expect(scaleFor("e", BOX, { x: 50, y: 30 }, true)).toEqual({
            anchor: { x: 100, y: 225 },
            x: 1.5,
            y: 1.5,
        });
        expect(scaleFor("n", BOX, { x: 30, y: -25 }, true)).toEqual({
            anchor: { x: 150, y: 250 },
            x: 1.5,
            y: 1.5,
        });
    });

    it("can't scale an axis the formation has no extent along", () => {
        const column = { left: 100, top: 200, right: 100, bottom: 300 };
        expect(scaleFor("e", column, { x: 50, y: 0 }, false).x).toBe(1);
    });
});

describe("scaleFor: from center (Alt, #545)", () => {
    // The box's center is (150, 225)
    it("scales a corner proportionally about the center, the corner following the pointer", () => {
        const scale = scaleFor("se", BOX, { x: 25, y: 12.5 }, true, true);
        expect(scale).toEqual({ anchor: { x: 150, y: 225 }, x: 1.5, y: 1.5 });
        const [nw, , se] = scalePositions(
            [
                { id: 1, x: BOX.left, y: BOX.top },
                { id: 2, x: 150, y: 225 },
                { id: 3, x: BOX.right, y: BOX.bottom },
            ],
            scale,
        );
        // The dragged corner is where the pointer took it; the opposite one mirrors it
        expect(se).toEqual({ id: 3, x: 225, y: 262.5 });
        expect(nw).toEqual({ id: 1, x: 75, y: 187.5 });
    });

    it("scales a middle handle's axis only, both sides moving", () => {
        expect(scaleFor("e", BOX, { x: 25, y: 30 }, false, true)).toEqual({
            anchor: { x: 150, y: 225 },
            x: 1.5,
            y: 1,
        });
        expect(scaleFor("w", BOX, { x: 25, y: 0 }, false, true).x).toBe(0.5);
    });

    it("adds up with either default: a free corner, or a side keeping the ratio, about the center", () => {
        expect(scaleFor("se", BOX, { x: 25, y: 0 }, false, true)).toEqual({
            anchor: { x: 150, y: 225 },
            x: 1.5,
            y: 1,
        });
        expect(scaleFor("e", BOX, { x: 25, y: 0 }, true, true)).toEqual({
            anchor: { x: 150, y: 225 },
            x: 1.5,
            y: 1.5,
        });
    });

    it("stops at the smallest scale when dragged past the center", () => {
        expect(scaleFor("e", BOX, { x: -80, y: 0 }, false, true).x).toBe(
            MIN_SCALE,
        );
        expect(scaleFor("nw", BOX, { x: 80, y: 80 }, true, true).y).toBe(
            MIN_SCALE,
        );
    });

    it("still can't scale an axis the formation has no extent along", () => {
        const column = { left: 100, top: 200, right: 100, bottom: 300 };
        expect(scaleFor("e", column, { x: 50, y: 0 }, false, true).x).toBe(1);
    });
});

describe("scaleFor: no flipping (user story 52)", () => {
    it("stops at the smallest scale when dragged past the opposite side", () => {
        expect(scaleFor("e", BOX, { x: -300, y: 0 }, false).x).toBe(MIN_SCALE);
        expect(scaleFor("se", BOX, { x: -300, y: -300 }, true).x).toBe(
            MIN_SCALE,
        );
        expect(scaleFor("nw", BOX, { x: 50, y: 300 }, false)).toMatchObject({
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
            scalePositions(loose, scaleFor("se", box, { x: 0, y: 0 }, true)),
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

    it("snaps to 15°, to whole degrees with fine, and not at all with the Snap toggle off", () => {
        expect(snapRotation(37, { fine: false })).toBe(30);
        expect(snapRotation(38, { fine: false })).toBe(45);
        expect(snapRotation(-7, { fine: false })).toBe(0);
        expect(Object.is(snapRotation(-7, { fine: false }), -0)).toBe(false);
        expect(snapRotation(37.4, { fine: true })).toBe(37);
        expect(snapRotation(-0.4, { fine: true })).toBe(0);
        expect(Object.is(snapRotation(-0.4, { fine: true }), -0)).toBe(false);
        expect(snapRotation(37.4, { fine: false, snap: false })).toBe(37.4);
        expect(snapRotation(37.4, { fine: true, snap: false })).toBe(37.4);
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

/** How far a "se" drag scaled the formation from its top-left (100, 200), measured on T2. */
const scaleOf = (positions: MarcherPosition[]) => ({
    x: Math.round(((positions[1].x - 100) / 100) * 100) / 100,
    y: Math.round(((positions[1].y - 200) / 20) * 100) / 100,
});

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent(type, init));

/** The held roles of a press at `origin`, off a Mac. */
const keysAt = (origin: FieldPointer) => fieldKeys(origin, { isMac: false });

describe("ScaleGesture", () => {
    /** Each marcher's position, by id, as the last show drew it. */
    const at = (positions: MarcherPosition[]) =>
        positions.map(({ x, y }) => [x, y]);

    it("shows and drops the scaled formation", () => {
        const h = host();
        const gesture = new ScaleGesture(
            pointer(200, 250),
            FORMATION,
            h,
            "e",
            BOX,
            keysAt(pointer(200, 250)),
        );
        gesture.move(pointer(250, 270));
        expect(last(h.show).map((p) => p.x)).toEqual([100, 250, 175]);
        gesture.end(pointer(250, 270));
        expect(last(h.drop)).toEqual(last(h.show));
    });

    it("moves at a quarter of the pointer's speed with fine (Shift; user story 51)", () => {
        const h = host();
        const gesture = new ScaleGesture(
            pointer(200, 250),
            FORMATION,
            h,
            "e",
            BOX,
            keysAt(pointer(200, 250)),
        );
        gesture.move(pointer(240, 250));
        gesture.move(pointer(280, 250, { shift: true }));
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
            keysAt(pointer(200, 250)),
        );
        gesture.move(pointer(250, 250));
        const shown = last(h.show);
        gesture.end(pointer(250, 250, { ctrl: true, shift: true }));
        expect(last(h.drop)).toEqual(shown);
    });

    it("scales a corner's axes on their own, and proportionally with constrain ($mod; #545)", () => {
        const scaled = (modifiers: Partial<FieldPointer>, isMac = false) => {
            const h = host();
            const origin = pointer(200, 250);
            const gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                "se",
                BOX,
                fieldKeys(origin, { isMac }),
            );
            gesture.move(pointer(250, 250, modifiers));
            return scaleOf(last(h.show));
        };
        expect(scaled({})).toEqual({ x: 1.5, y: 1 });
        expect(scaled({ ctrl: true })).toEqual({ x: 1.4, y: 1.4 });
        expect(scaled({ meta: true }, true)).toEqual({ x: 1.4, y: 1.4 });
        // Mac Ctrl is a right-click, never $mod; Shift is fine, not proportional
        expect(scaled({ ctrl: true }, true)).toEqual({ x: 1.5, y: 1 });
        expect(scaled({ shift: true })).toEqual({ x: 1.13, y: 1 });
    });

    it("keeps the ratio by default with the ratio lock on, and constrain frees it (#545)", () => {
        const scaled = (
            handle: "se" | "e",
            modifiers: Partial<FieldPointer> = {},
        ) => {
            const h = host();
            const origin = pointer(200, handle === "se" ? 250 : 225);
            const gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                handle,
                BOX,
                keysAt(origin),
                true,
            );
            gesture.move(pointer(250, origin.field.y, modifiers));
            gesture.cancel();
            return last(h.show);
        };
        expect(scaleOf(scaled("se"))).toEqual({ x: 1.4, y: 1.4 });
        expect(scaleOf(scaled("se", { ctrl: true }))).toEqual({ x: 1.5, y: 1 });
        // A side scales both ways, about the center line, and one axis with constrain
        expect(at(scaled("e"))).toEqual([
            [100, 187.5],
            [250, 217.5],
            [175, 262.5],
        ]);
        expect(scaled("e", { ctrl: true }).map((p) => p.y)).toEqual([
            200, 220, 250,
        ]);
    });

    it("scales about the box's center with from center (Alt; #545)", () => {
        const scaled = (
            handle: "se" | "e",
            to: FieldPointer,
            origin = pointer(200, 250),
        ) => {
            const h = host();
            const gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                handle,
                BOX,
                keysAt(origin),
            );
            gesture.move(to);
            gesture.cancel();
            return at(last(h.show));
        };
        // The center is (150, 225); a corner 25 across and 12.5 down is half again
        expect(scaled("se", pointer(225, 262.5, { alt: true }))).toEqual([
            [75, 187.5],
            [225, 217.5],
            [150, 262.5],
        ]);
        // A side scales its own axis only, both sides moving
        const east = pointer(200, 225);
        expect(scaled("e", pointer(225, 225, { alt: true }), east)).toEqual([
            [75, 200],
            [225, 220],
            [150, 250],
        ]);
        // Keys add up: with constrain the side scales both ways, about the center
        expect(
            scaled("e", pointer(225, 225, { alt: true, ctrl: true }), east),
        ).toEqual([
            [75, 187.5],
            [225, 217.5],
            [150, 262.5],
        ]);
        // With fine as well, at a quarter of the speed
        expect(
            scaled("e", pointer(300, 225, { alt: true, shift: true }), east),
        ).toEqual([
            [75, 200],
            [225, 220],
            [150, 250],
        ]);
    });

    it("scales a side both ways with constrain, the opposite side fixed and centered across ($mod; #545)", () => {
        const h = host();
        const origin = pointer(200, 225);
        const gesture = new ScaleGesture(
            origin,
            FORMATION,
            h,
            "e",
            BOX,
            keysAt(origin),
        );
        gesture.move(pointer(250, 225, { ctrl: true }));
        gesture.cancel();
        expect(at(last(h.show))).toEqual([
            [100, 187.5],
            [250, 217.5],
            [175, 262.5],
        ]);
    });

    describe("keys pressed or released mid-drag, with no pointer move", () => {
        let gesture: ScaleGesture | undefined;
        afterEach(() => {
            gesture?.cancel();
            useTouchModifierStore.getState().clear();
        });

        it("keeps a corner's ratio while Ctrl is down, and frees it when it's up", () => {
            const h = host();
            const origin = pointer(200, 250);
            gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                "se",
                BOX,
                keysAt(origin),
            );
            gesture.move(pointer(250, 250));
            expect(scaleOf(last(h.show))).toEqual({ x: 1.5, y: 1 });
            key("keydown", { key: "Control", ctrlKey: true });
            expect(scaleOf(last(h.show))).toEqual({ x: 1.4, y: 1.4 });
            key("keyup", { key: "Control" });
            expect(scaleOf(last(h.show))).toEqual({ x: 1.5, y: 1 });
            expect(h.show).toHaveBeenCalledTimes(3);
        });

        it("scales from the center while Alt is down, and from the opposite side when it's up", () => {
            const h = host();
            const origin = pointer(200, 225);
            gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                "e",
                BOX,
                keysAt(origin),
            );
            gesture.move(pointer(225, 225));
            expect(last(h.show).map((p) => p.x)).toEqual([100, 225, 162.5]);
            key("keydown", { key: "Alt", altKey: true });
            expect(last(h.show).map((p) => p.x)).toEqual([75, 225, 150]);
            key("keyup", { key: "Alt" });
            expect(last(h.show).map((p) => p.x)).toEqual([100, 225, 162.5]);
            expect(h.show).toHaveBeenCalledTimes(3);
        });

        it("follows the pill's From center and Equal toggles as it does the keys", () => {
            const h = host();
            const origin = pointer(200, 225);
            gesture = new ScaleGesture(
                origin,
                FORMATION,
                h,
                "e",
                BOX,
                fieldKeys(origin, { isMac: false, onScreen: onScreenToggles }),
            );
            gesture.move(pointer(225, 225));
            useTouchModifierStore.getState().toggleLatched("fromCenter");
            expect(last(h.show).map((p) => p.x)).toEqual([75, 225, 150]);
            useTouchModifierStore.getState().setHeld("constrain", true);
            expect(at(last(h.show))).toEqual([
                [75, 187.5],
                [225, 217.5],
                [150, 262.5],
            ]);
        });
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

    it("snaps to 15°, and to whole degrees with fine (Shift)", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
        gesture.move(round(20));
        gesture.move(round(37));
        expect(gesture.angle()).toBe(30);
        expect(heading(last(h.show)) - home).toBeCloseTo(30);
        // Fine: the pointer's own angle, in whole degrees
        gesture.move(round(37.4, { shift: true }));
        expect(gesture.angle()).toBe(37);
        gesture.move(round(81, { shift: true }));
        expect(gesture.angle()).toBe(81);
    });

    it("isn't freed by Alt or constrain: 15° steps until the Snap toggle", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
        gesture.move(round(37, { alt: true, ctrl: true }));
        expect(gesture.angle()).toBe(30);
    });

    it("turns past half a turn", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
        for (let degrees = 30; degrees <= 270; degrees += 30)
            gesture.move(round(degrees));
        expect(gesture.angle()).toBe(270);
    });

    it("turns at full speed with fine, in whole degrees (user story 51)", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
        gesture.move(round(37));
        expect(gesture.angle()).toBe(30);
        // Fine doesn't slow the pointer: 40° more turns 40°
        gesture.move(round(37, { shift: true }));
        expect(gesture.angle()).toBe(37);
        gesture.move(round(77, { shift: true }));
        expect(gesture.angle()).toBe(77);
        // Fine from the press turns at full speed too
        const fromPress = new RotateGesture(
            rot,
            FORMATION,
            host(),
            BOX,
            keysAt(rot),
        );
        fromPress.move(round(53.2, { shift: true }));
        expect(fromPress.angle()).toBe(53);
    });

    describe("keys pressed or released mid-drag, with no pointer move", () => {
        let gesture: RotateGesture | undefined;
        afterEach(() => gesture?.cancel());

        it("re-runs the angle at the last pointer when fine turns on or off, with no jump", () => {
            const h = host();
            gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
            gesture.move(round(37));
            expect(gesture.angle()).toBe(30);
            key("keydown", { key: "Shift", shiftKey: true });
            // Re-run at the last pointer: whole degrees where the pointer is
            expect(gesture.angle()).toBe(37);
            expect(h.show).toHaveBeenCalledTimes(2);
            // Shift up: back to 15° steps where the pointer is
            key("keyup", { key: "Shift" });
            expect(gesture.angle()).toBe(30);
            // And down again: the same 37°, nothing carried over
            key("keydown", { key: "Shift", shiftKey: true });
            expect(gesture.angle()).toBe(37);
            gesture.move(round(77, { shift: true }));
            expect(gesture.angle()).toBe(77);
            key("keyup", { key: "Shift" });
            expect(gesture.angle()).toBe(75);
        });
    });

    it("drops the formation at the angle drawn", () => {
        const h = host();
        const gesture = new RotateGesture(rot, FORMATION, h, BOX, keysAt(rot));
        gesture.move(round(90));
        gesture.end(round(90));
        expect(heading(last(h.drop)) - home).toBeCloseTo(90);
        expect(gesture.center).toEqual({ x: 150, y: 225 });
    });
});
