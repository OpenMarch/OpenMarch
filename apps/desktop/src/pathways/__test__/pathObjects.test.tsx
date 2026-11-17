import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    FieldEditor,
    type FieldEditorPorts,
    type FieldPointer,
} from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import { closeHandleMenu, useHandleMenuStore } from "@/shapes/field/handleMenu";
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
    addPoint,
    clearPath,
    openPath,
    pathMarcherIds,
    pathShown,
    selectPathObject,
    setPathHidden,
    setPathObjects,
    showPath,
    startDrawing,
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
 * Paths as objects, pathways step 3a (spec Appendix I.10): a click or tap on a path's line selects
 * the path (AP-O3), with nothing selected too when Paths All draws it (AP-O2, AP-O7); a selected
 * path is drawn selected, and Escape or a click on empty field lets it go (AP-O4); a double-click
 * opens it (step 1); Delete removes it (AP-O6). Dragging a dot is never the path's (P-1).
 * QA-AP-O1 to QA-AP-O4.
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
    kind: "mouse",
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
        closeHandleMenu();
    });
    cleanup();
    setShapeField(null);
});

describe("hit-testing a path's line (QA-AP-O1)", () => {
    it("a click on the shown path's line selects it as an object; it stays closed", () => {
        showPath(own(5), "T4");
        expect(session()!.object).toBe(false);
        expect(pathPenMode.takeClick(ON_OWN, false)).toBe(true);
        expect(session()).toMatchObject({ phase: "closed", object: true });
        expect(session()!.target.routeId).toBe(5);
    });

    it("with nothing selected, a click on Paths All's group path (its line or a lane) selects it", () => {
        setPathObjects([groupObject(9)]);
        expect(pathPenMode.takeClick(ON_GROUP, false)).toBe(true);
        expect(session()).toMatchObject({ phase: "closed", object: true });
        expect(session()!.target.routeId).toBe(9);
        clearPath();
        expect(pathPenMode.takeClick(ON_LANE, false)).toBe(true);
        expect(session()!.target.routeId).toBe(9);
    });

    it("with nothing selected, a click on an own path's drawn walk selects that path", () => {
        setPathObjects([ownObject(5)]);
        expect(pathPenMode.takeClick(ON_WALK, false)).toBe(true);
        expect(session()).toMatchObject({ object: true, drill: "T4" });
        expect(session()!.target.marcherId).toBe(4);
    });

    it("a miss is the field's, and the pointer shows over a line only", () => {
        setPathObjects([groupObject(9), ownObject(5)]);
        expect(pathPenMode.takeClick(EMPTY, false)).toBe(false);
        expect(session()).toBeNull();
        expect(pathPenMode.cursorAt(ON_GROUP)).toBe("pointer");
        expect(pathPenMode.cursorAt(ON_WALK)).toBe("pointer");
        expect(pathPenMode.cursorAt(EMPTY)).toBeNull();
    });

    it("a press on a path's line is never the path's: a drag from there (or from a dot) is the field's (P-1)", () => {
        setPathObjects([groupObject(9)]);
        const press = { reachesInside: () => false, isMac: false };
        expect(pathPenMode.claims(ON_GROUP, press)).toBe(false);
        selectPathObject(group(9), "2");
        expect(pathPenMode.claims(ON_GROUP, press)).toBe(false);
    });
});

describe("selection state (QA-AP-O2)", () => {
    it("is drawn selected, whatever the paths level; a click on empty field lets it go", () => {
        showPath(own(5), "T4");
        setPathHidden(true);
        expect(pathShown(session(), true)).toBe(false);
        selectPathObject(own(5), "T4");
        expect(pathShown(session(), true)).toBe(true);
        expect(drawingOf(session())!.pathLine).toBe("selected");
        expect(pathPenMode.takeClick(EMPTY, false)).toBe(false);
        expect(session()).toBeNull();
    });

    it("the second click of a double-click opens it; Escape goes back to selected, then lets it go", () => {
        render(<PathPenKeys />);
        setPathObjects([groupObject(9)]);
        act(() => void pathPenMode.takeClick(ON_GROUP, false));
        act(() => void pathPenMode.takeClick(ON_GROUP, true));
        expect(session()).toMatchObject({ phase: "open", object: true });
        expect(drawingOf(session())!.pathLine).toBe("edited");
        act(() => void runAction("cancelAlignmentUpdates"));
        expect(session()).toMatchObject({ phase: "closed", object: true });
        expect(actionLabelNow("cancelAlignmentUpdates")).toBe("Deselect path");
        act(() => void runAction("cancelAlignmentUpdates"));
        expect(session()).toBeNull();
    });

    it("a right-click (or long press) on a line selects it and offers Edit path and Remove path", () => {
        setPathObjects([groupObject(9)]);
        expect(pathPenMode.fieldMenuAt(ON_GROUP)).toEqual(PATH_FIELD_MENU);
        expect(session()).toMatchObject({ object: true });
        expect(pathPenMode.fieldMenuAt(EMPTY)).toBeNull();
    });

    it("a click on the open path's line keeps it open", () => {
        selectPathObject(own(5), "T4");
        openPath();
        expect(pathPenMode.takeClick(ON_OWN, false)).toBe(true);
        expect(session()!.phase).toBe("open");
    });

    it("selecting another path replaces the selection", () => {
        setPathObjects([groupObject(9), ownObject(5)]);
        pathPenMode.takeClick(ON_GROUP, false);
        pathPenMode.takeClick(ON_WALK, false);
        expect(session()!.target.routeId).toBe(5);
    });
});

describe("Delete on a selected path (QA-AP-O3)", () => {
    it("Backspace or Delete removes the selected path; not a path only shown for its marchers", () => {
        render(<PathPenKeys />);
        act(() => showPath(own(5), "T4"));
        // A closed path shown for its marchers takes no keys at all: Delete there does nothing,
        // no remove starts and the path stays shown
        expect(session()!.object).toBe(false);
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
        act(() => selectPathObject(own(5), "T4"));
        expect(isActionEnabled("shapeRemoveLastPoint")).toBe(true);
        expect(actionLabelNow("shapeRemoveLastPoint")).toBe("Remove path");
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
        // The selected path is drawn by the session, not twice
        selectPathObject(group(9), "2");
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
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![2]).toBeUndefined();
    });

    it("a long press on that dot picks no path either: the marcher's menu opens (tablet 1.5)", () => {
        showPath(own(5), "T4");
        const { editor, ports, state } = fieldWithPen([3]);
        editor.longPress(ON_OWN);
        expect(session()).toMatchObject({ object: false });
        expect(state.selected).toEqual([3]);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![1]).toBe(3);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![2]).toBeUndefined();
    });

    it("with Paths All, a right-click or long press on a dot a group lane runs through is the marcher's", () => {
        setPathObjects([groupObject(9)]);
        const { editor, ports, state, right } = fieldWithPen([]);
        // The field's own menu, for the marcher pressed, either way
        editor.longPress(ON_LANE);
        expect(session()).toBeNull();
        expect(state.selected).toEqual([10]);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![1]).toBe(10);
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![2]).toBeUndefined();
        right(ON_LANE);
        expect(session()).toBeNull();
        expect(state.selected).toEqual([10]);
        expect(vi.mocked(ports.openMenu!).mock.calls[1]![2]).toBeUndefined();
    });

    it("off the dots, a right-click on the line still selects the path and offers its actions", () => {
        setPathObjects([groupObject(9)]);
        const { ports, right } = fieldWithPen([]);
        right(ON_GROUP);
        expect(session()).toMatchObject({ object: true });
        expect(vi.mocked(ports.openMenu!).mock.calls[0]![2]).toEqual(
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

describe("a long press on the path being drawn or edited (tablet 1.5, review of #1047)", () => {
    const touch = (p: FieldPointer, dx = 0): FieldPointer => ({
        ...p,
        screen: { x: p.screen.x + dx, y: p.screen.y },
        kind: "touch",
    });
    const points = () => session()!.points.map((c) => c.at);
    const handleMenu = () => useHandleMenuStore.getState().menu;
    /** The own path's second leg, from its corner (4, 4) to (8, 0) steps: its midpoint, and a spot on it off any handle */
    const LEG = at(6 * STEP, 2 * STEP);
    const ON_LEG = at(7 * STEP, 1 * STEP);
    const CORNER = at(4 * STEP, 4 * STEP);

    const drawing = () => {
        startDrawing({ ...own(5), routeId: null, points: [] }, "T4");
        addPoint({ x: 2 * STEP, y: 6 * STEP });
        addPoint({ x: 6 * STEP, y: 6 * STEP });
    };

    it("while drawing, takes the last point back and places none where it was held; drawing goes on", () => {
        drawing();
        const { editor, ports } = fieldWithPen([3]);
        const held = touch(at(12 * STEP, 12 * STEP));
        expect(editor.pointerDown(held)).toBe(true);
        expect(editor.longPress(held)).toBe(true);
        expect(session()!.phase).toBe("drawing");
        expect(points()).toEqual([{ x: 2 * STEP, y: 6 * STEP }]);
        expect(ports.openMenu).not.toHaveBeenCalled();
        // The next tap places a point as usual
        const tap = touch(at(10 * STEP, 2 * STEP));
        editor.pointerDown(tap);
        editor.pointerUp(tap);
        expect(points()).toHaveLength(2);
        expect(session()!.phase).toBe("drawing");
    });

    it("while drawing, a finger that shook a little (a smooth point begun) takes back only that and the last point", () => {
        drawing();
        const { editor } = fieldWithPen([3]);
        const held = touch(at(12 * STEP, 12 * STEP));
        editor.pointerDown(held);
        // Past a mouse's click slop, short of a finger's drag
        editor.pointerMove(touch(held, 8));
        expect(points()).toHaveLength(3);
        expect(editor.longPress(touch(held, 8))).toBe(true);
        expect(points()).toEqual([{ x: 2 * STEP, y: 6 * STEP }]);
        expect(session()).toMatchObject({ phase: "drawing", dragging: null });
    });

    it("on the open path's corner, opens the corner's menu and leaves no drag behind", () => {
        selectPathObject(own(5), "T4");
        openPath();
        const before = session()!.points;
        const { editor, ports } = fieldWithPen([3]);
        expect(editor.pointerDown(touch(CORNER))).toBe(true);
        editor.pointerMove(touch(CORNER, 8));
        expect(editor.longPress(touch(CORNER, 8))).toBe(true);
        expect(handleMenu()?.key).toBe("p0");
        expect(session()).toMatchObject({ phase: "open", dragging: null });
        expect(session()!.points).toEqual(before);
        expect(editor.activeGesture()).toBeNull();
        expect(ports.openMenu).not.toHaveBeenCalled();
    });

    it("on the open path's line, opens that leg's menu at its midpoint, and the field's with Remove path elsewhere on it", () => {
        selectPathObject(own(5), "T4");
        openPath();
        const { editor, ports } = fieldWithPen([3]);
        expect(editor.pointerDown(touch(LEG))).toBe(true);
        expect(editor.longPress(touch(LEG))).toBe(true);
        expect(handleMenu()?.key).toBe("m1");
        expect(session()!.points).toHaveLength(1);
        expect(editor.activeGesture()).toBeNull();
        closeHandleMenu();
        // Off the handles the line takes no press (a finger there pans), and a long press opens
        // the field's menu with the open path's actions
        const press = {
            reachesInside: () => false,
            isMac: false,
            onDot: () => false,
        };
        expect(pathPenMode.claims(touch(ON_LEG), press)).toBe(false);
        expect(editor.longPress(touch(ON_LEG))).toBe(true);
        expect(handleMenu()).toBeNull();
        expect(session()!.phase).toBe("open");
        const actions = vi.mocked(ports.openMenu!).mock.calls[0]![2];
        expect(actions).toEqual(expect.arrayContaining(["removePath"]));
    });

    it("on a marcher's dot or empty field, opens the field's own menu, as without a path", () => {
        selectPathObject(own(5), "T4");
        openPath();
        const { editor, ports, state } = fieldWithPen([]);
        const menuCall = () => vi.mocked(ports.openMenu!).mock.calls.at(-1)!;
        // Marcher 2's dot: it's selected and its menu opens
        expect(editor.longPress(touch(EMPTY))).toBe(true);
        expect(state.selected).toEqual([2]);
        expect(menuCall()[1]).toBe(2);
        expect(menuCall()[2]).toBeUndefined();
        // Empty field: the field's menu, the selection kept
        expect(editor.longPress(touch(at(20 * STEP, 30 * STEP)))).toBe(true);
        expect(state.selected).toEqual([2]);
        expect(menuCall()[1]).toBeNull();
        expect(menuCall()[2]).toBeUndefined();
        expect(handleMenu()).toBeNull();
        expect(session()!.phase).toBe("open");
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
