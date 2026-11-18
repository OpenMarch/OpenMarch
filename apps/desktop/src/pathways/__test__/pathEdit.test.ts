import { describe, expect, it } from "vitest";
import { landClicked } from "@/shapes/line/lineGeometry";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import {
    PATH_MENU,
    clickPathHandle,
    pointKey,
    dragPathHandle,
    landCorner,
    midpointKey,
    onPath,
    pathHandleAt,
    pathHandles,
    pathHonors,
    type PathShape,
} from "../pathEdit";

/**
 * A path's corners are edited as a Line's points are (owner lab feedback on fork #674): the same
 * handles (corners that select, round midpoints that add), the same landing with the roles held
 * (fine off the half-step grid, constrain at 45° while placing and keeping a corner's direction
 * while dragging), and a corner's and a leg's menus. The ends are fixed.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: false,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    zoom: 1,
};
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
const constrain: ToolEnv = { ...env, constrain: true };

const path: PathShape = {
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    points: [
        { id: "a", at: { x: 0, y: 50 } },
        { id: "b", at: { x: 100, y: 50 } },
    ],
};

describe("a path's handles", () => {
    it("are a square per corner, which a click selects, and a round one mid-leg that adds; the ends have none", () => {
        const handles = pathHandles(path);
        expect(handles.filter((h) => h.selects).map((h) => h.key)).toEqual([
            "p0",
            "p1",
        ]);
        expect(handles.filter((h) => h.adds).map((h) => [h.key, h.at])).toEqual(
            [
                ["m0", { x: 0, y: 25 }],
                ["m1", { x: 50, y: 50 }],
                ["m2", { x: 100, y: 25 }],
            ],
        );
        expect(pathHandleAt(path, { x: 0, y: 0 }, env)).toBeNull();
        expect(pathHandleAt(path, { x: 100, y: 0 }, env)).toBeNull();
        expect(pathHandleAt(path, { x: 1, y: 49 }, env)?.key).toBe("p0");
        expect(pathHandleAt(path, { x: 51, y: 50 }, env)?.key).toBe("m1");
    });

    it("a click mid-leg adds a corner there, between its neighbors, keeping the others' ids", () => {
        const added = clickPathHandle(path, midpointKey(1))!;
        expect(added.points.map((c) => [c.id, c.at])).toEqual([
            ["a", { x: 0, y: 50 }],
            [undefined, { x: 50, y: 50 }],
            ["b", { x: 100, y: 50 }],
        ]);
        expect(clickPathHandle(path, pointKey(0))).toBeNull();
    });
});

describe("placing a corner while drawing", () => {
    it("lands as a Line's clicked point does: on half steps, off them with fine, at 45° from the last with constrain", () => {
        const drawing: PathShape = { ...path, points: [path.points[0]!] };
        const at = { x: 23.4, y: 71.2 };
        expect(landCorner(drawing, at, env)).toEqual({ x: 25, y: 70 });
        expect(landCorner(drawing, at, fine)).toEqual(at);
        const angled = landCorner(drawing, at, constrain);
        // From the last corner (0, 50): 45°, so as far across as down
        expect(Math.abs(angled.x - 0)).toBeCloseTo(Math.abs(angled.y - 50));
        // The same landing as a Line's, from the marcher's start
        expect(landCorner(drawing, at, constrain)).toEqual(
            landClicked([path.from, { x: 0, y: 50 }], at, constrain),
        );
    });

    it("with no corner yet, constrain goes 45° from where the marcher starts", () => {
        const empty: PathShape = { ...path, points: [] };
        const at = landCorner(empty, { x: 30, y: 2 }, constrain);
        expect(at.y).toBeCloseTo(0);
    });
});

describe("dragging", () => {
    it("a corner lands on half steps, and anywhere with fine", () => {
        const to = { x: 12.3, y: 61.7 };
        expect(dragPathHandle(path, "p0", to, env).points[0]).toEqual({
            id: "a",
            at: { x: 10, y: 60 },
        });
        expect(dragPathHandle(path, "p0", to, fine).points[0]!.at).toEqual(to);
    });

    it("a corner keeps its direction from the point before with constrain, only its distance changing", () => {
        // Corner b sits right of corner a: constrain keeps it on that line
        const moved = dragPathHandle(
            path,
            "p1",
            { x: 72, y: 66 },
            constrain,
        ).points;
        expect(moved[1]!.at.y).toBeCloseTo(50);
        expect(moved[1]!.at.x).toBeCloseTo(70);
        expect(pathHonors(path, "p1")).toEqual({ constrain: "keepDirection" });
    });

    it("a midpoint adds a corner and drags it, reading neither constrain nor from center", () => {
        const moved = dragPathHandle(
            path,
            "m1",
            { x: 52, y: 81 },
            constrain,
        ).points;
        expect(moved).toHaveLength(3);
        expect(moved[1]).toEqual({ at: { x: 50, y: 80 } });
        expect(pathHonors(path, "m1")).toEqual({});
    });
});

describe("the menus", () => {
    it("a point's: Corner | Smooth (Roundness when smooth) and Delete point; a leg's: Add point here and Straight | Curved | Arc", () => {
        const values = (key: string, shape = path) =>
            PATH_MENU.sections(shape, 1, key)?.flatMap((s) =>
                s.items.map((i) => i.value),
            );
        expect(values("p0")).toEqual(["corner", "smooth", "delete"]);
        expect(values("m0")).toEqual(["add", "straight", "curved", "arc"]);
        const smooth = PATH_MENU.pick(path, 1, "p0", "smooth", env)!;
        expect(smooth.params.points[0]!.tension).toBe(1);
        expect(smooth.selected).toBe("p0");
        expect(values("p0", smooth.params)).toEqual([
            "corner",
            "smooth",
            "roundness",
            "delete",
        ]);
        const deleted = PATH_MENU.pick(path, 1, "p0", "delete", env)!;
        expect(deleted.params.points.map((c) => c.id)).toEqual(["b"]);
        expect(deleted.selected).toBeNull();
        const added = PATH_MENU.pick(path, 1, "m0", "add", env)!;
        expect(added.params.points).toHaveLength(3);
        expect(added.selected).toBe("p0");
    });
});

describe("the line", () => {
    it("is hit within the handle reach of any leg, ends included, and not beyond it", () => {
        // On the first leg, the middle one and the last, within the reach
        expect(onPath(path, { x: 2, y: 25 }, env)).toBe(true);
        expect(onPath(path, { x: 50, y: 52 }, env)).toBe(true);
        expect(onPath(path, { x: 99, y: 10 }, env)).toBe(true);
        // Inside the path's bend, empty field: not the path's
        expect(onPath(path, { x: 50, y: 25 }, env)).toBe(false);
        // Just past the reach, and past an end
        expect(onPath(path, { x: 50, y: 54 }, env)).toBe(false);
        expect(onPath(path, { x: -4, y: 0 }, env)).toBe(false);
    });
});
