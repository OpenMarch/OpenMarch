import { describe, expect, it as test } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { refusalText } from "@/test/refusalText";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { moveMarchersInTarget } from "../timelineMoves";
import { removeTrail, reverseTrail } from "../timelineTrails";
import {
    readAllShapeRecipes,
    saveShapeRecipeInTransaction,
    UNGROUPED_RECIPE_KIND,
} from "../shapeRecipes";
import { rememberedOrderAt } from "../rememberedOrder";
import { dragTrail } from "../timelineTrailDrag";
import { followKeepAt } from "@/pathways/followTool";
import { rippleFormAt, rippleTrail } from "../timelineTrailRipple";
import {
    planRipple,
    rippleArrivalCount,
    rippleEntrance,
    rippleFormProblem,
    ripplePreview,
    type RippleForm,
} from "../timelineTrailRipplePlan";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Ripple into the next form, pathways step 9 (spec Appendix L.10, AP-T12, QA-RP-1 to QA-RP-7 and
 * QA-UNDO-RP), on the converted `marchersAndPages` show: page 2's box is `[9, 17)`, and marchers 1
 * to 8 stand in a level line at its start flag, two steps apart. Marchers 1 to 4 are given end
 * spots on page 2 in a line up and to the right, dealt the other way round (M4 on the near end),
 * as a placed Line recipe; then the line ripples into them, M4 leading.
 */

const TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_routes,
    schema.timeline_shape_recipes,
    schema.timeline_shape_recipe_marchers,
];
const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};
const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);
const tuple = (p: { x: number; y: number }): XY => [p.x, p.y];
const near = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
    Math.abs(a[0]! - b[0]!) <= eps && Math.abs(a[1]! - b[1]!) <= eps;

const WINDOW = { start: 9, end: 17 };
const IDS = [1, 2, 3, 4];

/**
 * The show converted; the end spots of 1 to 4 on page 2 a line 10 steps right and 10 up of M1's
 * start, two steps apart, M4 on its left (near) end and M1 on its right, saved as a Line recipe
 * in that order unless `recipe` is false. `spots[k]` is the form's k-th spot from the left.
 */
async function setUp(db: DbConnection, { recipe = true } = {}) {
    await convertPagesToTimeline(db);
    const r = await resolverOf(db);
    const starts = new Map<number, XY>(
        [1, 2, 3, 4, 5, 6, 7, 8].map((m) => [m, r.positionAt(m, 9) as XY]),
    );
    const step = (starts.get(2)![0] - starts.get(1)![0]) / 2;
    const [x0, y0] = starts.get(1)!;
    const spots: XY[] = [0, 1, 2, 3].map((k) => [
        x0 + (10 + 2 * k) * step,
        y0 - 10 * step,
    ]);
    // M4 on spot 0, M3 on 1, M2 on 2, M1 on 3
    const holders = [4, 3, 2, 1];
    await moveMarchersInTarget({
        db,
        target: { kind: "range", ...WINDOW },
        moves: holders.map((marcherId, k) => ({
            marcherId,
            x: spots[k]![0],
            y: spots[k]![1],
        })),
        ...(recipe
            ? {
                  afterWrite: async (tx, timelineId) => {
                      await saveShapeRecipeInTransaction({
                          tx,
                          timelineId,
                          recipe: {
                              kind: "line",
                              kindVersion: 2,
                              params: {
                                  points: [
                                      { x: spots[0]![0], y: spots[0]![1] },
                                      { x: spots[3]![0], y: spots[3]![1] },
                                  ],
                              },
                              orderMode: "keep",
                              reverse: false,
                          },
                          members: holders.map((marcherId, slot) => ({
                              marcherId,
                              slot,
                              x: spots[slot]![0],
                              y: spots[slot]![1],
                          })),
                      });
                  },
              }
            : {}),
    });
    return { starts, step, spots };
}

const spotsOf = async (db: DbConnection, transitionId: number) =>
    (
        await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                eq(
                    schema.timeline_slot_destinations.transition_id,
                    transitionId,
                ),
            )
            .orderBy(schema.timeline_slot_destinations.slot_index)
            .all()
    ).map((d): XY => [d.x, d.y]);

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    message: RegExp,
) => {
    const before = await dataOf(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect(refusalText(error)).toMatch(message);
    expect(await dataOf(db)).toEqual(before);
};

describeDbTests("Ripple into the next form (AP-T12)", (it) => {
    it("QA-RP-1, QA-UNDO-RP: a straight connector; the form dealt in trail order from the near end; one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, spots } = await setUp(db);
        const before = await dataOf(db);
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }); // prettier-ignore
        expect(result.marcherIds).toEqual([1, 2, 3, 4]);
        expect(result.leaderId).toBe(4);
        // The tail takes the near end (M4's spot now), the leader the far end (M1's)
        expect(result.takes).toEqual([4, 3, 2, 1]);
        expect(await spotsOf(db, result.transitionId)).toEqual(spots);
        const t = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(t).toMatchObject({
            path_style: "follow_the_leader",
            order_mode: "slot",
            dest_shape_id: null,
        });
        expect(JSON.parse(t.path_params!)).toEqual({ waypoints: [] });
        const route = (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, result.routeId))
            .get())!;
        const geometry = JSON.parse(route.geometry);
        expect(geometry.points).toEqual([]);
        expect(geometry.from).toEqual(starts.get(4));
        expect(geometry.to).toEqual(spots[0]);

        // What plays is the drawing's preview, at every quarter beat
        const r = await resolverOf(db);
        const form: RippleForm = { ids: [4, 3, 2, 1], spots };
        const plan = planRipple(
            IDS.map((m) => starts.get(m)!),
            form,
            [],
        );
        for (let b = 9; b <= 17; b += 0.25) {
            const shown = ripplePreview(plan, (b - 9) / 8);
            IDS.forEach((m, q) =>
                expect(near(r.positionAt(m, b), shown[q]!, 1e-9)).toBe(true),
            );
        }
        // Nobody else moves
        for (const m of [5, 6, 7, 8])
            expect(r.positionAt(m, 9)).toEqual(starts.get(m));

        // The Line recipe re-dealt: each spot's row names who stands there, same row ids
        const recipe = (await readAllShapeRecipes(db)).find(
            (x) => x.kind === "line",
        )!;
        const bySlot = [...recipe.members].sort((a, b) => a.slot - b.slot);
        expect(bySlot.map((m) => m.marcherId)).toEqual([1, 2, 3, 4]);
        bySlot.forEach((m, k) => expect([m.x, m.y]).toEqual(spots[k]));
        const rowIdsBefore = (
            before.timeline_shape_recipe_marchers as {
                id: number;
                slot: number;
            }[]
        )
            .map((x) => [x.slot, x.id])
            .sort((a, b) => a[0]! - b[0]!);
        const rowIdsAfter = (
            await db.select().from(schema.timeline_shape_recipe_marchers).all()
        )
            .map((x) => [x.slot, x.id])
            .sort((a, b) => a[0]! - b[0]!);
        expect(rowIdsAfter).toEqual(rowIdsBefore);
        expect(result.recipeRows).toBe(4);

        // The order remembered at page 2's end is the trail's, leader first
        expect(await rememberedOrderAt(db, IDS, 17)).toEqual([4, 3, 2, 1]);

        // One undo step; redo restores the same rows and ids
        const after = await dataOf(db);
        expect((await performUndo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(after);
    });

    it("QA-RP-2: a corner bends the connector, the ends dealt the same", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, spots } = await setUp(db);
        const [x4, y4] = starts.get(4)!;
        const corner: XY = [x4, y4 - 10 * step];
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [{ at: corner }] }); // prettier-ignore
        expect(result.takes).toEqual([4, 3, 2, 1]);
        expect(await spotsOf(db, result.transitionId)).toEqual(spots);
        const r = await resolverOf(db);
        const entry = r.ftlEntry(result.transitionId);
        // The connector: 10 steps up to the corner, then 4 right to the near end
        expect(entry.endDist[3]! - entry.startDist[3]!).toBeCloseTo(
            (10 + 4 + 6) * step,
            9,
        );
        // The leader is at the corner half way through (10 of its 20 steps)
        expect(near(r.positionAt(4, 13), corner, 1e-9)).toBe(true);
    });

    it("QA-RP-3: a finish on the far end's spot enters there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { spots } = await setUp(db);
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [], enter: 1 }); // prettier-ignore
        // M1's spot (the right end) is the entrance: the tail takes it, the leader the left end
        expect(result.takes).toEqual([1, 2, 3, 4]);
        expect(await spotsOf(db, result.transitionId)).toEqual(
            [...spots].reverse(),
        );
    });

    it("QA-RP-5: end spots that don't stand in a form refuse, and Ripple in isn't offered", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await setUp(db, { recipe: false });
        const [x0, y0] = starts.get(1)!;
        // Three in a row and one off it: no line, arc or chain of near neighbors
        const scattered: XY[] = [
            [x0 + 20 * step, y0 - 20 * step],
            [x0 + 22 * step, y0 - 20 * step],
            [x0 + 24 * step, y0 - 20 * step],
            [x0 + 23 * step, y0 - 13 * step],
        ];
        await moveMarchersInTarget({
            db,
            target: { kind: "range", ...WINDOW },
            moves: IDS.map((marcherId, k) => ({
                marcherId,
                x: scattered[k]![0],
                y: scattered[k]![1],
            })),
        });
        expect(
            await rippleFormAt(
                db,
                IDS,
                17,
                new Map(IDS.map((m, k) => [m, scattered[k]!])),
            ),
        ).toBeNull();
        await expectRefused(
            db,
            () => rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }), // prettier-ignore
            /line, curve or arc/,
        );
    });

    it("QA-RP-6: Keep end spots may run straight in with nothing drawn, each keeping its own spot", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { step, spots } = await setUp(db);
        const result = await dragTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [], spacing: { kind: "keep" }, step, ends: "keep" }); // prettier-ignore
        expect(result.marcherIds).toEqual([1, 2, 3, 4]);
        // Everyone keeps their own: M1 the right end, M4 the left
        expect(await spotsOf(db, result.transitionId)).toEqual([
            spots[3],
            spots[2],
            spots[1],
            spots[0],
        ]);
        // From trail still needs a drawn trail
        await performUndo(db);
        await expectRefused(
            db,
            () => dragTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [], spacing: { kind: "keep" }, step, ends: "trail" }), // prettier-ignore
            /too short|Draw/i,
        );
    });

    it("QA-RP-7: after a ripple, Reverse and Remove trail keep the dealt spots", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { spots } = await setUp(db);
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }); // prettier-ignore
        await reverseTrail({ db, routeId: result.routeId });
        let r = await resolverOf(db);
        IDS.forEach((m, q) => expect(r.positionAt(m, 17)).toEqual(spots[q]));
        await removeTrail({ db, routeId: result.routeId });
        r = await resolverOf(db);
        IDS.forEach((m, q) => expect(r.positionAt(m, 17)).toEqual(spots[q]));
    });

    it("review: the line is read where the kept move starts, not at an earlier start flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, spots } = await setUp(db);
        // Page 1 now ends with the line 4 steps lower: page 2's move starts there
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 9 },
            moves: IDS.map((marcherId) => ({
                marcherId,
                x: starts.get(marcherId)![0],
                y: starts.get(marcherId)![1] + 4 * step,
            })),
        });
        const r0 = await resolverOf(db);
        const page2 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        // The tool reads the same line (Keep end spots and Ripple in)
        const keep = (await followKeepAt(db, r0, IDS, 17))!;
        expect([...keep.line!.starts.entries()]).toEqual(
            IDS.map((m) => {
                const [x, y] = r0.positionAt(m, 9);
                return [m, { x, y }];
            }),
        );
        expect(keep.line!.order).toEqual([1, 2, 3, 4]);
        // A window from page 1's start flag, following into page 2's move
        const result = await rippleTrail({ db, window: { start: 1, end: 17 }, marcherIds: IDS, leaderId: 4, points: [], keepMove: page2.id }); // prettier-ignore
        const plan = planRipple(
            IDS.map((m) => r0.positionAt(m, 9) as XY),
            { ids: [4, 3, 2, 1], spots },
            [],
        );
        expect(result.takes).toEqual(plan.takes);
        const r = await resolverOf(db);
        for (let b = 9; b <= 17; b += 0.5) {
            const shown = ripplePreview(plan, (b - 9) / 8);
            IDS.forEach((m, q) =>
                expect(near(r.positionAt(m, b), shown[q]!, 1e-9)).toBe(true),
            );
        }
    });

    it("RP-2 (review): end spots in a 2×2 block, or on the line itself, refuse with their reason", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await setUp(db, { recipe: false });
        const [x0, y0] = starts.get(1)!;
        const place = (at: XY[]) =>
            moveMarchersInTarget({
                db,
                target: { kind: "range", ...WINDOW },
                moves: IDS.map((marcherId, k) => ({
                    marcherId,
                    x: at[k]![0],
                    y: at[k]![1],
                })),
            });
        await place([
            [x0 + 20 * step, y0 - 20 * step],
            [x0 + 22 * step, y0 - 20 * step],
            [x0 + 20 * step, y0 - 22 * step],
            [x0 + 22 * step, y0 - 22 * step],
        ]);
        await expectRefused(
            db,
            () => rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }), // prettier-ignore
            /loop|block/,
        );
        // The line slid two steps along itself
        await place(IDS.map((_, k): XY => [x0 + (2 + 2 * k) * step, y0]));
        await expectRefused(
            db,
            () => rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }), // prettier-ignore
            /walk back through itself/,
        );
    });

    it("RP-2 (re-check): the overlap check reads the line in its own order, not by id", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await setUp(db, { recipe: false });
        const [x0, y0] = starts.get(1)!;
        const at = (x: number, y: number): XY => [x0 + x * step, y0 + y * step];
        // Page 1 ends with the line in an L whose ids don't run along it: M1 (0,0), M3 (2,0),
        // M4 (4,0), M2 (4,2). In id order the line would cut across, from (0,0) to (4,2)
        const L: Record<number, XY> = {
            1: at(0, 0),
            3: at(2, 0),
            4: at(4, 0),
            2: at(4, 2),
        };
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 9 },
            moves: IDS.map((marcherId) => ({
                marcherId,
                x: L[marcherId]![0],
                y: L[marcherId]![1],
            })),
        });
        // The end spots: a straight line along that cut, off the real L
        const form = [0.8, 1.6, 2.4, 3.2].map((t) => at(t, t / 2));
        await moveMarchersInTarget({
            db,
            target: { kind: "range", ...WINDOW },
            moves: IDS.map((marcherId, k) => ({
                marcherId,
                x: form[k]![0],
                y: form[k]![1],
            })),
        });
        const r0 = await resolverOf(db);
        const page2 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        // The tool offers it
        const keep = (await followKeepAt(db, r0, IDS, 17))!;
        expect(keep.line!.order).toEqual([1, 3, 4, 2]);
        const line = keep.line!.order.map((m) =>
            tuple(keep.line!.starts.get(m)!),
        );
        const spots = IDS.map((m) => tuple(keep.spots.get(m)!));
        expect(rippleFormProblem(spots, line)).toBeNull();
        // In id order it would have looked like an overlap
        expect(
            JSON.stringify(
                rippleFormProblem(
                    spots,
                    IDS.map((m) => tuple(keep.line!.starts.get(m)!)),
                ),
            ),
        ).toMatch(/formOverlap/);
        // And the write keeps it: no refusal at the finish
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 2, points: [], keepMove: page2.id }); // prettier-ignore
        expect(result.marcherIds).toEqual([1, 3, 4, 2]);
    });

    it("AP-T12 (review): an ungrouped mark in the move isn't dealt, only shapes are", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const page2 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        const R = schema.timeline_shape_recipes;
        const M = schema.timeline_shape_recipe_marchers;
        const mark = (await db
            .insert(R)
            .values({
                timeline_id: page2.id,
                kind: UNGROUPED_RECIPE_KIND,
                kind_version: 1,
                params: "{}",
                order_mode: "keep",
            })
            .returning()
            .get())!;
        await db.insert(M).values(
            IDS.map((marcher_id, slot) => ({
                recipe_id: mark.id,
                marcher_id,
                slot,
                x: 0,
                y: 0,
            })),
        );
        const before = await db
            .select()
            .from(M)
            .where(eq(M.recipe_id, mark.id))
            .all();
        const result = await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }); // prettier-ignore
        expect(result.recipeRows).toBe(4);
        expect(
            await db.select().from(M).where(eq(M.recipe_id, mark.id)).all(),
        ).toEqual(before);
    });

    it("refusals: a line already rippled, or a middle marcher grabbed", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await expectRefused(
            db,
            () => rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 2, points: [] }), // prettier-ignore
            /end/i,
        );
        await rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }); // prettier-ignore
        await expectRefused(
            db,
            () => rippleTrail({ db, window: WINDOW, marcherIds: IDS, leaderId: 4, points: [] }), // prettier-ignore
            /follow/i,
        );
    });
});

describe("Ripple's plan (pure)", () => {
    test("RP-4: the entrance is the end nearer where the drawing arrives; a finish on an end wins; ties to the form's first", () => {
        const form: RippleForm = {
            ids: [7, 8, 9],
            spots: [
                [0, 0],
                [2, 0],
                [4, 0],
            ],
        };
        expect(rippleEntrance(form, [-1, 0])).toBe(7);
        expect(rippleEntrance(form, [5, 3])).toBe(9);
        expect(rippleEntrance(form, [2, 5])).toBe(7);
        expect(rippleEntrance(form, [-1, 0], 9)).toBe(9);
        // A marcher in the middle isn't an end: the nearer end instead
        expect(rippleEntrance(form, [-1, 0], 8)).toBe(7);
    });

    test("RP-2: open lines, curves and arcs pass; loops, blocks, zigzags and the line itself don't", () => {
        const line: XY[] = [0, 1, 2, 3, 4].map((i) => [2 * i, 0]);
        const away = (pts: XY[]): XY[] =>
            pts.map(([x, y]) => [x + 100, y + 100]);
        const why = (spots: XY[], from: XY[] = line) => {
            const t = rippleFormProblem(spots, from);
            return t ? JSON.stringify(t) : null;
        };
        // A line, an L, a half circle of five: fine
        expect(why(away(line))).toBeNull();
        expect(why(away([[0, 0], [2, 0], [4, 0], [4, 2], [4, 4]]))).toBeNull(); // prettier-ignore
        const half = [0, 1, 2, 3, 4].map(
            (i): XY => [
                10 * Math.cos((i / 4) * Math.PI),
                10 * Math.sin((i / 4) * Math.PI),
            ],
        );
        expect(why(away(half))).toBeNull();
        // Three spots: a right-angle L, a half circle, an uneven straight line (review)
        expect(why(away([[1, 0], [0, 0], [0, 1]]))).toBeNull(); // prettier-ignore
        expect(why(away([[1, 0], [0, 1], [-1, 0]]))).toBeNull(); // prettier-ignore
        expect(why(away([[0, 0], [1, 0], [3.6, 0]]))).toBeNull(); // prettier-ignore
        // A V sharper than about 47° folds back close to itself: its own reason
        const arm = (deg: number, r: number): XY => [
            r * Math.cos((deg * Math.PI) / 180),
            r * Math.sin((deg * Math.PI) / 180),
        ];
        const v = [arm(15, 3), arm(15, 2), arm(15, 1), [0, 0] as XY, arm(-15, 1), arm(-15, 2), arm(-15, 3)]; // prettier-ignore
        expect(why(away(v))).toMatch(/formFold/);
        // A 2×2 box around, a full circle, a 3×2 snake, a box outline: a loop
        expect(why(away([[0, 0], [2, 0], [2, 2], [0, 2]]))).toMatch(/formLoop/); // prettier-ignore
        const circle = [0, 1, 2, 3, 4, 5].map(
            (i): XY => [
                10 * Math.cos((i / 6) * 2 * Math.PI),
                10 * Math.sin((i / 6) * 2 * Math.PI),
            ],
        );
        expect(why(away(circle))).toMatch(/formLoop/);
        expect(why(away([[0, 0], [2, 0], [4, 0], [4, 2], [2, 2], [0, 2]]))).toMatch(/formLoop/); // prettier-ignore
        // A zigzag through scattered spots: not a form
        expect(why(away([[0, 0], [2, 0], [30, 0], [32, 0]]))).toMatch(/notAForm/); // prettier-ignore
        // The line slid along itself, or the line itself: overlap
        expect(why(line.map(([x, y]): XY => [x + 2, y]))).toMatch(
            /formOverlap/,
        );
        expect(why(line)).toMatch(/formOverlap/);
    });

    test("RP-5: the leader's count into the form, to the nearest half count", () => {
        const starts: XY[] = [
            [0, 0],
            [2, 0],
        ];
        const form: RippleForm = {
            ids: [1, 2],
            spots: [
                [2, 6],
                [2, 8],
            ],
        };
        // The leader at (2,0): connector 6, then 2 along the form; 8 in all over 16 counts
        const plan = planRipple(starts, form, []);
        expect(plan.connector).toBeCloseTo(6, 12);
        expect(plan.arrival).toBeCloseTo(0.75, 12);
        expect(rippleArrivalCount(plan, 16)).toBe(12);
        expect(rippleArrivalCount(plan, 7)).toBe(5.5);
        // Ends exact, starts exact
        expect(ripplePreview(plan, 0)).toEqual(starts);
        expect(ripplePreview(plan, 1)).toEqual(form.spots);
    });
});
