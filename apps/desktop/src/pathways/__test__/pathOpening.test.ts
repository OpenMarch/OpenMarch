import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import { PATH_FIELD_MENU, drawingOf, pathPenMode } from "../pathPenMode";
import {
    addPoint,
    clearPath,
    closePath,
    openPath,
    selectPoint,
    setPathHidden,
    showPath,
    startDrawing,
    usePathPenStore,
} from "../pathPenStore";
import type { PathTarget } from "../pathTarget";

/**
 * A stored path is shown closed and opened on purpose (owner lab feedback on fork #674,
 * 2026-11-04): with its marcher selected it's drawn with no handles and takes no press; a
 * double-click on its line or Edit path opens it; Escape closes it again, leaving it drawn; a
 * right-click on its line offers Edit path and Remove path.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const ZOOM = 2;

const target = (routeId: number | null, transitionId = 7): PathTarget => ({
    timelineId: 1,
    transitionId,
    marcherId: 3,
    start: 0,
    end: 8,
    from: { x: 0, y: 0 },
    to: { x: 8 * STEP, y: 0 },
    routeId,
    points: routeId === null ? [] : [{ id: "c1", at: [4 * STEP, 4 * STEP] }],
});

/** A press at field point (x, y) */
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

/** On the path's first leg, from (0, 0) to the corner */
const ON_LINE = at(2 * STEP, 2 * STEP);
/** Empty field inside the path's bend, a step from any leg */
const NEAR = at(4 * STEP, 2 * STEP);

const phase = () => usePathPenStore.getState().session?.phase ?? null;

beforeEach(() => {
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => ZOOM,
        marchers: () => [],
        drawn: () => new Map(),
    });
});

afterEach(() => {
    clearPath();
    setPathHidden(false);
    setShapeField(null);
});

describe("a stored path, shown", () => {
    it("is drawn closed: the line and the marcher's ghost and end spot, no handles", () => {
        showPath(target(5), "T4");
        expect(phase()).toBe("closed");
        const drawing = drawingOf(usePathPenStore.getState().session)!;
        expect(drawing.outline).toEqual([
            { x: 0, y: 0 },
            { x: 4 * STEP, y: 4 * STEP },
            { x: 8 * STEP, y: 0 },
        ]);
        expect(drawing.handles).toEqual([]);
        expect(drawing.addHandles).toEqual([]);
        expect(drawing.rings).toEqual([{ x: 0, y: 0 }]);
        expect(drawing.spots).toEqual([{ x: 8 * STEP, y: 0 }]);
        // Opened, the corners and midpoints come
        openPath();
        const open = drawingOf(usePathPenStore.getState().session)!;
        expect(open.handles).toHaveLength(1);
        expect(open.addHandles).toHaveLength(2);
    });

    it("takes no press, keeps the field's menu open and the selection box its own", () => {
        showPath(target(5), "T4");
        expect(pathPenMode.claims(ON_LINE)).toBe(false);
        // Something to click, though (step 3a: a click selects the path)
        expect(pathPenMode.cursorAt(ON_LINE)).toBe("pointer");
        expect(pathPenMode.cursorAt(NEAR)).toBeNull();
        expect(pathPenMode.ownsSelectionBox).toBe(false);
        expect(pathPenMode.blocksFieldMenu).toBe(false);
        expect(pathPenMode.gesture.always).toBe(false);
    });

    it("opens on a double-click on its line; a single click there selects the path (step 3a)", () => {
        showPath(target(5), "T4");
        expect(pathPenMode.takeClick(ON_LINE, false)).toBe(true);
        expect(phase()).toBe("closed");
        expect(usePathPenStore.getState().session?.object).toBe(true);
        expect(pathPenMode.takeClick(ON_LINE, true)).toBe(true);
        expect(phase()).toBe("open");
    });

    it("leaves clicks on empty field near it to the field", () => {
        showPath(target(5), "T4");
        expect(pathPenMode.takeClick(NEAR, false)).toBe(false);
        expect(pathPenMode.takeClick(NEAR, true)).toBe(false);
        expect(phase()).toBe("closed");
    });

    it("offers Edit path and Remove path on a right-click on its line, and nothing off it", () => {
        showPath(target(5), "T4");
        expect(pathPenMode.openMenu(ON_LINE)).toBe(false);
        expect(pathPenMode.fieldMenuAt(ON_LINE)).toEqual(PATH_FIELD_MENU);
        expect(pathPenMode.fieldMenuAt(NEAR)).toBeNull();
    });
});

describe("closing it", () => {
    it("Escape closes the open path, which stays drawn", () => {
        showPath(target(5), "T4");
        openPath();
        selectPoint("p0");
        closePath();
        const s = usePathPenStore.getState().session!;
        expect(s.phase).toBe("closed");
        expect(s.selected).toBeNull();
        expect(s.points).toHaveLength(1);
    });

    it("stays open while the playhead stays on its move, and closes when it leaves it", () => {
        showPath(target(5), "T4");
        openPath();
        // Read again on the same move (a save, the playhead moving within it)
        showPath(target(5), "T4");
        expect(phase()).toBe("open");
        // Another move of the marcher's
        showPath(target(6, 8), "T4");
        expect(phase()).toBe("closed");
    });

    it("a drawing cancelled over a stored path shows that path again, closed; over none, nothing", () => {
        startDrawing(target(5), "T4");
        addPoint({ x: 1, y: 1 });
        closePath();
        const s = usePathPenStore.getState().session!;
        expect(s.phase).toBe("closed");
        expect(s.points.map((c) => c.id)).toEqual(["c1"]);
        startDrawing(target(null), "T4");
        closePath();
        expect(usePathPenStore.getState().session).toBeNull();
    });
});

describe("finishing a drawing (review of #680)", () => {
    it("a press on the last point that drags past the slop finishes, adding no smooth point", async () => {
        startDrawing(target(null), "T4");
        addPoint({ x: 4 * STEP, y: 4 * STEP });
        pathPenMode.press(at(4 * STEP, 4 * STEP), { isMac: false });
        pathPenMode.move(at(5 * STEP, 4 * STEP));
        pathPenMode.move(at(6 * STEP, 4 * STEP));
        // Still one point while dragging: none was placed under the press
        expect(usePathPenStore.getState().session?.points).toHaveLength(1);
        pathPenMode.release(at(6 * STEP, 4 * STEP), null);
        await new Promise((r) => setTimeout(r, 0));
        const s = usePathPenStore.getState().session;
        expect(s?.phase ?? null).not.toBe("drawing");
        expect(s?.points.length ?? 0).toBeLessThanOrEqual(1);
    });

    it("a press on the end spot that drags past the slop finishes too", async () => {
        startDrawing(target(null), "T4");
        addPoint({ x: 4 * STEP, y: 4 * STEP });
        pathPenMode.press(at(8 * STEP, 0), { isMac: false });
        pathPenMode.move(at(8 * STEP, 2 * STEP));
        expect(usePathPenStore.getState().session?.points).toHaveLength(1);
        pathPenMode.release(at(8 * STEP, 2 * STEP), null);
        await new Promise((r) => setTimeout(r, 0));
        expect(usePathPenStore.getState().session?.phase ?? null).not.toBe(
            "drawing",
        );
    });

    it("a press-and-drag elsewhere still places a smooth point", () => {
        startDrawing(target(null), "T4");
        addPoint({ x: 4 * STEP, y: 4 * STEP });
        pathPenMode.press(at(6 * STEP, 6 * STEP), { isMac: false });
        pathPenMode.move(at(8 * STEP, 6 * STEP));
        const points = usePathPenStore.getState().session!.points;
        expect(points).toHaveLength(2);
        expect(points[1]!.tension ?? 0).toBeGreaterThan(0);
        pathPenMode.release(at(8 * STEP, 6 * STEP), null);
    });
});

describe("shown by start flag positions' rules (owner, 2026-11-04)", () => {
    it("a closed path hidden by the paths level isn't drawn and takes no click or menu", () => {
        showPath(target(5), "T4");
        setPathHidden(true);
        expect(pathPenMode.drawing()).toBeNull();
        expect(pathPenMode.takeClick(ON_LINE, true)).toBe(false);
        expect(pathPenMode.fieldMenuAt(ON_LINE)).toBeNull();
        expect(phase()).toBe("closed");
        // N (or the setting) shows it again
        setPathHidden(false);
        expect(pathPenMode.drawing()).not.toBeNull();
        expect(pathPenMode.fieldMenuAt(ON_LINE)).toEqual(PATH_FIELD_MENU);
    });

    it("an open path, or one being drawn, shows whatever the level", () => {
        showPath(target(5), "T4");
        setPathHidden(true);
        // Edit path opens a hidden path, which then shows
        expect(openPath()).toBe(true);
        expect(pathPenMode.drawing()).not.toBeNull();
        closePath();
        expect(pathPenMode.drawing()).toBeNull();
        startDrawing(target(null), "T4");
        expect(pathPenMode.drawing()).not.toBeNull();
    });
});
