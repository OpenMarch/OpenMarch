import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    FieldEditor,
    type FieldEditorPorts,
    type FieldPointer,
} from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import {
    actionLabelNow,
    isActionEnabled,
    runAction,
} from "@/shortcuts/registry";
import {
    PATH_FIELD_MENU,
    drawingOf,
    objectDrawingOf,
    pathPenMode,
} from "../pathPenMode";
import {
    clearPath,
    openPath,
    pathMarcherIds,
    activatePath,
    setPathHidden,
    setPathSelectionPort,
    setPathObjects,
    showPath,
    usePathPenStore,
    type PathObject,
} from "../pathPenStore";
import type { Resolver } from "@openmarch/core";
import type { MoveRoute } from "@/db-functions/timelineRoutes";
import {
    moveIsAt,
    pathObjectsAt,
    targetOfRoute,
    type PathObjectIndex,
    type PathTarget,
} from "../pathTarget";
import { PathPenKeys } from "../usePathPen";

/**
 * Paths on the field, the interaction system (rules 1 and 2): a click or tap on a path's line
 * selects the marchers who walk it (with nothing selected too when Paths All draws it, AP-O2,
 * AP-O7) and makes the path active; a right-click selects them and opens the Path group; Escape
 * makes it quiet; Delete removes the active path (Q7). Dragging a dot, or a quiet line, is never
 * the path's (P-1, Q6).
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const ZOOM = 2;

/** One marcher's own path: (0, 0) → corner (4, 4) steps → (8, 0) steps */
const own = (routeId: number): PathTarget => ({
    timelineId: 1,
    transitionId: 7,
    marcherId: 3,
    start: 0,
    end: 8,
    from: { x: 0, y: 0 },
    to: { x: 8 * STEP, y: 0 },
    routeId,
    points: [{ id: "c1", at: [4 * STEP, 4 * STEP] }],
    ends: { from: { x: 0, y: 0 }, to: { x: 8 * STEP, y: 0 } },
    group: null,
});

/** A group path of two members 2 steps either side of a line along y = 20 steps */
const group = (routeId: number): PathTarget => {
    const y = 20 * STEP;
    return {
        timelineId: 1,
        transitionId: 8,
        marcherId: 10,
        start: 0,
        end: 8,
        from: { x: 0, y },
        to: { x: 16 * STEP, y },
        routeId,
        points: [{ id: "g1", at: [8 * STEP, y + 4 * STEP] }],
        ends: { from: { x: 0, y }, to: { x: 16 * STEP, y } },
        group: {
            members: [10, 11].map((m, i) => {
                const dy = (i === 0 ? -2 : 2) * STEP;
                return {
                    marcherId: m,
                    transitionId: 8,
                    drill: `B${i + 1}`,
                    offset: { x: 0, y: dy },
                    from: { x: 0, y: y + dy },
                    to: { x: 16 * STEP, y: y + dy },
                };
            }),
            outside: [],
        },
    };
};

const groupObject = (routeId = 9): PathObject => ({
    target: group(routeId),
    drill: "2",
    walk: null,
});
/** An own path object: Paths All draws its walk, a straight line along y = 40 steps here */
const ownObject = (routeId = 5): PathObject => ({
    target: { ...own(routeId), marcherId: 4 },
    drill: "T4",
    walk: () => [
        { x: 0, y: 40 * STEP },
        { x: 8 * STEP, y: 40 * STEP },
    ],
});

const at = (x: number, y: number, button = 0): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
});

/** On the own path's first leg */
const ON_OWN = at(2 * STEP, 2 * STEP);
/** On the group path's reference line, before its point */
const ON_GROUP = at(0.5 * STEP, 20.25 * STEP);
/** On a group lane only (2 steps off the reference line, at its start) */
const ON_LANE = at(0.1 * STEP, 18 * STEP);
/** On the own path object's drawn walk */
const ON_WALK = at(4 * STEP, 40 * STEP);
const EMPTY = at(30 * STEP, 30 * STEP);

const session = () => usePathPenStore.getState().session;

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
    act(() => {
        clearPath();
        setPathObjects([]);
        setPathHidden(false);
    });
    setPathSelectionPort(null);
    cleanup();
    setShapeField(null);
});

/** The selection the pen writes, as the field's editor would hold it */
const picked = { ids: [] as readonly number[] };
const selectedNow = () => [...picked.ids].sort((a, b) => a - b);

describe("a click on a path's line selects its walkers (interaction system, rule 1)", () => {
    it("on the shown path's line: its marcher is selected and the path is active at once", () => {
        showPath(own(5), "T4");
        expect(pathPenMode.takeClick(ON_OWN, false)).toBe(true);
        expect(selectedNow()).toEqual([3]);
        expect(session()).toMatchObject({ phase: "open", object: false });
        expect(session()!.target.routeId).toBe(5);
    });

    it("on Paths All's group path: every member on its line, the one marcher on its lane", () => {
        setPathObjects([groupObject(9)]);
        expect(pathPenMode.takeClick(ON_GROUP, false)).toBe(true);
        expect(selectedNow()).toEqual([10, 11]);
        expect(session()).toMatchObject({ phase: "open" });
        expect(session()!.target.routeId).toBe(9);
        // The path read for the new selection opens too (`openRoute`)
        expect(usePathPenStore.getState().openRoute).toBe(9);
        act(() => {
            clearPath();
            picked.ids = [];
        });
        expect(pathPenMode.takeClick(ON_LANE, false)).toBe(true);
        expect(selectedNow()).toEqual([10]);
        expect(session()!.lane).toEqual({ marcherId: 10, key: null });
    });

    it("on an own path's drawn walk: that marcher", () => {
        setPathObjects([ownObject(5)]);
        expect(pathPenMode.takeClick(ON_WALK, false)).toBe(true);
        expect(selectedNow()).toEqual([4]);
        expect(session()).toMatchObject({ phase: "open", drill: "T4" });
    });

    it("keeps a selection that's already some of its walkers; Shift adds them", () => {
        setPathObjects([groupObject(9)]);
        picked.ids = [11];
        pathPenMode.takeClick(ON_GROUP, false);
        expect(selectedNow()).toEqual([11]);
        expect(usePathPenStore.getState().openRoute).toBeNull();
        act(() => clearPath());
        picked.ids = [2];
        pathPenMode.takeClick({ ...ON_GROUP, shift: true }, false);
        expect(selectedNow()).toEqual([2, 10, 11]);
    });

    it("a miss is the field's, and the pointer shows over a line only", () => {
        setPathObjects([groupObject(9), ownObject(5)]);
        expect(pathPenMode.takeClick(EMPTY, false)).toBe(false);
        expect(session()).toBeNull();
        expect(pathPenMode.cursorAt(ON_GROUP)).toBe("pointer");
        expect(pathPenMode.cursorAt(ON_WALK)).toBe("pointer");
        expect(pathPenMode.cursorAt(EMPTY)).toBeNull();
    });

    it("a press on a quiet path's line is never the path's: a drag from there is the field's marquee (P-1, Q6)", () => {
        setPathObjects([groupObject(9)]);
        const press = { reachesInside: () => false, isMac: false };
        expect(pathPenMode.claims(ON_GROUP, press)).toBe(false);
        showPath(group(9), "2");
        expect(pathPenMode.claims(ON_LANE, press)).toBe(false);
    });
});

describe("quiet and active (interaction system, rule 2)", () => {
    it("a double-click opens nothing more than a click; Escape makes the path quiet", () => {
        render(<PathPenKeys />);
        setPathObjects([groupObject(9)]);
        act(() => void pathPenMode.takeClick(ON_GROUP, false));
        act(() => void pathPenMode.takeClick(ON_GROUP, true));
        expect(session()).toMatchObject({ phase: "open", object: false });
        expect(drawingOf(session())!.pathLine).toBe("edited");
        expect(actionLabelNow("cancelAlignmentUpdates")).toBe("Close path");
        act(() => void runAction("cancelAlignmentUpdates"));
        expect(session()).toMatchObject({ phase: "closed" });
        expect(drawingOf(session())!.pathLine).toBe("shown");
        expect(selectedNow()).toEqual([10, 11]);
    });

    it("the second click of the double-click that made it active adds no point on a midpoint", () => {
        showPath(own(5), "T4");
        pathPenMode.takeClick(ON_OWN, false);
        expect(session()!.phase).toBe("open");
        let saving = false;
        const unsubscribe = usePathPenStore.subscribe((s) => {
            saving ||= s.saving;
        });
        const press = { reachesInside: () => false, isMac: false };
        expect(pathPenMode.claims(ON_OWN, press)).toBe(true);
        pathPenMode.press(ON_OWN, { isMac: false });
        pathPenMode.release(ON_OWN, { double: true, ownFirst: false });
        unsubscribe();
        expect(saving).toBe(false);
        expect(session()!.points).toHaveLength(1);
    });

    it("a right-click (or long press) on a line selects its walkers, shows it quiet and offers the Path group", () => {
        setPathObjects([groupObject(9)]);
        expect(pathPenMode.fieldMenuAt(ON_GROUP)).toEqual(PATH_FIELD_MENU);
        expect(session()).toMatchObject({ phase: "closed", object: false });
        expect(selectedNow()).toEqual([10, 11]);
        expect(pathPenMode.fieldMenuAt(EMPTY)).toBeNull();
    });

    it("a click on the active path's line keeps it active; with a lane picked it lets the lane go", () => {
        activatePath(group(9), "2", 10);
        picked.ids = [10];
        expect(pathPenMode.takeClick(ON_GROUP, false)).toBe(true);
        expect(session()).toMatchObject({ phase: "open", lane: null });
        expect(selectedNow()).toEqual([10, 11]);
        expect(pathPenMode.takeClick(ON_GROUP, false)).toBe(true);
        expect(session()!.phase).toBe("open");
    });

    it("a click on another path makes that one active", () => {
        setPathObjects([groupObject(9), ownObject(5)]);
        pathPenMode.takeClick(ON_GROUP, false);
        pathPenMode.takeClick(ON_WALK, false);
        expect(session()!.target.routeId).toBe(5);
        expect(selectedNow()).toEqual([4]);
    });
});

describe("Delete on the active path (interaction system, Q7)", () => {
    it("removes the active path; a quiet path takes no Delete", () => {
        render(<PathPenKeys />);
        act(() => showPath(own(5), "T4"));
        // A quiet path takes no keys at all: Delete there does nothing, no remove starts and the
        // path stays shown
        const shown = session();
        let removing = false;
        const unsubscribe = usePathPenStore.subscribe((s) => {
            removing ||= s.saving;
        });
        expect(isActionEnabled("shapeRemoveLastPoint")).toBe(false);
        act(() => void runAction("shapeRemoveLastPoint"));
        unsubscribe();
        expect(removing).toBe(false);
        expect(session()).toBe(shown);
        act(() => void openPath());
        expect(isActionEnabled("shapeRemoveLastPoint")).toBe(true);
        expect(actionLabelNow("shapeRemoveLastPoint")).toBe("Remove path");
    });
});

describe("member state on the field, whenever a group path shows (interaction system, rule 5)", () => {
    const adjusted = (): PathTarget => {
        const t = group(9);
        return {
            ...t,
            group: {
                ...t.group!,
                members: t.group!.members.map((m) =>
                    m.marcherId === 11
                        ? {
                              ...m,
                              adjust: {
                                  v: 1,
                                  keys: [
                                      { a: "from", b: "g1", f: 0.5, d: [0, 8] },
                                  ],
                              },
                          }
                        : m,
                ),
                detachedMembers: [
                    { marcherId: 12, drill: "B3", from: { x: 0, y: 0 } },
                ],
            },
        };
    };

    it("quiet: an adjusted member's lane is marked, a detached member's start is ringed dashed", () => {
        showPath(adjusted(), "2");
        const d = drawingOf(session())!;
        expect(d.lanesAdjusted).toEqual([1]);
        const rings = d.memberRings!;
        expect(rings.find((r) => r.marcherId === 11)!.label).toMatch(
            /^Adjusted/,
        );
        expect(rings.find((r) => r.marcherId === 12)).toMatchObject({
            kind: "own",
            dashed: true,
            label: "Detached: walks its own copy of the group path",
        });
        expect(rings.find((r) => r.marcherId === 10)!.dashed).toBeUndefined();
    });

    it("Paths All with nothing selected still marks the adjusted lane", () => {
        const d = objectDrawingOf({
            target: adjusted(),
            drill: "2",
            walk: null,
        })!;
        expect(d.lanesAdjusted).toEqual([1]);
        expect(d.memberRings).toEqual([]);
    });
});

describe("Paths All draws a group path as its one line (QA-AP-O4)", () => {
    it("its reference line and members' faint lanes, no rings naming who follows", () => {
        const d = objectDrawingOf(groupObject(9))!;
        expect(d.pathLine).toBe("shown");
        expect(d.lanes).toHaveLength(2);
        expect(d.memberRings).toEqual([]);
        // An own path has no drawing of its own: start flag positions draw it as before
        expect(objectDrawingOf(ownObject(5))).toBeNull();
    });

    it("its members' start flag positions give way to it; an own path's marcher keeps its own", () => {
        const objects = [groupObject(9), ownObject(5)];
        expect(pathMarcherIds(null, false, false, objects)).toEqual([10, 11]);
        // Under an open shape, nothing is drawn, so nobody gives way
        expect(pathMarcherIds(null, false, true, objects)).toEqual([]);
        // The active path is drawn by the session, not twice
        activatePath(group(9), "2");
        expect(pathMarcherIds(session(), false, false, objects)).toEqual([
            10, 11,
        ]);
    });

    it("a move is at the playhead when it holds it, or arrives on it; leaving from it only with nothing arriving", () => {
        expect(moveIsAt({ start: 0, end: 8 }, 4, false)).toBe(true);
        expect(moveIsAt({ start: 0, end: 8 }, 8, false)).toBe(true);
        expect(moveIsAt({ start: 8, end: 16 }, 8, true)).toBe(false);
        expect(moveIsAt({ start: 0, end: 8 }, 0, false)).toBe(true);
        expect(moveIsAt({ start: 0, end: 8 }, 9, false)).toBe(false);
    });
});

/**
 * A field editor with the pen as its mode, as the field has it while a path is shown or Paths All
 * lists paths: marcher 3's dot on its own path's first leg (`ON_OWN`), marcher 10's on the group
 * path's upper lane, and marcher 2 far off any line.
 */
function fieldWithPen(selected: number[]) {
    const state = { selected: [...selected] as readonly number[] };
    const dots: [number, { x: number; y: number }][] = [
        [3, ON_OWN.field],
        [10, ON_LANE.field],
        [2, EMPTY.field],
    ];
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: (ids) => {
                state.selected = ids;
            },
        },
        marchers: () => ({
            ids: dots.map(([id]) => id),
            positions: Float64Array.from(dots.flatMap(([, p]) => [p.x, p.y])),
            hidden: Uint8Array.from(dots.map(() => 0)),
        }),
        zoom: () => ZOOM,
        canSelect: () => true,
        selectionBoxPadding: () => 10,
        openMenu: vi.fn(),
        showPositions: vi.fn(),
        drop: vi.fn(() => new Promise<never>(() => {})),
    };
    const editor = new FieldEditor(ports, { now: () => 1000 });
    editor.setMode(pathPenMode);
    setPathSelectionPort(ports.selection);
    const right = (p: FieldPointer) => {
        editor.pointerDown({ ...p, button: 2 });
        editor.pointerUp({ ...p, button: 2 });
    };
    return { editor, ports, state, right };
}

describe("a marcher's dot on a path's line is the dot's (AP-O3, review of #737 B1)", () => {
    it("a right-click on the selected marcher's dot, on its own shown path, keeps the marcher and opens its menu", () => {
        showPath(own(5), "T4");
        const { ports, state, right } = fieldWithPen([3]);
        right(ON_OWN);
        expect(session()).toMatchObject({ object: false, phase: "closed" });
        expect(state.selected).toEqual([3]);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![1]).toBeUndefined();
    });

    it("a long press on that dot picks no path either", () => {
        showPath(own(5), "T4");
        const { editor, ports, state } = fieldWithPen([3]);
        editor.longPress(ON_OWN);
        expect(session()).toMatchObject({ object: false });
        expect(state.selected).toEqual([3]);
        expect(ports.openMenu).not.toHaveBeenCalled();
    });

    it("with Paths All, a right-click or long press on a dot a group lane runs through is the marcher's", () => {
        setPathObjects([groupObject(9)]);
        const { editor, ports, state, right } = fieldWithPen([]);
        editor.longPress(ON_LANE);
        expect(session()).toBeNull();
        expect(ports.openMenu).not.toHaveBeenCalled();
        right(ON_LANE);
        expect(session()).toBeNull();
        // The field's own menu, for the marcher pressed
        expect(state.selected).toEqual([10]);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![1]).toBeUndefined();
    });

    it("off the dots, a right-click on the line selects its walkers and offers the Path group", () => {
        setPathObjects([groupObject(9)]);
        const { ports, right, state } = fieldWithPen([]);
        right(ON_GROUP);
        expect(session()).toMatchObject({ phase: "closed", object: false });
        expect(state.selected).toEqual([10, 11]);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![1]).toEqual(
            PATH_FIELD_MENU,
        );
    });

    it("shows no hand over a dot on a line", () => {
        showPath(own(5), "T4");
        expect(pathPenMode.cursorAt(ON_OWN, { onDot: () => false })).toBe(
            "pointer",
        );
        expect(pathPenMode.cursorAt(ON_OWN, { onDot: () => true })).toBeNull();
    });
});

/** One lane of route 5 on transition `t`, for `pathObjectsAt` and `targetOfRoute` */
const entry = (
    marcherId: number,
    start: number,
    end: number,
    offset: [number, number] | null,
    routeId = 5,
): MoveRoute => ({
    routeId,
    laneId: marcherId,
    transitionId: 100 + start,
    slot: 0,
    timelineId: 1,
    marcherId,
    start,
    end,
    offset,
    geometry: { v: 1, from: [0, 0], to: [80, 0], points: [] },
});
const stillResolver = {
    explain: () => ({ origin: [0, 0] }),
    positionAt: () => [0, 0],
} as unknown as Pick<Resolver, "explain" | "positionAt">;

describe("Paths All per playhead step (review of #737, S1, S2)", () => {
    it("a route read by its id spans all its transitions: members in [0, 8] and [4, 12]", () => {
        const t = targetOfRoute(
            [entry(10, 0, 8, [0, -2]), entry(11, 4, 12, [0, 2])],
            stillResolver,
            new Map(),
        )!;
        expect(t.span).toEqual({ start: 0, end: 12 });
        expect(t.group!.members.map((m) => m.marcherId)).toEqual([10, 11]);
    });

    it("a box moved at the end of a group path: the line's ends follow, the stored ends and lanes don't (AP-R5)", () => {
        const movedTo = (marcherId: number) =>
            marcherId === 10 ? [100, 40] : [100, 44];
        const read = (resolver: typeof stillResolver) =>
            targetOfRoute(
                [entry(10, 0, 8, [0, -2]), entry(11, 0, 8, [0, 2])],
                resolver,
                new Map(),
            )!;
        const moved = read({
            explain: () => ({ origin: [0, 0] }),
            positionAt: (m: number) => movedTo(m),
        } as unknown as typeof stillResolver);
        expect(moved.drawnEnds!.to).toEqual({ x: 100, y: 42 });
        expect(moved.to).toEqual(read(stillResolver).to);
        expect(moved.ends).toEqual(read(stillResolver).ends);

        const object = { ...groupObject(), target: moved };
        const asDrawn = objectDrawingOf(object)!;
        const asStored = objectDrawingOf({
            ...object,
            target: { ...moved, drawnEnds: undefined },
        })!;
        expect(asDrawn.outline!.at(-1)).toEqual({ x: 100, y: 42 });
        expect(asDrawn.outline!.slice(1, -1)).toEqual(
            asStored.outline!.slice(1, -1),
        );
        expect(asDrawn.lanes).toEqual(asStored.lanes);
    });

    it("filters the routes read once, keeping each route's target while nothing changed", () => {
        const index: PathObjectIndex = {
            routes: new Map([
                [5, [entry(3, 0, 8, null)]],
                [6, [entry(4, 8, 16, null, 6)]],
            ]),
            rows: new Map([
                [3, [{ start: 0, end: 8 }]],
                [
                    4,
                    [
                        { start: 0, end: 8 },
                        { start: 8, end: 16 },
                    ],
                ],
            ]),
            targets: new Map(),
            drills: null,
        };
        const drills = new Map<number, string>();
        const at4 = pathObjectsAt(index, stillResolver, 4, drills);
        const at5 = pathObjectsAt(index, stillResolver, 5, drills);
        expect(at4.map((t) => t.routeId)).toEqual([5]);
        expect(at5[0]).toBe(at4[0]);
        // On beat 8 marcher 4 arrives (its row [0, 8]), so its route leaving from 8 isn't at it
        expect(
            pathObjectsAt(index, stillResolver, 8, drills).map(
                (t) => t.routeId,
            ),
        ).toEqual([5]);
        expect(
            pathObjectsAt(index, stillResolver, 9, drills).map(
                (t) => t.routeId,
            ),
        ).toEqual([6]);
        // Other drill numbers: targets are built again
        expect(pathObjectsAt(index, stillResolver, 4, new Map())[0]).not.toBe(
            at4[0],
        );
    });

    it("the same objects set nothing; an own path's walk is sampled only when tested", () => {
        const walk = vi.fn(() => [
            { x: 0, y: 40 * STEP },
            { x: 8 * STEP, y: 40 * STEP },
        ]);
        const objects = [groupObject(9), { ...ownObject(5), walk }];
        setPathObjects(objects);
        const list = usePathPenStore.getState().objects;
        setPathObjects([...objects]);
        expect(usePathPenStore.getState().objects).toBe(list);
        expect(walk).not.toHaveBeenCalled();
        expect(pathPenMode.takeClick(ON_WALK, false)).toBe(true);
        expect(walk).toHaveBeenCalled();
    });
});
