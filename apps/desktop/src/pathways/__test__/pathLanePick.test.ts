import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdjustProfile } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import type { PathTarget } from "../pathTarget";

// The store is already loaded by the test setup, so it's loaded again with its writes stubbed
vi.resetModules();
const removeAdjustKey = vi.fn(async () => undefined);
const resetLaneAdjust = vi.fn(async () => undefined);
vi.doMock("@/db-functions/timelinePathAdjust", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/db-functions/timelinePathAdjust")
    >()),
    removeAdjustKey,
    resetLaneAdjust,
}));
const {
    clearPath,
    deleteOnLane,
    groupLineIds,
    openPath,
    selectLane,
    setHoverLane,
    setPathSelectionPort,
    showPath,
    usePathPenStore,
} = await import("../pathPenStore");
const { drawingOf, pathPenMode } = await import("../pathPenMode");
const { setShapeField } = await import("@/shapes/field/shapeField");

/**
 * What stays picked on a lane through a Delete and a read of the path (review of #781): Delete
 * never falls through to Remove path, a picked key is followed by its anchor, and a plain lane
 * writes nothing. Members 10 and 11; `dy` apart 0 stacks their lanes.
 */
const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const y = 20 * STEP;

const profile = (
    ...keys: [string, string, number, number][]
): AdjustProfile => ({
    v: 1,
    keys: keys.map(([a, b, f, d]) => ({ a, b, f, d: [0, d] })),
});

const group = (adjust: AdjustProfile | null, dy = 4 * STEP): PathTarget => ({
    timelineId: 1,
    transitionId: 8,
    marcherId: 10,
    start: 0,
    end: 16,
    from: { x: 0, y },
    to: { x: 40 * STEP, y },
    routeId: 9,
    points: [
        { id: "p", at: [10 * STEP, y] },
        { id: "q", at: [30 * STEP, y] },
    ],
    ends: { from: { x: 0, y }, to: { x: 40 * STEP, y } },
    group: {
        members: [10, 11].map((m, i) => ({
            marcherId: m,
            transitionId: 8,
            drill: `B${i + 1}`,
            offset: { x: 0, y: dy },
            from: { x: 0, y: y + dy },
            to: { x: 40 * STEP, y: y + dy },
            laneId: m,
            slot: i,
            adjust: m === 11 ? adjust : null,
        })),
        outside: [],
    },
});

/**
 * Both members bent by a key that moves nothing, their lanes where the plain ones run: editing the
 * group path, only bent lanes are drawn and grabbed (interaction round 4)
 */
const allBent = (dy = 4 * STEP): PathTarget => {
    const t = group(null, dy);
    return {
        ...t,
        group: {
            ...t.group!,
            members: t.group!.members.map((m) => ({
                ...m,
                adjust: profile(["p", "q", 0.5, 0]),
            })),
        },
    };
};

const lane = () => usePathPenStore.getState().session?.lane;
const open = (target: PathTarget) => {
    showPath(target, "2");
    openPath();
};
const bulge = profile(
    ["p", "q", 0.2, 0],
    ["p", "q", 0.5, 30],
    ["p", "q", 0.8, 0],
);

describe("a picked lane through Delete and a read of the path", () => {
    beforeEach(() => {
        removeAdjustKey.mockClear();
        resetLaneAdjust.mockClear();
    });
    afterEach(() => clearPath());

    it("follows the picked key when a key is added before it", () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: 1 });
        showPath(
            group(
                profile(
                    ["from", "p", 0.5, 12],
                    ["p", "q", 0.2, 0],
                    ["p", "q", 0.5, 30],
                    ["p", "q", 0.8, 0],
                ),
            ),
            "2",
        );
        expect(lane()).toEqual({ marcherId: 11, key: 2 });
    });

    it("keeps the picked key when a drag changes only how far it displaces", () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: 1 });
        showPath(
            group(
                profile(
                    ["p", "q", 0.2, 0],
                    ["p", "q", 0.5, 50],
                    ["p", "q", 0.8, 0],
                ),
            ),
            "2",
        );
        expect(lane()).toEqual({ marcherId: 11, key: 1 });
    });

    it("lets the key go, and keeps the lane, when an undo takes it away", () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: 1 });
        showPath(group(null), "2");
        expect(lane()).toEqual({ marcherId: 11, key: null, keyGone: true });
    });

    it("a second Delete after a key goes writes nothing, and the lane stays picked", async () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: 1 });
        await deleteOnLane(lane()!);
        expect(removeAdjustKey).toHaveBeenCalledTimes(1);
        expect(lane()).toEqual({ marcherId: 11, key: null, keyGone: true });
        await deleteOnLane(lane()!);
        expect(removeAdjustKey).toHaveBeenCalledTimes(1);
        expect(resetLaneAdjust).not.toHaveBeenCalled();
        expect(lane()).toEqual({ marcherId: 11, key: null, keyGone: true });
    });

    it("picking the lane again after a key went lets Delete reset it", async () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: 1 });
        await deleteOnLane(lane()!);
        selectLane({ marcherId: 11, key: null });
        expect(lane()?.keyGone).toBeUndefined();
        await deleteOnLane(lane()!);
        expect(resetLaneAdjust).toHaveBeenCalledTimes(1);
    });

    it("Delete on a plain lane writes nothing", async () => {
        open(group(null));
        selectLane({ marcherId: 10, key: null });
        await deleteOnLane(lane()!);
        expect(resetLaneAdjust).not.toHaveBeenCalled();
        expect(lane()).toEqual({ marcherId: 10, key: null });
    });
});

describe("the hover note on lanes", () => {
    const ZOOM = 2;
    beforeEach(() =>
        setShapeField({
            fieldProperties: () => fieldProperties,
            zoom: () => ZOOM,
            marchers: () => [],
            drawn: () => new Map(),
        }),
    );
    afterEach(() => {
        clearPath();
        setShapeField(null);
    });
    const over = (x: number, ly: number) =>
        pathPenMode.cursorAt(
            {
                field: { x, y: ly },
                screen: { x: x * ZOOM, y: ly * ZOOM },
                button: 0,
            } as FieldPointer,
            { reachesInside: () => false, isMac: false, onDot: () => false },
        );
    const hover = () => usePathPenStore.getState().session?.hoverLane;

    it("counts lanes lying on top of each other", () => {
        open(allBent());
        over(20 * STEP, y + 4 * STEP);
        expect(hover()?.stacked).toBe(2);
    });

    it("names the lane a click picked, with the pointer still; only that lane takes clicks then", () => {
        open(allBent());
        const at = {
            field: { x: 20 * STEP, y: y + 4 * STEP },
            screen: { x: 20 * STEP * ZOOM, y: (y + 4 * STEP) * ZOOM },
            button: 0,
        } as FieldPointer;
        over(20 * STEP, y + 4 * STEP);
        const click = () => {
            pathPenMode.press(at, {
                isMac: false,
                onDot: () => false,
            } as never);
            pathPenMode.release(at, null);
            return {
                picked: usePathPenStore.getState().session?.lane?.marcherId,
                named: hover()?.marcherId,
            };
        };
        expect(click()).toEqual({ picked: 10, named: 10 });
        // Adjusting 10, its lane is the only one drawn: the stacked lane under it isn't there
        expect(click()).toEqual({ picked: 10, named: 10 });
    });

    it("moves its note along the lane once the pointer has run far enough", () => {
        open(allBent());
        over(20 * STEP, y + 4 * STEP);
        const first = hover()!.at;
        over(20 * STEP + 2, y + 4 * STEP);
        expect(hover()!.at).toBe(first);
        over(26 * STEP, y + 4 * STEP);
        expect(hover()!.at.x).toBeCloseTo(26 * STEP);
    });
});

describe("one line reads as selected while a lane is worked on (AP-R11)", () => {
    const ZOOM = 2;
    beforeEach(() =>
        setShapeField({
            fieldProperties: () => fieldProperties,
            zoom: () => ZOOM,
            marchers: () => [],
            drawn: () => new Map(),
        }),
    );
    afterEach(() => {
        clearPath();
        setShapeField(null);
    });
    const at = (x: number, ly: number) =>
        ({
            field: { x, y: ly },
            screen: { x: x * ZOOM, y: ly * ZOOM },
            button: 0,
        }) as FieldPointer;
    const press = { isMac: false, onDot: () => false } as never;
    const drawn = () => drawingOf(usePathPenStore.getState().session)!;
    const laneY = y + 4 * STEP;

    it("draws only the picked lane, without the group line or its handles, but with its own spots to grab (rounds 2 and 3)", () => {
        open(group(null));
        expect(drawn().pathLine).toBe("edited");
        expect(drawn().handles?.length).toBeGreaterThan(0);
        selectLane({ marcherId: 11, key: null });
        expect(drawn().outline).toBeNull();
        expect(drawn().handles).toEqual([]);
        // The round spots are on the picked lane, not the group line's midpoints
        expect(drawn().addHandles?.length).toBeGreaterThan(0);
        for (const spot of drawn().addHandles ?? [])
            expect(spot.y).toBeCloseTo(laneY);
        expect(drawn().lanes).toHaveLength(1);
        expect(drawn().laneIds).toEqual([11]);
        expect(drawn().lanePicked).toBe(0);
        // Its end spot and start ghost only, not the whole group's
        expect(drawn().ringIds).toEqual([11]);
    });

    it("an adjusted lane is drawn over its plain lane, faint", () => {
        open(group(bulge));
        selectLane({ marcherId: 11, key: null });
        expect(drawn().lanes).toHaveLength(2);
        expect(drawn().laneIds).toEqual([11, 11]);
        expect(drawn().lanePicked).toBe(1);
    });

    it("tints a hovered lane while the group path is edited", () => {
        open(allBent(8 * STEP));
        setHoverLane({ marcherId: 11, at: { x: 0, y: 0 } });
        expect(drawn().laneHighlights).toEqual([1]);
    });

    it("edited, a plain member's lane isn't drawn, nor pressed: only the bent ones (round 4)", () => {
        open(group(bulge, 8 * STEP));
        expect(drawn().laneIds).toEqual([11]);
        expect(drawn().lanesAdjusted).toEqual([0]);
        clearPath();
        open(group(null, 8 * STEP));
        expect(drawn().lanes ?? []).toEqual([]);
        expect(pathPenMode.claims(at(20 * STEP, y + 8 * STEP), press)).toBe(
            false,
        );
        // Edit <name>'s line draws it, to edit
        selectLane({ marcherId: 11, key: null });
        expect(drawn().laneIds).toEqual([11]);
        expect(pathPenMode.claims(at(20 * STEP, y + 8 * STEP), press)).toBe(
            true,
        );
    });

    it("edited, the group line is the deep one and the lanes round it are faint (round 3)", () => {
        open(group(null, 8 * STEP));
        expect(drawn().pathLine).toBe("edited");
        expect(drawn().lanesWeight).toBe("quiet");
    });

    it("can't grab a group point while a lane is picked", () => {
        open(group(null));
        const point = at(10 * STEP, y);
        expect(pathPenMode.claims(point, press)).toBe(true);
        selectLane({ marcherId: 11, key: null });
        expect(pathPenMode.claims(point, press)).toBe(false);
    });

    it("the group line isn't there to click while a lane is adjusted; Edit path brings it back", () => {
        open(group(null));
        selectLane({ marcherId: 11, key: null });
        expect(pathPenMode.takeClick(at(20 * STEP, y), false)).toBe(false);
        openPath();
        expect(lane()).toBeNull();
        expect(drawn().pathLine).toBe("edited");
        expect(drawn().handles?.length).toBeGreaterThan(0);
    });

    it("the muted line wins over a lane that isn't picked", () => {
        const target = group(null);
        const [onLine, off] = target.group!.members;
        target.group = {
            ...target.group!,
            members: [
                {
                    ...onLine!,
                    offset: { x: 0, y: 0 },
                    from: { x: 0, y },
                    to: { x: 40 * STEP, y },
                },
                off!,
            ],
        };
        open(target);
        selectLane({ marcherId: 11, key: null });
        expect(pathPenMode.claims(at(20 * STEP, y), press)).toBe(false);
        expect(pathPenMode.claims(at(20 * STEP, laneY), press)).toBe(true);
    });

    it("the picked lane wins over the muted line where they lie together", () => {
        open(group(null, 0));
        selectLane({ marcherId: 11, key: null });
        const on = at(20 * STEP, y);
        expect(pathPenMode.claims(on, press)).toBe(true);
        pathPenMode.press(on, press);
        pathPenMode.release(on, null);
        expect(lane()).toEqual({ marcherId: 11, key: null });
    });

    it("mutes the group path as soon as an unpicked lane is dragged, and the drag picks it", () => {
        open(allBent());
        const on = at(20 * STEP, laneY);
        pathPenMode.press(on, press);
        pathPenMode.move(at(20 * STEP, laneY + 3 * STEP));
        expect(drawn().pathLine).toBe("context");
        expect(lane()).toBeNull();
        pathPenMode.release(at(20 * STEP, laneY + 3 * STEP), null);
        expect(lane()?.marcherId).toBe(10);
        expect(drawn().pathLine).toBe("context");
    });
});

describe("a lane is its marcher (interaction system, rule 1)", () => {
    const ZOOM = 2;
    const picked = { ids: [] as readonly number[] };
    beforeEach(() => {
        picked.ids = [];
        setPathSelectionPort({
            get: () => picked.ids,
            set: (ids) => {
                picked.ids = ids;
            },
        });
        setShapeField({
            fieldProperties: () => fieldProperties,
            zoom: () => ZOOM,
            marchers: () => [],
            drawn: () => new Map(),
        });
    });
    afterEach(() => {
        clearPath();
        setPathSelectionPort(null);
        setShapeField(null);
    });
    const at = (x: number, ly: number, shift = false) =>
        ({
            field: { x, y: ly },
            screen: { x: x * ZOOM, y: ly * ZOOM },
            button: 0,
            shift,
        }) as FieldPointer;
    const press = { isMac: false, onDot: () => false } as never;
    const laneAt = at(20 * STEP, y + 4 * STEP);
    const click = (p: FieldPointer) => {
        pathPenMode.press(p, press);
        pathPenMode.release(p, null);
    };

    it("a click on a lane of the active group path selects that marcher and picks its lane", () => {
        open(allBent());
        picked.ids = [10, 11];
        click(laneAt);
        expect(picked.ids).toEqual([10]);
        expect(lane()).toEqual({ marcherId: 10, key: null });
    });

    it("Shift-click on a lane adds its marcher, or takes it out", () => {
        open(allBent());
        picked.ids = [11];
        click(at(20 * STEP, y + 4 * STEP, true));
        expect([...picked.ids].sort()).toEqual([10, 11]);
        expect(lane()?.marcherId).toBe(10);
        // 10's lane is the one adjusted now, the only one to click: Shift takes 10 out
        click(at(20 * STEP, y + 4 * STEP, true));
        expect(picked.ids).toEqual([11]);
        expect(lane()).toBeNull();
    });

    it("on the quiet path, a click on a selected marcher's line selects it and makes its lane active", () => {
        usePathPenStore.setState({ ownable: [10] });
        showPath(group(null), "2");
        // Quiet, only the selected marchers' lines are drawn, as each one's own path
        const quiet = drawingOf(usePathPenStore.getState().session)!;
        expect(quiet.outline).toBeNull();
        expect(quiet.lanesWeight).toBe("quiet");
        expect(quiet.laneIds).toEqual([10]);
        expect(pathPenMode.takeClick(laneAt, false)).toBe(true);
        expect(picked.ids).toEqual([10]);
        expect(usePathPenStore.getState().session).toMatchObject({
            phase: "open",
            lane: { marcherId: 10, key: null },
        });
        usePathPenStore.setState({ ownable: [] });
    });

    it("quiet, only the selected marcher's line is drawn, and the group line isn't there to click", () => {
        usePathPenStore.setState({ ownable: [11] });
        showPath(group(null, 8 * STEP), "2");
        const quiet = drawingOf(usePathPenStore.getState().session)!;
        expect(quiet.laneIds).toEqual([11]);
        expect(quiet.ringIds).toEqual([11]);
        expect(pathPenMode.takeClick(at(20 * STEP, y), false)).toBe(false);
        usePathPenStore.setState({ ownable: [] });
    });
});

describe("one line for what you selected: the whole group (interaction round 4)", () => {
    const ZOOM = 2;
    const picked = { ids: [] as readonly number[] };
    beforeEach(() => {
        picked.ids = [];
        setPathSelectionPort({
            get: () => picked.ids,
            set: (ids) => {
                picked.ids = ids;
            },
        });
        setShapeField({
            fieldProperties: () => fieldProperties,
            zoom: () => ZOOM,
            marchers: () => [],
            drawn: () => new Map(),
        });
    });
    afterEach(() => {
        clearPath();
        usePathPenStore.setState({ ownable: [] });
        setPathSelectionPort(null);
        setShapeField(null);
    });
    const at = (x: number, ly: number) =>
        ({
            field: { x, y: ly },
            screen: { x: x * ZOOM, y: ly * ZOOM },
            button: 0,
            shift: false,
        }) as FieldPointer;
    const drawn = () => drawingOf(usePathPenStore.getState().session)!;
    const quietWhole = (target: PathTarget) => {
        picked.ids = [10, 11];
        usePathPenStore.setState({ ownable: [10, 11] });
        showPath(target, "2");
    };

    it("draws only the group line, deep, and none of the members' lanes", () => {
        quietWhole(group(null, 8 * STEP));
        expect(drawn().outline).not.toBeNull();
        expect(drawn().pathLine).toBe("shown");
        expect(drawn().lanes ?? []).toEqual([]);
        // Every member's end spot and start ghost still shows
        expect(drawn().ringIds).toEqual([10, 11]);
        // Their own walked paths give way to the group line
        expect(
            groupLineIds(usePathPenStore.getState().session!, [10, 11]),
        ).toEqual([10, 11]);
    });

    it("a bent member keeps a faint line, marked, which a click doesn't land on", () => {
        quietWhole(group(bulge, 8 * STEP));
        expect(drawn().laneIds).toEqual([11]);
        expect(drawn().lanesWeight).toBe("quiet");
        expect(drawn().lanesAdjusted).toEqual([0]);
        // 11's lane, off the group line: not a hit target while the whole group is selected
        expect(pathPenMode.takeClick(at(5 * STEP, y + 8 * STEP), false)).toBe(
            false,
        );
        expect(usePathPenStore.getState().session?.phase).toBe("closed");
    });

    it("a click on the group line makes the group path active, its handles on the group line", () => {
        quietWhole(group(null, 8 * STEP));
        expect(pathPenMode.takeClick(at(20 * STEP, y), false)).toBe(true);
        expect([...picked.ids].sort()).toEqual([10, 11]);
        const s = usePathPenStore.getState().session!;
        expect(s.phase).toBe("open");
        expect(s.lane ?? null).toBeNull();
        expect(drawn().pathLine).toBe("edited");
        expect(drawn().handles?.length).toBeGreaterThan(0);
        for (const h of drawn().handles ?? []) expect(h.y).toBeCloseTo(y);
    });

    it("one member selected is that marcher's own line, as before", () => {
        picked.ids = [11];
        usePathPenStore.setState({ ownable: [11] });
        showPath(group(null, 8 * STEP), "2");
        expect(drawn().outline).toBeNull();
        expect(drawn().laneIds).toEqual([11]);
    });
});
