import { describe, expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { createResolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import type Page from "@/global/classes/Page";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { readTimelineTables } from "@/timeline/timelineRows";
import { loadTimelineFixture } from "@/timeline/fixtures/loadTimelineFixture";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createMarchers, deleteMarchers } from "../marcher";
import { createTimelinesInTransaction } from "../timelines";
import { setTimelineTransitionDestination } from "../timelineTransitions";
import { shiftTimeline } from "../timelineCommands";
import {
    addMarchersToTimeline,
    removeAssignmentFromTimeline,
    removeMarchersFromTimeline,
    type BeatRange,
} from "../timelineMembership";
import { TimelineWriteError } from "../timelineErrors";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
} from "@/test/timelineMode";

keepFixturesInPageMode(
    "adversarial P8.14 tests set up timeline mode themselves",
);

/** Adversarial tests for P8.14 (ui.md UI-9 membership). */

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const fresh = async (db: DbConnection) =>
    createResolver((await readTimelineTables(db)).snapshot);

const BEATS = Array.from({ length: 4 * 40 + 1 }, (_, i) => i / 4);

const sample = async (
    db: DbConnection,
    beats: readonly number[] = BEATS,
): Promise<Map<number, XY[]>> => {
    const r = await fresh(db);
    return new Map(
        r.marcherIds().map((id) => [id, beats.map((b) => r.positionAt(id, b))]),
    );
};

/** The beats (and marchers) where `after` differs from `before` by more than 1e-9. */
const diffs = (
    before: Map<number, XY[]>,
    after: Map<number, XY[]>,
    beats: readonly number[] = BEATS,
) => {
    const out: { marcher: number; beat: number; before: XY; after: XY }[] = [];
    for (const [id, points] of before)
        points.forEach((p, i) => {
            const q = after.get(id)![i]!;
            if (Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9)
                out.push({ marcher: id, beat: beats[i]!, before: p, after: q });
        });
    return out;
};

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    code: string,
    message?: RegExp,
) => {
    const before = await snapshot(db);
    const error = await write().then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    if (message) expect((error as Error).message).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

const flagOn = async (db: DbConnection) => {
    await setTimelineModeFlag(db, true);
};

const homeOf = async (db: DbConnection, id: number): Promise<XY> => {
    const m = await db
        .select()
        .from(schema.marchers)
        .where(eq(schema.marchers.id, id))
        .get();
    return [m!.home_x, m!.home_y];
};

/** Gives `marcher` a move over `range` ending at `to` (own one-slot transition). */
const move = async (
    db: DbConnection,
    marcher: number,
    range: BeatRange,
    to: XY,
) => {
    const r = await addMarchersToTimeline({ db, range, marcherIds: [marcher] });
    await setTimelineTransitionDestination({
        db,
        transitionId: r.added[0]!.transitionId,
        destination: { kind: "individual", points: [to] },
    });
    return r;
};

const layersOf = async (db: DbConnection, marcher: number) =>
    (
        await db
            .select({
                start: schema.timeline_assignments.start_beat,
                end: schema.timeline_assignments.end_beat,
                layer: schema.timeline_assignments.layer,
            })
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.marcher_id, marcher))
            .all()
    ).sort((a, b) => a.start - b.start || b.end - a.end);

const setUpConverted = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await flagOn(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

const pageRange = (pages: readonly Page[], i: number): BeatRange => ({
    start: pageEndBeat(pages[i - 1]!),
    end: pageEndBeat(pages[i]!),
});

/** Inside page `i`'s move, two beats in from each flag (a converted page's own range is stored). */
const insidePage = (pages: readonly Page[], i: number): BeatRange => {
    const { start, end } = pageRange(pages, i);
    return { start: start + 2, end: end - 2 };
};

describeDbTests("P8.14 adversarial", (it) => {
    describe("add is motion-neutral on linear paths", () => {
        it("(a) every page of a converted show: its own range is refused (everyone is in), a range inside it is motion-neutral", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUpConverted(db);
            const ids = marchersAndPages.expectedMarchers.map((m) => m.id);
            const beats = Array.from(
                { length: pageEndBeat(pages[pages.length - 1]!) * 4 + 1 },
                (_, i) => i / 4,
            );
            // Pages too short for a range inside them are skipped; at least one must not be
            let insideRuns = 0;
            for (let i = 1; i < pages.length; i++) {
                // P9.10 stores a timeline per page move with every marcher in it
                await expectRefused(
                    db,
                    () =>
                        addMarchersToTimeline({
                            db,
                            range: pageRange(pages, i),
                            marcherIds: [ids[i % ids.length]!],
                        }),
                    "E-ARGS",
                    /already in this timeline/,
                );
                const range = insidePage(pages, i);
                if (range.end <= range.start) continue;
                insideRuns++;
                const before = await sample(db, beats);
                await addMarchersToTimeline({
                    db,
                    range,
                    marcherIds: [
                        ids[i % ids.length]!,
                        ids[(i + 1) % ids.length]!,
                    ],
                });
                expect(diffs(before, await sample(db, beats), beats)).toEqual(
                    [],
                );
            }
            expect(insideRuns).toBeGreaterThan(0);
            expect(await violations(db)).toEqual([]);
        });

        it("(b) adding to an existing stored timeline holding someone else's move", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const [a, b, c] = marchersAndPages.expectedMarchers.map(
                (m) => m.id,
            );
            const ha = await homeOf(db, a!);
            const hb = await homeOf(db, b!);
            await move(db, a!, { start: 0, end: 16 }, [ha[0] + 80, ha[1] + 40]);
            await move(db, b!, { start: 16, end: 24 }, [hb[0] - 30, hb[1]]);
            const before = await sample(db);
            const r = await addMarchersToTimeline({
                db,
                range: { start: 0, end: 16 },
                marcherIds: [b!, c!],
            });
            expect(r.createdTimeline).toBe(false);
            expect(diffs(before, await sample(db))).toEqual([]);
        });

        it("(c) nested ranges inside a long move, several levels, layers up", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const h = await homeOf(db, a);
            await move(db, a, { start: 0, end: 32 }, [h[0] + 96, h[1] - 64]);
            const ranges: [BeatRange, number][] = [
                [{ start: 4, end: 20 }, 1],
                [{ start: 6, end: 18 }, 2],
                [{ start: 8, end: 12 }, 3],
                [{ start: 9, end: 10 }, 4],
                [{ start: 12, end: 18 }, 3], // shares 6..18's end, after 8..12
                [{ start: 0, end: 4 }, 1], // shares the outer start
                [{ start: 20, end: 32 }, 1], // shares the outer end
                [{ start: 4, end: 6 }, 2],
            ];
            for (const [range, layer] of ranges) {
                const before = await sample(db);
                const r = await addMarchersToTimeline({
                    db,
                    range,
                    marcherIds: [a],
                });
                expect(
                    r.added.map((x) => x.layer),
                    `layer for [${range.start}, ${range.end})`,
                ).toEqual([layer]);
                expect(
                    diffs(before, await sample(db)),
                    `motion for [${range.start}, ${range.end})`,
                ).toEqual([]);
            }
            expect(await violations(db)).toEqual([]);
        });

        it("(c') golden G3: adds inside the stacked steals keep the vector", async ({
            db,
            marchersAndPages: _,
        }) => {
            await flagOn(db);
            const g3 = GOLDEN_FIXTURES.find((g) => g.name === "G3")!.build();
            const loaded = await loadTimelineFixture(db, g3);
            const m = loaded.marchers.get(1)!;
            const cases: [BeatRange, number | RegExp][] = [
                [{ start: 10, end: 12 }, 2],
                [{ start: 7, end: 9 }, 3],
                [{ start: 12, end: 16 }, 1],
                [{ start: 1, end: 3 }, 1],
                [{ start: 5, end: 7 }, /only partly overlaps/],
                [{ start: 3, end: 13 }, /inside/],
                [{ start: 8, end: 14 }, /only partly overlaps/],
            ];
            for (const [range, expected] of cases) {
                const before = await sample(db);
                if (expected instanceof RegExp) {
                    await expectRefused(
                        db,
                        () =>
                            addMarchersToTimeline({
                                db,
                                range,
                                marcherIds: [m],
                            }),
                        "E-ARGS",
                        expected,
                    );
                    continue;
                }
                const r = await addMarchersToTimeline({
                    db,
                    range,
                    marcherIds: [m],
                });
                expect(r.added[0]!.layer, `[${range.start},${range.end})`).toBe(
                    expected,
                );
                expect(
                    diffs(before, await sample(db)),
                    `[${range.start},${range.end})`,
                ).toEqual([]);
            }
            expect(await violations(db)).toEqual([]);
        });

        it("(d) a range over a hold between two moves", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const h = await homeOf(db, a);
            await move(db, a, { start: 0, end: 4 }, [h[0] + 40, h[1]]);
            await move(db, a, { start: 8, end: 12 }, [h[0] + 40, h[1] + 40]);
            const before = await sample(db);
            const r = await addMarchersToTimeline({
                db,
                range: { start: 4, end: 8 },
                marcherIds: [a],
            });
            expect(r.added[0]!.layer).toBe(0);
            expect(diffs(before, await sample(db))).toEqual([]);
            // After the last move, too
            const r2 = await addMarchersToTimeline({
                db,
                range: { start: 12, end: 30 },
                marcherIds: [a],
            });
            expect(r2.added[0]!.layer).toBe(0);
            expect(diffs(before, await sample(db))).toEqual([]);
            // Around the hold and a move: refused
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: 2, end: 10 },
                        marcherIds: [a],
                    }),
                "E-ARGS",
            );
        });

        it("(d') a range spanning two page moves of a converted show holds the marcher's page timelines: refused", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUpConverted(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const range = {
                start: pageRange(pages, 2).start,
                end: pageRange(pages, 3).end,
            };
            // P9.10 stores a timeline per page, so the range holds two of the marcher's timelines
            // and adding would replace those moves (lead decision: refused)
            await expectRefused(
                db,
                () => addMarchersToTimeline({ db, range, marcherIds: [a] }),
                "E-ARGS",
                /inside/,
            );
        });
    });

    describe("menu range from a converted page's clip", () => {
        it("right-clicking a converted page's clip finds its timeline: no new timeline, no motion change", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUpConverted(db);
            const timelinesBefore = await db
                .select()
                .from(schema.timelines)
                .all();
            // P9.10: one timeline per page move, the first from page 0's flag at beat 1
            const first = timelinesBefore.find(
                (t) => t.start_beat === pageRange(pages, 1).start,
            )!;
            expect([first.start_beat, first.end_beat]).toEqual([
                pageRange(pages, 1).start,
                pageRange(pages, 1).end,
            ]);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const before = await sample(db);
            // What the clip menu sends: the clip's stored spec range (TimelineRangeMenuAdversarial
            // covers the UI side, including a clip from spec beat 0)
            const sent = { start: first.start_beat, end: first.end_beat };
            const r = await addMarchersToTimeline({
                db,
                range: sent,
                marcherIds: [a],
            }).then(
                (x) => x,
                (e: unknown) => e as Error,
            );
            // Expected (UI-9): the marcher is already in the clip's timeline, so nothing changes
            expect(r).toBeInstanceOf(TimelineWriteError);
            expect(diffs(before, await sample(db))).toEqual([]);
            expect(await db.select().from(schema.timelines).all()).toEqual(
                timelinesBefore,
            );
        });
    });

    describe("refusals", () => {
        it("mixed batch: in, new, and partial overlap; reports the whole edit's behavior", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const [a, b, c] = marchersAndPages.expectedMarchers.map(
                (m) => m.id,
            );
            await addMarchersToTimeline({
                db,
                range: { start: 0, end: 8 },
                marcherIds: [a!],
            });
            await addMarchersToTimeline({
                db,
                range: { start: 4, end: 12 },
                marcherIds: [c!],
            });
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: 0, end: 8 },
                        marcherIds: [a!, b!, c!],
                    }),
                "E-ARGS",
                /only partly overlaps/,
            );
        });

        it("a second timeline over an identical range is never created by add", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const r1 = await addMarchersToTimeline({
                db,
                range: { start: 2, end: 6 },
                marcherIds: [a!],
            });
            await removeMarchersFromTimeline({
                db,
                timelineId: r1.timelineId,
                marcherIds: [a!],
            });
            const r2 = await addMarchersToTimeline({
                db,
                range: { start: 2, end: 6 },
                marcherIds: [b!],
            });
            expect(r2.timelineId).toBe(r1.timelineId);
            expect(
                (await db.select().from(schema.timelines).all()).length,
            ).toBe(1);
        });

        it("a clip move can make two timelines share a range (backlog); add still counts a marcher in either as already in", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            await addMarchersToTimeline({
                db,
                range: { start: 0, end: 8 },
                marcherIds: [a!],
            });
            const y = await addMarchersToTimeline({
                db,
                range: { start: 8, end: 16 },
                marcherIds: [b!],
            });
            const shifted = await shiftTimeline({
                db,
                timelineId: y.timelineId,
                delta: -8,
            }).then(
                () => true,
                () => false,
            );
            // Range edits aren't guarded by one timeline per range (ui.md backlog)
            if (!shifted) return;
            // b is in y, now over [0, 8): adding b to [0, 8) is refused, not a second move
            await expectRefused(
                db,
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: 0, end: 8 },
                        marcherIds: [b!],
                    }),
                "E-ARGS",
                /already in this timeline/,
            );
            expect(await layersOf(db, b!)).toEqual([
                { start: 0, end: 8, layer: 0 },
            ]);
        });
    });

    describe("remove", () => {
        it("removing a standalone move: the marcher holds where it is, then later moves start from there", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const h = await homeOf(db, a);
            const p: XY = [h[0] + 40, h[1]];
            const q: XY = [h[0] + 40, h[1] + 40];
            const first = await move(db, a, { start: 0, end: 8 }, p);
            await move(db, a, { start: 8, end: 16 }, q);
            const result = await removeMarchersFromTimeline({
                db,
                timelineId: first.timelineId,
                marcherIds: [a],
            });
            expect(result.deletedTransitionIds).toEqual([
                first.added[0]!.transitionId,
            ]);
            const r = await fresh(db);
            for (const beat of [0, 2, 4, 7.5, 8])
                expect(r.positionAt(a, beat)).toEqual(h);
            // the later move starts from home and still ends at q
            expect(r.positionAt(a, 12)).toEqual([h[0] + 20, h[1] + 20]);
            expect(r.positionAt(a, 16)).toEqual(q);
            expect(
                (await db.select().from(schema.timelines).all()).map(
                    (t) => t.id,
                ),
            ).toContain(first.timelineId);
            // The page box re-adds into the same timeline, ending where it stands now (home)
            const again = await addMarchersToTimeline({
                db,
                range: { start: 0, end: 8 },
                marcherIds: [a],
            });
            expect(again.timelineId).toBe(first.timelineId);
            expect(again.createdTimeline).toBe(false);
            const dest = await db
                .select()
                .from(schema.timeline_slot_destinations)
                .where(
                    eq(
                        schema.timeline_slot_destinations.transition_id,
                        again.added[0]!.transitionId,
                    ),
                )
                .get();
            expect([dest!.x, dest!.y]).toEqual(h);
            expect(await violations(db)).toEqual([]);
        });

        it("removing an edited nested steal returns the outer move to its line", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const h = await homeOf(db, a);
            await move(db, a, { start: 0, end: 16 }, [h[0] + 64, h[1]]);
            const original = await sample(db);
            const nested = await move(db, a, { start: 4, end: 8 }, [
                h[0],
                h[1] + 50,
            ]);
            // Edited: the outer move resumes from the new point and still ends where it ended
            const edited = await fresh(db);
            expect(edited.positionAt(a, 8)).toEqual([h[0], h[1] + 50]);
            expect(edited.positionAt(a, 16)).toEqual([h[0] + 64, h[1]]);
            await removeMarchersFromTimeline({
                db,
                timelineId: nested.timelineId,
                marcherIds: [a],
            });
            expect(diffs(original, await sample(db))).toEqual([]);
        });

        it("the inspector's remove on a shared page move leaves a vacant slot and the marcher holds over that page", async ({
            db,
            marchersAndPages,
        }) => {
            const pages = await setUpConverted(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const range = pageRange(pages, 3);
            const row = (
                await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(eq(schema.timeline_assignments.marcher_id, a))
                    .all()
            ).find((r) => r.start_beat === range.start)!;
            expect(row).toBeDefined();
            const before = await fresh(db);
            const res = await removeAssignmentFromTimeline({
                db,
                assignmentId: row.id,
            });
            expect(res.leftVacant).toEqual([
                { transitionId: row.transition_id, slotIndex: row.slot_index },
            ]);
            expect(res.deletedTransitionIds).toEqual([]);
            const r = await fresh(db);
            const start = before.positionAt(a, range.start);
            for (const beat of [
                range.start,
                (range.start + range.end) / 2,
                range.end,
            ])
                expect(r.positionAt(a, beat)).toEqual(start);
            // the next page's move ends where it ended
            const next = pageRange(pages, 4);
            expect(r.positionAt(a, next.end)).toEqual(
                before.positionAt(a, next.end),
            );
            expect(r.diagnostics().some((d) => d.code === "D-VACANT")).toBe(
                true,
            );
        });
    });

    describe("new marchers", () => {
        it("join every stored timeline in start order, nested 4 deep, skipping partial overlaps and duplicate ranges", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const a = marchersAndPages.expectedMarchers[0]!.id;
            const h = await homeOf(db, a);
            await move(db, a, { start: 0, end: 32 }, [h[0] + 64, h[1] + 8]);
            const made = await transactionWithHistory(db, "t", (tx) =>
                createTimelinesInTransaction({
                    tx,
                    allowSharedRanges: true,
                    newTimelines: [
                        { startBeat: 8, endBeat: 9 },
                        { startBeat: 6, endBeat: 10 },
                        { startBeat: 4, endBeat: 12 },
                        { startBeat: 10, endBeat: 40 }, // partly overlaps [0, 32)
                        { startBeat: 4, endBeat: 12 }, // a duplicate range
                        { startBeat: 32, endBeat: 36 },
                        { startBeat: 0, endBeat: 2 },
                    ],
                }),
            );
            const before = await sample(db);
            const snapBefore = await snapshot(db);
            const [created] = await createMarchers({
                db,
                newMarchers: [
                    { section: "Trumpet", drill_prefix: "N", drill_order: 1 },
                ],
            });
            const id = created!.id;
            const home = await homeOf(db, id);
            const rows = await db
                .select({
                    timeline: schema.timeline_transitions.timeline_id,
                    layer: schema.timeline_assignments.layer,
                })
                .from(schema.timeline_assignments)
                .innerJoin(
                    schema.timeline_transitions,
                    eq(
                        schema.timeline_transitions.id,
                        schema.timeline_assignments.transition_id,
                    ),
                )
                .where(eq(schema.timeline_assignments.marcher_id, id))
                .all();
            const tl = await db.select().from(schema.timelines).all();
            const range = (tid: number) => {
                const t = tl.find((x) => x.id === tid)!;
                return `${t.start_beat}-${t.end_beat}`;
            };
            const got = rows
                .map((r) => `${range(r.timeline)}@${r.layer}`)
                .sort();
            expect(got).toEqual(
                [
                    "0-32@0",
                    "0-2@1",
                    "4-12@1",
                    "6-10@2",
                    "8-9@3",
                    "32-36@0",
                ].sort(),
            );
            // one of the [4,12) pair joined
            expect(
                rows.filter((r) =>
                    made
                        .filter((m) => m.start_beat === 4)
                        .some((m) => m.id === r.timeline),
                ).length,
            ).toBe(1);
            const after = await sample(db);
            expect(diffs(before, after)).toEqual([]);
            for (const p of after.get(id)!) expect(p).toEqual(home);
            expect(await violations(db)).toEqual([]);

            // delete keeps every timeline
            const tlCount = tl.length;
            await deleteMarchers({ db, marcherIds: new Set([id]) });
            expect(
                (await db.select().from(schema.timelines).all()).length,
            ).toBe(tlCount);
            const afterDelete = await snapshot(db);
            expect(afterDelete).toEqual({
                ...snapBefore,
                // sqlite may reuse nothing; compare ids of rows only
            });
            expect(await violations(db)).toEqual([]);
        });

        it("a new marcher stands at home at every beat in a converted show", async ({
            db,
            marchersAndPages: _,
        }) => {
            const pages = await setUpConverted(db);
            const end = pageEndBeat(pages[pages.length - 1]!);
            const beats = Array.from({ length: end * 4 + 1 }, (_, i) => i / 4);
            await addMarchersToTimeline({
                db,
                range: insidePage(pages, 2),
                marcherIds: [_.expectedMarchers[0]!.id],
            });
            const before = await sample(db, beats);
            const [created] = await createMarchers({
                db,
                newMarchers: [
                    { section: "Trumpet", drill_prefix: "N", drill_order: 1 },
                ],
            });
            const home = await homeOf(db, created!.id);
            const after = await sample(db, beats);
            expect(diffs(before, after, beats)).toEqual([]);
            for (const p of after.get(created!.id)!) expect(p).toEqual(home);
            // Each page timeline (P9.10) at layer 0, and the range inside page 2 one layer up
            const expected = [];
            for (let i = 1; i < pages.length; i++) {
                const range = pageRange(pages, i);
                if (range.end > range.start)
                    expected.push({ ...range, layer: 0 });
                if (i === 2)
                    expected.push({ ...insidePage(pages, 2), layer: 1 });
            }
            expect(await layersOf(db, created!.id)).toEqual(expected);
            expect(end).toBe(pageRange(pages, pages.length - 1).end);
        });
    });

    describe("history: one undo step each, rows restored exactly", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "add (new timeline), add (existing), remove, inspector remove, create marcher, delete marcher",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                await flagOn(db);
                const [a, b, c] = marchersAndPages.expectedMarchers.map(
                    (m) => m.id,
                );
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const r = await addMarchersToTimeline({
                    db,
                    range: { start: 0, end: 16 },
                    marcherIds: [a!],
                });
                await addMarchersToTimeline({
                    db,
                    range: { start: 0, end: 16 },
                    marcherIds: [b!, c!],
                });
                await addMarchersToTimeline({
                    db,
                    range: { start: 4, end: 8 },
                    marcherIds: [a!, b!],
                });
                await removeMarchersFromTimeline({
                    db,
                    timelineId: r.timelineId,
                    marcherIds: [c!],
                });
                const row = await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(eq(schema.timeline_assignments.marcher_id, b!))
                    .get();
                await removeAssignmentFromTimeline({
                    db,
                    assignmentId: row!.id,
                });
                const [created] = await createMarchers({
                    db,
                    newMarchers: [
                        {
                            section: "Trumpet",
                            drill_prefix: "N",
                            drill_order: 1,
                        },
                    ],
                });
                await deleteMarchers({
                    db,
                    marcherIds: new Set([created!.id, a!]),
                });
                await expectNumberOfChanges.test(db, 7, state);
            },
        );
    });

    describe("undo/redo exactness for each op", () => {
        it("each op is one undo that restores the rows exactly", async ({
            db,
            marchersAndPages,
        }) => {
            await flagOn(db);
            const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
            const ops: (() => Promise<unknown>)[] = [
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: 0, end: 16 },
                        marcherIds: [a!, b!],
                    }),
                () =>
                    addMarchersToTimeline({
                        db,
                        range: { start: 4, end: 8 },
                        marcherIds: [a!],
                    }),
                async () => {
                    const t = (
                        await db.select().from(schema.timelines).all()
                    ).find((x) => x.start_beat === 0)!;
                    await removeMarchersFromTimeline({
                        db,
                        timelineId: t.id,
                        marcherIds: [b!],
                    });
                },
                () =>
                    createMarchers({
                        db,
                        newMarchers: [
                            {
                                section: "Trumpet",
                                drill_prefix: "N",
                                drill_order: 1,
                            },
                        ],
                    }),
                () => deleteMarchers({ db, marcherIds: new Set([a!]) }),
            ];
            for (const op of ops) {
                const before = await snapshot(db);
                await op();
                const after = await snapshot(db);
                expect(after).not.toEqual(before);
                expect((await performUndo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(before);
                expect((await performRedo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(after);
                expect(await violations(db)).toEqual([]);
            }
        });
    });
});
