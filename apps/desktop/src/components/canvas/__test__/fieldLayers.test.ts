import { describe, expect, it } from "vitest";
import {
    aroundPoints,
    belowLayers,
    boxAround,
    clearSpot,
    clearSpotOf,
    coverInset,
    FINGER_REACH,
    LAYER_GAP,
    liftClear,
    obstaclesOf,
    overlapArea,
    overlaps,
    rowsAround,
    type Rect,
} from "../fieldLayers";
import {
    choosePillPosition,
    coversHandle,
    layersKey,
    pillSpotScore,
} from "../touch/pillPlacement";

// The field at 1180 × 820 landscape with the Inspector open (finding A): 747 × 556 px
const FIELD: Rect = { left: 0, top: 0, width: 747, height: 556 };
// The zoom box in its bottom-right corner, in the touch layout's size
const ZOOM: Rect = { left: 571, top: 451, width: 170, height: 99 };
// The Inspector's edge tab hanging over the field's right edge, at mid-height
const INSPECTOR_TAB: Rect = { left: 723, top: 234, width: 44, height: 88 };

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

describe("overlaps", () => {
    it("counts the gap between two boxes", () => {
        const a = { left: 0, top: 0, width: 10, height: 10 };
        const b = { left: 14, top: 0, width: 10, height: 10 };
        expect(overlaps(a, b)).toBe(false);
        expect(overlaps(a, b, 8)).toBe(true);
    });
});

describe("clearSpot: the shape editor bar keeps clear of controls", () => {
    it("stays where it is when nothing is in the way", () => {
        const bar = { left: 100, top: 300, width: 400, height: 80 };
        expect(clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD)).toEqual({
            left: 100,
            top: 300,
            clear: true,
        });
    });

    it("slides left off the zoom box after a handle drag (finding A)", () => {
        const bar = { left: 215, top: 438, width: 528, height: 115 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        expect(spot.top).toBe(bar.top);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.left - LAYER_GAP,
        );
        expect(spot.left).toBeGreaterThanOrEqual(0);
    });

    it("slides left off the Inspector's edge tab (06b)", () => {
        const bar = { left: 195, top: 250, width: 545, height: 80 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        expect(spot.top).toBe(bar.top);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            INSPECTOR_TAB.left - LAYER_GAP,
        );
    });

    it("goes up when there's no room beside the control", () => {
        const bar = { left: 10, top: 440, width: 720, height: 60 };
        const spot = clearSpot(bar, [ZOOM], FIELD);
        expect(spot.left).toBe(bar.left);
        expect(bottom({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.top - LAYER_GAP,
        );
    });

    it("keeps clear of two controls at once", () => {
        const bar = { left: 300, top: 280, width: 440, height: 220 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        const moved = { ...bar, ...spot };
        expect(overlaps(moved, ZOOM, LAYER_GAP)).toBe(false);
        expect(overlaps(moved, INSPECTOR_TAB, LAYER_GAP)).toBe(false);
    });

    it("stays where it is when no spot inside the field is clear", () => {
        const bar = { left: 0, top: 0, width: 747, height: 556 };
        expect(clearSpot(bar, [ZOOM], FIELD)).toEqual({
            left: 0,
            top: 0,
            clear: false,
        });
    });

    it("slides along even when it already runs past the field's bottom", () => {
        const bar = { left: 300, top: 500, width: 400, height: 80 };
        const spot = clearSpot(bar, [ZOOM], FIELD);
        expect(spot.top).toBe(500);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.left - LAYER_GAP,
        );
    });
});

describe("liftClear: the zoom box rises above a task's card", () => {
    it("doesn't move with nothing in the way", () => {
        expect(liftClear(ZOOM, [], 0)).toBe(0);
    });

    it("rises above the prop tool's card", () => {
        const card = { left: 370, top: 500, width: 440, height: 140 };
        const lift = liftClear(ZOOM, [card], 0);
        expect(lift).not.toBeNull();
        expect(bottom(ZOOM) - lift!).toBeLessThanOrEqual(card.top - LAYER_GAP);
    });

    it("rises above stacked cards", () => {
        const low = { left: 500, top: 480, width: 300, height: 60 };
        const high = { left: 500, top: 380, width: 300, height: 90 };
        const lift = liftClear(ZOOM, [low, high], 0)!;
        const moved = { ...ZOOM, top: ZOOM.top - lift };
        expect(overlaps(moved, low, LAYER_GAP)).toBe(false);
        expect(overlaps(moved, high, LAYER_GAP)).toBe(false);
    });

    it("has no spot when the card reaches the top", () => {
        const tall = { left: 500, top: 50, width: 300, height: 500 };
        expect(liftClear(ZOOM, [tall], 0)).toBeNull();
    });
});

describe("coverInset: the field's top bars sit below the toolbar panel", () => {
    it("is how far the panel reaches over the field", () => {
        const panel = { left: 0, top: -16, width: 700, height: 100 };
        expect(coverInset(FIELD, [panel])).toBe(84);
    });

    it("is nothing for a closed panel, or one beside the field", () => {
        expect(
            coverInset(FIELD, [{ left: 0, top: 0, width: 0, height: 0 }]),
        ).toBe(0);
        expect(
            coverInset(FIELD, [{ left: 800, top: 0, width: 100, height: 100 }]),
        ).toBe(0);
    });
});

describe("the pill keeps clear of the task's cards and bars", () => {
    const container = { width: 747, height: 556 };
    const pill = { width: 690, height: 56 };
    // Marchers along the field's bottom: every bottom spot covers some (finding B)
    const marchers = Array.from({ length: 30 }, (_, i) => ({
        x: 20 + i * 24,
        y: 520,
    }));
    const pillRect = (p: { left: number; bottom: number }): Rect => ({
        left: p.left,
        top: container.height - p.bottom - pill.height,
        ...pill,
    });

    it("leaves the top to the line tool's card", () => {
        const card = { left: 150, top: 12, width: 450, height: 52 };
        const spot = choosePillPosition(container, pill, null, marchers, [
            ZOOM,
            card,
        ]);
        expect(overlaps(pillRect(spot), card)).toBe(false);
    });

    it("leaves the top to the isolation bar and the toolbar panel", () => {
        const panel = { left: 0, top: -20, width: 700, height: 100 };
        const bar = { left: 100, top: 88, width: 540, height: 44 };
        const spot = choosePillPosition(container, pill, null, marchers, [
            ZOOM,
            panel,
            bar,
        ]);
        const at = pillRect(spot);
        expect(overlaps(at, panel)).toBe(false);
        expect(overlaps(at, bar)).toBe(false);
    });
});

describe("the pill slides along a spot that's in the way", () => {
    it("keeps off both the zoom box and the Inspector's tab at 1180 × 820 (Inspector open)", () => {
        const container = { width: 747, height: 556 };
        const pill = { width: 643, height: 50 };
        // The zoom box and the tab, in the field's pixels
        const zoom = { left: 571, top: 451, width: 170, height: 99 };
        const tab = { left: 711, top: 313, width: 44, height: 113 };
        const spot = choosePillPosition(container, pill, null, [], [zoom, tab]);
        const at = {
            left: spot.left,
            top: container.height - spot.bottom - pill.height,
            ...pill,
        };
        expect(overlaps(at, zoom)).toBe(false);
        expect(overlaps(at, tab)).toBe(false);
        expect(at.top).toBeGreaterThan(container.height / 2);
    });
});

describe("obstacles on the field (#933)", () => {
    it("keeps a finger's reach around each handle", () => {
        expect(aroundPoints([{ x: 100, y: 50 }])).toEqual([
            {
                left: 100 - FINGER_REACH,
                top: 50 - FINGER_REACH,
                width: 2 * FINGER_REACH,
                height: 2 * FINGER_REACH,
            },
        ]);
    });

    it("boxes a whole outline, a finger's reach out", () => {
        expect(
            boxAround(
                [
                    { x: 10, y: 20 },
                    { x: 110, y: 80 },
                    { x: 60, y: 40 },
                ],
                5,
            ),
        ).toEqual({ left: 5, top: 15, width: 110, height: 70 });
        expect(boxAround([])).toBeNull();
    });

    it("counts the handles in the area, so the rotate knob above a box is inside it", () => {
        const corners = [
            { x: 100, y: 100 },
            { x: 200, y: 200 },
        ];
        const knob = { x: 150, y: 60 };
        const { handles, areas } = obstaclesOf([...corners, knob], corners);
        expect(handles).toHaveLength(3);
        expect(areas).toHaveLength(1);
        expect(areas[0].top).toBe(60 - FINGER_REACH);
    });

    it("measures how much two boxes overlap", () => {
        const a = { left: 0, top: 0, width: 10, height: 10 };
        expect(overlapArea(a, { left: 5, top: 5, width: 10, height: 10 })).toBe(
            25,
        );
        expect(
            overlapArea(a, { left: 20, top: 0, width: 10, height: 10 }),
        ).toBe(0);
    });

    it("clears the first list it can, most to keep off first", () => {
        const rect = { left: 0, top: 0, width: 100, height: 40 };
        const wall = { left: 0, top: 0, width: 747, height: 556 };
        const small = { left: 10, top: 10, width: 20, height: 20 };
        // Nowhere clears the wall, so it clears the small box
        const spot = clearSpotOf(rect, [[wall, small], [small]], FIELD);
        expect(spot.clear).toBe(true);
        expect(overlaps({ ...rect, ...spot }, small, LAYER_GAP)).toBe(false);
    });

    it("drops below the layers it would be under", () => {
        const card = { left: 100, top: 12, width: 400, height: 80 };
        const tag = { left: 300, top: 6, width: 60, height: 20 };
        expect(belowLayers(tag, [card])).toBe(12 + 80 + LAYER_GAP);
        // One beside it doesn't move it
        expect(belowLayers({ ...tag, left: 600 }, [card])).toBe(6);
    });
});

describe("the pill keeps off what's dragged on the field (#933)", () => {
    const container = { width: 747, height: 556 };
    const pill = { width: 645, height: 50 };
    const at = (p: { left: number; bottom: number }): Rect => ({
        left: p.left,
        top: container.height - p.bottom - pill.height,
        ...pill,
    });
    /** A box's eight handles, and its rotate knob 40 px above its top middle */
    const boxHandles = (l: number, t: number, r: number, b: number) => {
        const cx = (l + r) / 2;
        const cy = (t + b) / 2;
        return [
            { x: l, y: t },
            { x: cx, y: t },
            { x: r, y: t },
            { x: r, y: cy },
            { x: r, y: b },
            { x: cx, y: b },
            { x: l, y: b },
            { x: l, y: cy },
            { x: cx, y: t - 40 },
        ];
    };
    const coversAny = (r: Rect, rects: readonly Rect[]) =>
        rects.some((o) => overlaps(r, o));
    const PANEL = { left: 0, top: 0, width: 747, height: 60 };
    const DISPLAY_BAR = { left: 683, top: 10, width: 58, height: 123 };
    const TAB = { left: 711, top: 323, width: 44, height: 113 };

    it("leaves the box's top handles free after a handle drag (finding A)", () => {
        // The editor moved to the field's top; the box's top handles are just below it
        const editor = { left: 148, top: 68, width: 525, height: 115 };
        const handles = boxHandles(374, 220, 612, 438).slice(0, 8);
        const obstacles = obstaclesOf(handles, handles);
        const controls = [PANEL, editor, DISPLAY_BAR, ZOOM, TAB];
        const spot = at(
            choosePillPosition(container, pill, null, [], controls, obstacles),
        );
        expect(coversAny(spot, controls)).toBe(false);
        expect(coversAny(spot, obstacles.handles)).toBe(false);
    });

    it("leaves the selection's rotate knob free (03 with a selection)", () => {
        // 17 marchers selected at 267%, the knob at (225, 155) in the field's pixels
        const handles = boxHandles(30, 195, 420, 470);
        const obstacles = obstaclesOf(handles, handles);
        const marchers = Array.from({ length: 17 }, (_, i) => ({
            x: 50 + (i % 6) * 70,
            y: 220 + Math.floor(i / 6) * 100,
        }));
        const controls = [PANEL, DISPLAY_BAR, ZOOM];
        const spot = at(
            choosePillPosition(
                container,
                pill,
                null,
                marchers,
                controls,
                obstacles,
            ),
        );
        const knob = aroundPoints([handles[8]])[0];
        expect(overlaps(spot, knob)).toBe(false);
        expect(coversAny(spot, obstacles.handles)).toBe(false);
        expect(coversAny(spot, controls)).toBe(false);
    });

    it("covers the field inside a box rather than its handles when the box fills the field", () => {
        const handles = boxHandles(30, 60, 717, 526);
        const obstacles = obstaclesOf(handles, handles);
        const spot = at(
            choosePillPosition(container, pill, null, [], [], obstacles),
        );
        expect(coversAny(spot, obstacles.areas)).toBe(true);
        expect(coversAny(spot, obstacles.handles)).toBe(false);
    });

    /** Handle squares every 30 px over the whole field: no spot clears them, nor slides off */
    const everywhere = () => {
        const handles: { x: number; y: number }[] = [];
        for (let y = 0; y <= container.height; y += 30)
            for (let x = 0; x <= container.width; x += 30)
                handles.push({ x, y });
        return { handles: aroundPoints(handles), areas: [] };
    };

    it("covers a handle rather than a control when it must", () => {
        const obstacles = everywhere();
        const spot = at(
            choosePillPosition(container, pill, null, [], [ZOOM], obstacles),
        );
        expect(overlaps(spot, ZOOM)).toBe(false);
        expect(coversAny(spot, obstacles.handles)).toBe(true);
    });

    it("takes a top spot clear of handles over a bottom spot that covers some", () => {
        // Handles over the field's bottom half, too many rows to slide off; the top is clear
        const handles = everywhere().handles.filter(
            (h) => h.top > container.height / 2,
        );
        const spot = at(
            choosePillPosition(container, pill, null, [], [], {
                handles,
                areas: [],
            }),
        );
        expect(coversAny(spot, handles)).toBe(false);
        expect(spot.top).toBeLessThan(container.height / 2);
    });
});

describe("how bad a pill spot is (#933)", () => {
    const none = {
        overControl: false,
        overHandles: 0,
        overArea: false,
        covered: 0,
        top: false,
        fieldArea: 0,
    };
    it("puts a handle before a box, a box before marchers, the top and the field", () => {
        const handle = pillSpotScore({ ...none, overHandles: 1 });
        const area = pillSpotScore({ ...none, overArea: true });
        const rest = pillSpotScore({
            ...none,
            covered: 200,
            top: true,
            fieldArea: 747 * 556,
        });
        expect(handle).toBeGreaterThan(area);
        expect(area).toBeGreaterThan(rest);
        // Each handle counts
        expect(pillSpotScore({ ...none, overHandles: 2 })).toBeGreaterThan(
            handle,
        );
        // A control is still worst
        expect(pillSpotScore({ ...none, overControl: true })).toBeGreaterThan(
            pillSpotScore({ ...none, overHandles: 9, overArea: true }),
        );
    });

    it("tells a pill on a handle, and layers that moved by a whole px", () => {
        const pill = { left: 0, top: 0, width: 100, height: 40 };
        const near = { handles: aroundPoints([{ x: 110, y: 20 }]), areas: [] };
        const far = { handles: aroundPoints([{ x: 200, y: 20 }]), areas: [] };
        expect(coversHandle(pill, near)).toBe(true);
        expect(coversHandle(pill, far)).toBe(false);
        expect(layersKey([{ ...pill, left: 0.2 }])).toBe(layersKey([pill]));
        expect(layersKey([{ ...pill, left: 3 }])).not.toBe(layersKey([pill]));
    });
});

describe("rowsAround (#933 review)", () => {
    it("makes one box per row of slots, keeping the gaps between rows", () => {
        const slots = [0, 1, 2, 3].flatMap((col) =>
            [100, 110, 200].map((y) => ({ x: 50 + col * 20, y })),
        );
        const rows = rowsAround(slots, 10);
        // 100 and 110 share a row; 200 is a row of its own
        expect(rows).toEqual([
            { left: 40, top: 90, width: 80, height: 30 },
            { left: 40, top: 190, width: 80, height: 20 },
        ]);
    });
});
