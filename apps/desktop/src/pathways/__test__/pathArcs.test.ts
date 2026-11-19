import { describe, expect, it } from "vitest";
import { arcPoint, validateRouteGeometry } from "@openmarch/core";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import {
    ARC_BULGE,
    PATH_MENU,
    bulgeKey,
    clickPathHandle,
    curveOf,
    dragPathHandle,
    halfBulge,
    pathHandles,
    pathOutline,
    setLegArc,
    splitLeg,
    withoutPoint,
    type PathShape,
} from "../pathEdit";

/**
 * Arc legs on the Path pen (pathways step 10a, spec Appendix L AP-T11, R-14″): a leg's menu has
 * Arc (a quarter bulge, its points corners) and Straight clears it; an arc shows a handle at its
 * middle on a bar from the chord's middle, and dragging it sets the bulge (snapped onto a half
 * circle near it; fine places it freely); Smooth beside an arc is disabled with the reason; Add
 * point here on an arc keeps both halves on its circle. The same shape is a path, a group path or
 * a trail, so these hold for all three.
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

/** From (0,0) up to a (0,50), across to b (100,50), down to (100,0) */
const path: PathShape = {
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    points: [
        { id: "a", at: { x: 0, y: 50 } },
        { id: "b", at: { x: 100, y: 50 } },
    ],
};
const values = (shape: PathShape, key: string) =>
    PATH_MENU.sections(shape, 1, key)!.flatMap((s) => s.items);
const pick = (shape: PathShape, key: string, value: string) =>
    PATH_MENU.pick(shape, 1, key, value, env);
/** The geometry the shape stores, as the validator reads it */
const stored = (shape: PathShape) => ({
    v: 1,
    from: [0, 0],
    to: [100, 0],
    ...(shape.toBulge ? { toBulge: shape.toBulge } : {}),
    points: shape.points.map((p, i) => ({
        id: p.id ?? `n${i}`,
        at: [p.at.x, p.at.y],
        ...(p.tension ? { tension: p.tension } : {}),
        ...(p.bulge ? { bulge: p.bulge } : {}),
    })),
});

describe("Arc and Straight on a leg's menu (AP-T11)", () => {
    it("Arc sets a quarter bulge on the leg (the point it arrives at), its points corners; Straight clears it", () => {
        const items = values(path, "m1");
        expect(items.map((i) => i.value)).toEqual([
            "add",
            "straight",
            "curved",
            "arc",
        ]);
        expect(items.find((i) => i.value === "arc")!.checked).toBe(false);
        const smooth: PathShape = {
            ...path,
            points: path.points.map((p) => ({ ...p, tension: 1 })),
        };
        const arc = pick(smooth, "m1", "arc")!.params;
        expect(arc.points).toEqual([
            { id: "a", at: { x: 0, y: 50 } },
            { id: "b", at: { x: 100, y: 50 }, bulge: ARC_BULGE },
        ]);
        expect(validateRouteGeometry(stored(arc)).ok).toBe(true);
        // ticked now, and shown as an arc: its menu is on the arc's handle
        const arcItems = values(arc, bulgeKey(1));
        expect(arcItems.find((i) => i.value === "arc")!.checked).toBe(true);
        expect(arcItems.find((i) => i.value === "straight")!.checked).toBe(
            false,
        );
        const straight = pick(arc, bulgeKey(1), "straight")!.params;
        expect(straight.points[1]!.bulge).toBeUndefined();
        // Arc again on an arc changes nothing
        expect(pick(arc, bulgeKey(1), "arc")).toBeNull();
    });

    it("the last leg's arc is the path's toBulge", () => {
        const arc = pick(path, "m2", "arc")!.params;
        expect(arc.toBulge).toBe(ARC_BULGE);
        expect(arc.points.every((p) => p.bulge === undefined)).toBe(true);
        expect(pick(arc, bulgeKey(2), "straight")!.params.toBulge).toBe(
            undefined,
        );
    });

    it("Smooth is disabled beside an arc, with the reason; Curved is disabled next to one", () => {
        const arc = setLegArc(path, 1);
        for (const key of ["p0", "p1"]) {
            const smooth = values(arc, key).find((i) => i.value === "smooth")!;
            expect(smooth.disabled).toMatch(/end of an arc stays a corner/);
            expect(pick(arc, key, "smooth")).toBeNull();
        }
        for (const key of ["m0", "m2"]) {
            const curved = values(arc, key).find((i) => i.value === "curved")!;
            expect(curved.disabled).toMatch(/arc meets this leg/);
        }
        // away from the arc, Smooth is there as before
        const longer: PathShape = {
            ...arc,
            points: [{ id: "z", at: { x: -50, y: 20 } }, ...arc.points],
        };
        expect(
            values(longer, "p0").find((i) => i.value === "smooth")!.disabled,
        ).toBeUndefined();
    });
});

describe("the arc's handle (AP-T11)", () => {
    const arc = setLegArc(path, 1);

    it("sits at the arc's middle on a bar from the chord's middle, in place of the leg's add handle", () => {
        const handles = pathHandles(arc);
        expect(handles.map((h) => h.key)).toEqual([
            "p0",
            "p1",
            "m0",
            "b1",
            "m2",
        ]);
        const b = handles.find((h) => h.key === "b1")!;
        // chord (0,50)–(100,50), bulge 1/4: sagitta 25 toward +90° of the chord, so up to y = 75
        expect(b.at.x).toBeCloseTo(50, 9);
        expect(b.at.y).toBeCloseTo(75, 9);
        expect(b.bar).toEqual({ x: 50, y: 50 });
        expect(b.adds).toBeUndefined();
        // a click on it adds nothing
        expect(clickPathHandle(arc, "b1")).toBeNull();
    });

    it("a drag sets the bulge from the pointer's distance off the chord, either side, at most a half circle", () => {
        const at = (y: number) =>
            dragPathHandle(arc, "b1", { x: 37, y }, fine).points[1]!.bulge;
        expect(at(60)).toBeCloseTo(0.1, 12);
        expect(at(30)).toBeCloseTo(-0.2, 12);
        expect(at(500)).toBe(0.5);
        expect(at(-500)).toBe(-0.5);
        // on the chord it's straight again
        expect(at(50)).toBeUndefined();
    });

    it("snaps onto the half circle near it while snapping; fine places it freely", () => {
        const near = { x: 50, y: 50 + 0.47 * 100 };
        expect(dragPathHandle(arc, "b1", near, env).points[1]!.bulge).toBe(0.5);
        expect(
            dragPathHandle(arc, "b1", near, fine).points[1]!.bulge,
        ).toBeCloseTo(0.47, 12);
        const flatter = { x: 50, y: 50 + 0.3 * 100 };
        expect(
            dragPathHandle(arc, "b1", flatter, env).points[1]!.bulge,
        ).toBeCloseTo(0.3, 12);
    });

    it("on the last leg the drag sets toBulge", () => {
        const last = setLegArc(path, 2);
        // chord (100,50)–(100,0): +90° of it is +x
        const moved = dragPathHandle(last, "b2", { x: 120, y: 25 }, fine);
        expect(moved.toBulge).toBeCloseTo(0.4, 12);
    });
});

describe("the line and points on an arc", () => {
    it("the outline follows the arc", () => {
        const arc = setLegArc(path, 1);
        const outline = pathOutline(arc);
        const center = { x: 50, y: 50 - 37.5 }; // r = (50² + 25²) / 50 = 62.5, centre 62.5 below the apex
        const onArc = outline.filter((p) => p.y > 50 + 1e-9);
        expect(onArc.length).toBeGreaterThan(10);
        for (const p of onArc)
            expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(
                62.5,
                6,
            );
    });

    it("Add point here on an arc: a corner on its middle, both halves on the same circle", () => {
        const arc = setLegArc(path, 1);
        const split = splitLeg(arc, 1);
        const k = halfBulge(ARC_BULGE);
        expect(split.points.map((p) => p.bulge)).toEqual([undefined, k, k]);
        expect(split.points[1]!.at.x).toBeCloseTo(50, 9);
        expect(split.points[1]!.at.y).toBeCloseTo(75, 9);
        expect(split.points[1]!.tension).toBeUndefined();
        // a quarter of the way along the old arc is the middle of the first half
        const quarter = arcPoint([0, 50], [100, 50], ARC_BULGE, 0.25);
        const path2 = curveOf(split);
        const firstHalf = arcPoint(
            [0, 50],
            [split.points[1]!.at.x, split.points[1]!.at.y],
            k,
            0.5,
        );
        expect(firstHalf[0]).toBeCloseTo(quarter[0], 9);
        expect(firstHalf[1]).toBeCloseTo(quarter[1], 9);
        expect(path2.pieces.map((p) => p.kind)).toEqual([
            "line",
            "arc",
            "arc",
            "line",
        ]);
        // menu Add point here does the same, one edit
        expect(pick(arc, bulgeKey(1), "add")!.params.points).toEqual(
            split.points,
        );
    });

    it("deleting a point makes the leg the two around it merge into straight", () => {
        const arc = setLegArc(path, 2);
        const out = withoutPoint(arc, 1);
        expect(out.points.map((p) => p.id)).toEqual(["a"]);
        expect(out.toBulge).toBeUndefined();
        const first = setLegArc(path, 1);
        // deleting the point before the arc: the arc leg itself is what merges
        expect(withoutPoint(first, 0).points[0]!.bulge).toBeUndefined();
        expect(pick(first, "p0", "delete")!.params.points).toEqual(
            withoutPoint(first, 0).points,
        );
    });
});
