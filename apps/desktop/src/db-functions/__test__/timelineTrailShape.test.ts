import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { createResolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { lineSegments, type LineParams } from "@/shapes/line/lineGeometry";
import { lineTool } from "@/shapes/line/lineTool";
import { arcTool } from "@/shapes/arc/arcTool";
import { boxesAt, type PlacedRecipe } from "@/shapes/placed/placedBox";
import type { Segment } from "@/shapes/geometry/path";
import { performRedo, performUndo } from "../history";
import { readAllShapeRecipes } from "../shapeRecipes";
import { moveMarchersInTarget } from "../timelineMoves";
import { dragTrail, planTrailDrag } from "../timelineTrailDrag";
import {
    reversedLineParams,
    trailShapeOf,
    trailShapeRecipe,
} from "../timelineTrailShape";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Step 4c (spec Appendix L.5, DL-11 to DL-14, QA-DL-10 to QA-DL-14): the end spots a dragged-out
 * trail writes are saved as a shape recipe the shape tools open as their own, a Line, an Arc or a
 * Curve with Corner and Smooth points, which passes through every spot exactly and records each
 * member where it was written.
 */

const WINDOW = { start: 9, end: 17 };

/** How far `p` is from `seg`, exactly for a line or an arc; a cubic only at its ends */
function distanceTo(seg: Segment, p: { x: number; y: number }): number {
    if (seg.type === "line") {
        const dx = seg.b.x - seg.a.x;
        const dy = seg.b.y - seg.a.y;
        const l2 = dx * dx + dy * dy;
        const f =
            l2 > 0
                ? Math.max(
                      0,
                      Math.min(
                          1,
                          ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / l2,
                      ),
                  )
                : 0;
        return Math.hypot(seg.a.x + dx * f - p.x, seg.a.y + dy * f - p.y);
    }
    if (seg.type === "arc") {
        const off = Math.abs(
            Math.hypot(p.x - seg.center.x, p.y - seg.center.y) - seg.r,
        );
        // Within the swept angle
        let a = Math.atan2(p.y - seg.center.y, p.x - seg.center.x) - seg.start;
        const twoPi = 2 * Math.PI;
        if (seg.sweep >= 0) a = ((a % twoPi) + twoPi) % twoPi;
        else a = -(((-a % twoPi) + twoPi) % twoPi);
        const inside =
            seg.sweep >= 0 ? a <= seg.sweep + 1e-9 : a >= seg.sweep - 1e-9;
        return inside ? off : Infinity;
    }
    // A cubic's own points aren't checked here: a spot on one must be one of its ends
    return Math.min(
        Math.hypot(seg.a.x - p.x, seg.a.y - p.y),
        Math.hypot(seg.b.x - p.x, seg.b.y - p.y),
    );
}

const offShape = (params: LineParams, p: XY) =>
    Math.min(
        ...lineSegments(params).map((s) => distanceTo(s, { x: p[0], y: p[1] })),
    );

/** The show converted; marchers 1 to 8 stand in a level line at page 2's start flag */
async function line(db: DbConnection) {
    await convertPagesToTimeline(db);
    const r = createResolver((await readTimelineTables(db)).snapshot);
    const starts = new Map<number, XY>(
        [1, 2, 3, 4, 5, 6, 7, 8].map((m) => [m, r.positionAt(m, 9) as XY]),
    );
    const step = (starts.get(2)![0] - starts.get(1)![0]) / 2;
    return { starts, step };
}

const resolverOf = async (db: DbConnection) =>
    createResolver((await readTimelineTables(db)).snapshot);

/** The placed shapes shown at the end flag */
async function placedAtEnd(db: DbConnection) {
    const r = await resolverOf(db);
    const timelines = await db.select().from(schema.timelines).all();
    const recipes = (await readAllShapeRecipes(db)) as PlacedRecipe[];
    return boxesAt({
        recipes,
        endBeatOf: (id) =>
            id === null ? 0 : timelines.find((t) => t.id === id)?.end_beat,
        beat: WINDOW.end,
        positionOf: (m) => {
            const [x, y] = r.positionAt(m, WINDOW.end);
            return { x, y };
        },
    });
}

describeDbTests("The dragged-out result as a shape (step 4c)", (it) => {
    it("trailShapeOf: a straight result is a Line, a result on one circle an Arc, a corner a Curve through every spot", () => {
        const lineUp: XY[] = [0, 1, 2, 3].map((i) => [i * 10, 0]);
        // Straight on: a Line of two points
        const straight = trailShapeOf(
            planTrailDrag(lineUp, [{ at: [80, 0] }], { kind: "keep" }, 5),
        );
        expect(straight.kind).toBe("line");
        expect(straight.params.points).toHaveLength(2);
        expect(lineTool.readable!(straight.params)).toBe(true);
        // One arc leg long enough for everyone: an Arc
        const arcPlan = planTrailDrag(
            lineUp,
            [{ at: [130, 0], bulge: 0.4 }],
            { kind: "keep" },
            5,
        );
        const arc = trailShapeOf(arcPlan);
        expect(arc.kind).toBe("arc");
        expect(arcTool.readable!(arc.params)).toBe(true);
        arcPlan.spots.forEach((s) =>
            expect(offShape(arc.params, s)).toBeLessThan(1e-6),
        );
        // A corner in the result: a Curve with the corner, through every spot
        const cornerPlan = planTrailDrag(
            lineUp,
            [{ at: [50, 0] }, { at: [50, 25] }],
            { kind: "keep" },
            5,
        );
        const curve = trailShapeOf(cornerPlan);
        expect(curve.kind).toBe("curve");
        expect(lineTool.readable!(curve.params)).toBe(true);
        cornerPlan.spots.forEach((s) =>
            expect(offShape(curve.params, s)).toBeLessThan(1e-6),
        );
        expect(curve.params.points.map((p) => p.tension)).toEqual(
            curve.params.points.map(() => 0),
        );
        // Three marchers round a right-angle corner: any 3 points lie on some circle, but the way
        // doesn't, so it's a Curve with the corner, never half a circle (#830 review)
        const three = planTrailDrag(
            [
                [0, 0],
                [10, 0],
                [20, 0],
            ],
            [{ at: [40, 0] }, { at: [40, 10] }],
            { kind: "keep" },
            5,
        );
        expect(three.spots).toEqual([
            [30, 0],
            [40, 0],
            [40, 10],
        ]);
        const threeShape = trailShapeOf(three);
        expect(threeShape.kind).toBe("curve");
        three.spots.forEach((s) =>
            expect(offShape(threeShape.params, s)).toBeLessThan(1e-6),
        );
    });

    it("QA-DL-12: smooth points and arc legs in the way; the Curve passes through every spot exactly; points that aren't spots hold no marcher", () => {
        const lineUp: XY[] = [0, 1, 2, 3, 4, 5].map((i) => [i * 10, 0]);
        for (const points of [
            // a smooth point
            [{ at: [70, 10] as XY, tension: 1 }, { at: [90, 40] as XY }],
            // an arc leg after a corner, cut where the tail ends inside it
            [{ at: [60, 20] as XY }, { at: [90, 20] as XY, bulge: -0.3 }],
            // a short trail: the line-up and the trail together
            [{ at: [60, 15] as XY }],
        ]) {
            for (const spacing of [
                { kind: "keep" } as const,
                { kind: "even", steps: 1.5 } as const,
            ]) {
                const plan = planTrailDrag(lineUp, points, spacing, 5);
                const shape = trailShapeOf(plan);
                expect(shape.kind).toBe("curve");
                expect(lineTool.readable!(shape.params)).toBe(true);
                plan.spots.forEach((s) =>
                    expect(offShape(shape.params, s)).toBeLessThan(1e-6),
                );
                // Its ends are the first and last spots
                const ps = shape.params.points;
                expect(ps[0]).toMatchObject({
                    x: plan.spots[0]![0],
                    y: plan.spots[0]![1],
                });
                expect(ps.at(-1)).toMatchObject({
                    x: plan.spots.at(-1)![0],
                    y: plan.spots.at(-1)![1],
                });
                // Every point not on a spot holds no marcher
                for (const p of ps.slice(1, -1)) {
                    const onSpot = plan.spots.some(
                        (s) => Math.hypot(s[0] - p.x, s[1] - p.y) < 1e-6,
                    );
                    if (!onSpot) expect(p.marcher).toBe(false);
                }
            }
        }
        // A smooth point in the way is Smooth in the Curve
        const smooth = trailShapeOf(
            planTrailDrag(
                [0, 1, 2, 3, 4, 5].map((i): XY => [i * 10, 0]),
                [{ at: [60, 10], tension: 1 }, { at: [70, 40] }],
                { kind: "keep" },
                5,
            ),
        );
        expect(smooth.params.points.some((p) => p.tension > 0)).toBe(true);
    });

    it("QA-DL-13: a double-click on a Curve point turns it Smooth, and a Corner again, as on a Path pen point", () => {
        const plan = planTrailDrag(
            [0, 1, 2, 3].map((i): XY => [i * 10, 0]),
            [{ at: [50, 0] }, { at: [50, 25] }],
            { kind: "keep" },
            5,
        );
        const { params } = trailShapeOf(plan);
        const inner = params.points.findIndex(
            (p, i) => i > 0 && i < params.points.length - 1,
        );
        expect(inner).toBeGreaterThan(0);
        const n = 4;
        const key = lineTool
            .handles(params, n, { stepPx: 5, snapPoint: (p) => p } as never)
            .find(
                (h) =>
                    Math.hypot(
                        h.at.x - params.points[inner]!.x,
                        h.at.y - params.points[inner]!.y,
                    ) < 1e-9,
            )?.key;
        expect(key).toBeDefined();
        const smooth = lineTool.doubleClickHandle!(
            params,
            n,
            key!,
        ) as LineParams;
        expect(smooth.points[inner]!.tension).toBeGreaterThan(0);
        const back = lineTool.doubleClickHandle!(smooth, n, key!) as LineParams;
        expect(back.points[inner]!.tension).toBe(0);
    });

    it("QA-DL-10: a straight result saves a Line recipe with the spots as written, read back as a Line; one undo step removes it with the move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6];
        const leader = starts.get(6)!;
        const end: XY = [leader[0] + 10 * step, leader[1]];
        const recipesBefore = await readAllShapeRecipes(db);
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points: [{ at: end }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(result.recipeId).toBeDefined();
        const recipe = (await readAllShapeRecipes(db)).find(
            (r) => r.id === result.recipeId,
        )!;
        expect(recipe).toMatchObject({
            kind: "line",
            kindVersion: 2,
            orderMode: "keep",
            reverse: false,
        });
        const transition = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(recipe.timelineId).toBe(transition.timeline_id);
        expect((recipe.params as LineParams).points).toHaveLength(2);
        // Each member where it was written, leader first (step 4g: a Line's first slot leads)
        const r = await resolverOf(db);
        expect(recipe.members.map((m) => m.marcherId)).toEqual(
            [...ids].reverse(),
        );
        recipe.members.forEach((m, q) => {
            expect(m.slot).toBe(q);
            expect([m.x, m.y]).toEqual(r.positionAt(m.marcherId, 17));
        });
        // Opening it moves nobody: the shape tools read it back with every member on its spot
        const placed = await placedAtEnd(db);
        const box = placed.find((b) => b.recipe.id === result.recipeId);
        expect(box?.kind).toBe(lineTool);
        // One undo step takes the recipe with the move
        expect((await performUndo(db)).success).toBe(true);
        expect(await readAllShapeRecipes(db)).toEqual(recipesBefore);
        expect((await performRedo(db)).success).toBe(true);
        expect(
            (await readAllShapeRecipes(db)).some(
                (x) => x.id === result.recipeId,
            ),
        ).toBe(true);
    });

    it("QA-DL-12, QA-DL-14 (DL-14, DL-15): uneven Keep spacing round a corner is a Curve kept as written; a change lays it out evenly and the follow move goes to the new spots", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6];
        const leader = starts.get(6)!;
        const corner: XY = [leader[0] + 10 * step, leader[1]];
        const end: XY = [corner[0], corner[1] - 4 * step];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points: [{ at: corner }, { at: end }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const recipe = (await readAllShapeRecipes(db)).find(
            (x) => x.id === result.recipeId,
        )!;
        expect(recipe.kind).toBe("line");
        const params = recipe.params as LineParams & { spots: number };
        expect(params.spots).toBe(6);
        const placed = (await placedAtEnd(db)).find(
            (b) => b.recipe.id === result.recipeId,
        );
        expect(placed?.kind).toBe(lineTool);
        const r = await resolverOf(db);
        recipe.members.forEach((m) =>
            expect(
                offShape(params, [m.x, m.y]),
                `M${m.marcherId}`,
            ).toBeLessThan(1e-6),
        );
        // The shape laid out by the Line's own rule (as a change to it does) moves the members
        const laidOut = lineTool.shape.generate(params, 6, {
            stepPx: step,
            snapPoint: (p) => p,
        });
        await moveMarchersInTarget({
            db,
            target: { kind: "range", ...WINDOW },
            moves: ids.map((marcherId, q) => ({
                marcherId,
                x: laidOut[q]!.x,
                y: laidOut[q]!.y,
            })),
        });
        const after = await resolverOf(db);
        const t = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(t.path_style).toBe("follow_the_leader");
        ids.forEach((m, q) => {
            const [x, y] = after.positionAt(m, 17);
            expect(Math.hypot(x - laidOut[q]!.x, y - laidOut[q]!.y)).toBeLessThan(1e-6); // prettier-ignore
            // still walking from where they started
            expect(after.positionAt(m, 9)).toEqual(r.positionAt(m, 9));
        });
    });

    it("QA-DL-11: a line on a trail of one arc leg ends on an Arc recipe; Keep end spots saves none", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3];
        const leader = starts.get(3)!;
        const end: XY = [leader[0] + 14 * step, leader[1]];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 3, points: [{ at: end, bulge: 0.35 }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const recipe = (await readAllShapeRecipes(db)).find(
            (x) => x.id === result.recipeId,
        )!;
        expect(recipe).toMatchObject({ kind: "arc", kindVersion: 2 });
        const placed = (await placedAtEnd(db)).find(
            (b) => b.recipe.id === result.recipeId,
        );
        expect(placed?.kind).toBe(arcTool);
        recipe.members.forEach((m) =>
            expect(
                offShape(recipe.params as LineParams, [m.x, m.y]),
            ).toBeLessThan(1e-3),
        );
    });

    it("trailShapeRecipe: members leader first, each at its spot, the shape run from the leader's end", () => {
        const plan = planTrailDrag(
            [0, 1, 2].map((i): XY => [i * 10, 0]),
            [{ at: [40, 0] }],
            { kind: "keep" },
            5,
        );
        // The line tail first: 7, 3, then 9 leading
        const { recipe, members } = trailShapeRecipe(plan, [7, 3, 9]);
        expect(recipe.kind).toBe("line");
        expect((recipe.params as { spots: number }).spots).toBe(3);
        expect(members).toEqual([
            {
                marcherId: 9,
                slot: 0,
                x: plan.spots[2]![0],
                y: plan.spots[2]![1],
            },
            {
                marcherId: 3,
                slot: 1,
                x: plan.spots[1]![0],
                y: plan.spots[1]![1],
            },
            {
                marcherId: 7,
                slot: 2,
                x: plan.spots[0]![0],
                y: plan.spots[0]![1],
            },
        ]);
        const points = (recipe.params as LineParams).points;
        expect([points[0]!.x, points[0]!.y]).toEqual(plan.spots[2]);
        expect([points.at(-1)!.x, points.at(-1)!.y]).toEqual(plan.spots[0]);
    });

    it("reversedLineParams: the same path from its other end, bends moved and turned round", () => {
        const params: LineParams = {
            points: [
                { x: 0, y: 0, tension: 0, bend: 90 },
                { x: 10, y: 0, tension: 1 },
                { x: 20, y: 5, tension: 0, bend: -30 },
                { x: 30, y: 0, tension: 0 },
            ],
            spacing: { mode: "fit" },
        };
        const back = reversedLineParams(params);
        expect(back.points).toEqual([
            { x: 30, y: 0, tension: 0, bend: 30 },
            { x: 20, y: 5, tension: 0 },
            { x: 10, y: 0, tension: 1, bend: -90 },
            { x: 0, y: 0, tension: 0 },
        ]);
        // The same path: each bent segment on the same circle, swept the other way
        const arcs = (p: LineParams) =>
            lineSegments(p).flatMap((seg) =>
                seg.type === "arc"
                    ? [{ x: seg.center.x, y: seg.center.y, r: seg.r, sweep: seg.sweep }] // prettier-ignore
                    : [],
            );
        const there = arcs(params);
        const again = arcs(back).reverse();
        expect(again).toHaveLength(2);
        again.forEach((a, i) => {
            expect(a.x).toBeCloseTo(there[i]!.x, 9);
            expect(a.y).toBeCloseTo(there[i]!.y, 9);
            expect(a.r).toBeCloseTo(there[i]!.r, 9);
            expect(a.sweep).toBeCloseTo(-there[i]!.sweep, 9);
        });
        expect(reversedLineParams(back)).toEqual(params);
    });
});
