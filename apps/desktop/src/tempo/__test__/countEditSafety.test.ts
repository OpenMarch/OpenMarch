import { expect } from "vitest";
import { asc, sql } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { performUndo } from "@/db-functions/history";
import { deleteCounts, insertCounts } from "../tempoWrites";
import {
    beatIds,
    buildRichShow,
    dumpAll,
    expectNoProblems,
    positionsAt,
    readState,
} from "./countEditShow";
import {
    applyAndCheck,
    describeEdit,
    durations,
    measureSpan,
    respacedFor,
    type CountEdit,
} from "./countEditCheck";

/**
 * Adding and removing counts in tempo mode never loses data and never moves what the user didn't
 * ask to move. Every case runs one edit on the rich show (`countEditShow.ts`) through
 * `applyAndCheck` (`countEditCheck.ts`), which compares every table, every count's length and
 * second, every move edge and every marcher's resolved position against the state before, then
 * undoes and redoes the edit and compares full dumps.
 *
 * The edits are the ones the tempo band offers (TempoBand `askAdd`, `askRemove`):
 *
 * - add a count before or after a count, or a measure before a measure: **shift** (`adjust`: the
 *   move over the spot stretches, later music moves later), or for one count **keep everything
 *   else in place** (`keep` with the measure's counts respaced so later music stays put);
 * - remove a count, a measure or a selection: **shift** (`adjust`), or for one count **keep
 *   everything else in place** (`keep`, respaced);
 *
 * plus `keep` without re-spacing, which `insertCounts`/`deleteCounts` accept.
 */

type Choice = "shift" | "keepInPlace" | "keepOnly";

/** A spot in the rich show, and what to do there */
interface Case {
    name: string;
    kind: "add" | "remove";
    /** add: the count the new counts go before; remove: the first count removed */
    at: number;
    /** add: how many; remove: one past the last count removed */
    count: number;
    choices: readonly Choice[];
    /** A new measure before the measure starting at `at` (Add a measure before) */
    measure?: boolean;
    /** The edit is refused (and must write nothing) */
    refused?: RegExp;
    /**
     * The flag prop is put down at count 22 by marcher 1 mid-move (page 3's move, counts 17–25):
     * an edit that re-times that move puts it down somewhere else (see "behavior the owner should
     * know about"): for every choice, or only for these
     */
    propMoves?: boolean | readonly Choice[];
    /**
     * The edit makes the keyframe (marchers 1–3, counts 11–14) end where page 2's move under it
     * now ends, which hides page 2's set for them (see "behavior the owner should know about")
     */
    layerTie?: boolean;
}

const ONE: readonly Choice[] = ["shift", "keepInPlace", "keepOnly"];
const MANY: readonly Choice[] = ["shift", "keepOnly"];

const add = (
    name: string,
    at: number,
    count = 1,
    more: Partial<Case> = {},
): Case => ({
    name,
    kind: "add",
    at,
    count,
    choices: count === 1 ? ONE : MANY,
    ...more,
});
const remove = (
    name: string,
    from: number,
    to = from + 1,
    more: Partial<Case> = {},
): Case => ({
    name,
    kind: "remove",
    at: from,
    count: to,
    choices: to - from === 1 ? ONE : MANY,
    ...more,
});

/** Edits inside page 3's move (counts 17–25), which carries the flag to where it is put down */
const PAGE3 = { propMoves: true };
/** Edits that re-time page 3's move only when it stretches (with keep it keeps its counts) */
const PAGE3_SHIFT = { propMoves: ["shift"] as const };

const CASES: Case[] = [
    // ---- adding
    add("before count 1 (the first page's first count)", 1),
    add("on a measure's count 1 (m. 2)", 5),
    add("at a page boundary (before page 2's count 1)", 9),
    add("on a keyframe's first count (11)", 11),
    add("inside a move and a keyframe (13)", 13),
    add("after a keyframe's last count (14)", 14),
    add("after a move's last count, at page 3's flag (17)", 17),
    add("on the hold (20)", 20, 1, PAGE3),
    add("on a 7/8 measure's count 1 (21)", 21, 1, PAGE3),
    add("after the flag is put down (23)", 23, 1, PAGE3_SHIFT),
    add("on a shape's first count (27)", 27),
    add("inside a shape's animation, on a tempo point (29)", 29),
    add("after a shape's last count (31)", 31),
    add("at page 6's flag (41)", 41),
    add("inside the last page (45)", 45),
    add("right after the last page (49)", 49),
    add("past the last page (60)", 60),
    add("past the stored counts (120)", 120),
    add("several counts inside a move (13, 3 counts)", 13, 3),
    add(
        "several counts before a keyframe, pushing it past the move's kept end (11, 6 counts)",
        11,
        6,
    ),
    add(
        "several counts before a keyframe, pushing its end onto the move's kept end (10, 3 counts)",
        10,
        3,
    ),
    add("several counts at a page boundary (25, 2 counts)", 25, 2, PAGE3_SHIFT),
    add("several counts inside the last page (44, 2 counts)", 44, 2),
    add("a measure before m. 2 (4 counts at 5)", 5, 4, { measure: true }),
    add("a measure before the 7/8 m. 6 (3 counts at 21)", 21, 3, {
        measure: true,
        ...PAGE3,
    }),
    add("a measure before m. 8, numbered 101 with mark B (4 at 27)", 27, 4, {
        measure: true,
    }),
    add("a measure before m. 12 in the last page (4 at 43)", 43, 4, {
        measure: true,
    }),
    // ---- removing
    remove("count 1 (the first page's first count)", 1),
    remove("a move's first count at a page flag (9)", 9),
    remove("a keyframe's first count (11)", 11),
    remove("a cue's count, with a cue right after (12)", 12),
    remove("a keyframe's last count, with a cue and prop changes (13)", 13),
    remove("the count the flag is picked up on (14)", 14),
    remove("a move's last count before a page flag (16)", 16),
    remove("page 3's first count, with a cue (17)", 17, 18, PAGE3),
    remove("the hold, with a cue (20)", 20, 21, PAGE3),
    remove("a 7/8 measure's first count (21)", 21, 22, PAGE3),
    remove("the count the flag is put down on (22)", 22, 23, PAGE3),
    remove("inside a shape's animation, on a tempo point and a cue (29)", 29),
    remove("page 6's first count (41)", 41),
    remove("inside the last page, on a cue and a note (44)", 44),
    remove("the last page's last count (48)", 48),
    remove("the count right after the last page (49)", 49),
    remove("past the last page, on a cue (60)", 60),
    remove("past the stored counts (120)", 120),
    remove("several counts inside a move, with cues (12–13)", 12, 14),
    remove("the whole 7/8 m. 6 (21–23)", 21, 24, PAGE3),
    remove(
        "the whole m. 7, with a cue and the phrase's start (24–26)",
        24,
        27,
        PAGE3,
    ),
    remove("the whole m. 9 after a renumbered measure (31–34)", 31, 35),
    remove("the whole m. 10, numbered -3 (35–38)", 35, 39),
    remove("the whole m. 12 with mark C, in the last page (43–46)", 43, 47),
    remove(
        "a selection across a measure line and page 3's flag (15–18)",
        15,
        19,
        PAGE3,
    ),
    remove(
        "a selection across page 4's flag, with a cue (23–25)",
        23,
        26,
        PAGE3,
    ),
    remove("a selection across page 6's flag (39–42)", 39, 43),
    // marcher 1 holds the flag, so where it puts it down moves with its path too
    remove(
        "every count between a keyframe's end and the page's end (14–16)",
        14,
        17,
        {
            layerTie: true,
            propMoves: true,
        },
    ),
    // ---- refused
    remove("a shape's whole animation (27–30)", 27, 31, {
        refused: /noCounts/,
    }),
    remove("a keyframe's every count (11–13)", 11, 14, {
        refused: /noCounts/,
    }),
    remove("the whole page 3 (17–24)", 17, 25, {
        refused: /would remove a page/,
    }),
    remove("the whole last page (41–48)", 41, 49, {
        refused: /would remove a page/,
    }),
];

/** The edit a choice makes at a case, read from the show now (as the band reads it) */
async function editFor(
    db: DbConnection,
    c: Case,
    choice: Choice,
): Promise<CountEdit> {
    const d = await durations(db);
    if (c.kind === "add") {
        // the new counts get the length of the count before (TempoBand `len`)
        const len = d[Math.max(1, c.at - 1)] ?? 0.5;
        const edit: CountEdit = {
            kind: "insert",
            at: c.at,
            count: c.count,
            duration: len,
            drill: choice === "shift" ? "adjust" : "keep",
        };
        if (choice === "keepInPlace") {
            const span = await measureSpan(db, c.at === 1 ? 1 : c.at - 1);
            edit.respaced = respacedFor(d, span, {
                kind: "insert",
                at: c.at,
                count: c.count,
                len,
            });
        }
        return edit;
    }
    const edit: CountEdit = {
        kind: "delete",
        from: c.at,
        to: c.count,
        drill: choice === "shift" ? "adjust" : "keep",
    };
    if (choice === "keepInPlace") {
        const span = await measureSpan(db, c.at);
        edit.respaced = respacedFor(d, span, {
            kind: "delete",
            from: c.at,
            to: c.count,
        });
    }
    return edit;
}

describeDbTests(
    "count edits on a rich show: nothing lost, nothing moved",
    (it) => {
        for (const c of CASES)
            for (const choice of c.choices)
                it(`${c.kind} ${c.name}: ${choice}`, async ({
                    db,
                    marchersAndPages: _,
                }) => {
                    await buildRichShow(db);
                    const edit = await editFor(db, c, choice);
                    const outcome = c.measure
                        ? await applyAndCheck(db, edit, {
                              newMeasure: true,
                              run: () =>
                                  insertCounts({
                                      ...(edit as Extract<
                                          CountEdit,
                                          { kind: "insert" }
                                      >),
                                      measure: true,
                                  }),
                          })
                        : await applyAndCheck(db, edit);
                    if (c.refused) {
                        expect(
                            String(
                                (outcome.error as Error | undefined)?.message,
                            ),
                            describeEdit(edit),
                        ).toMatch(c.refused);
                    } else
                        expect(
                            outcome.error,
                            describeEdit(edit),
                        ).toBeUndefined();
                    expectNoProblems(outcome.problems);
                    expect(
                        outcome.layerTies.length > 0,
                        outcome.layerTies.join("\n"),
                    ).toBe(!!c.layerTie);
                    if (!c.refused)
                        expect(
                            outcome.propMoved.length > 0,
                            outcome.propMoved.join("\n"),
                        ).toBe(
                            Array.isArray(c.propMoves)
                                ? c.propMoves.includes(choice)
                                : !!c.propMoves,
                        );
                });
    },
);

describeDbTests("count edits on other shows", (it) => {
    it("a show with a count-in before the first page: adding and removing there", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        const ids = await beatIds(db);
        // page 1 starts on count 3: counts 1 and 2 are a count-in (the first move still starts on 1)
        await db
            .update(schema.pages)
            .set({ start_beat: ids[3]! })
            .where(sql`id = 1`)
            .run();
        for (const edit of [
            { kind: "insert", at: 1, count: 1, duration: 0.5, drill: "adjust" },
            { kind: "insert", at: 2, count: 2, duration: 0.5, drill: "keep" },
            { kind: "insert", at: 3, count: 1, duration: 0.5, drill: "adjust" },
            { kind: "delete", from: 1, to: 2, drill: "adjust" },
            { kind: "delete", from: 2, to: 3, drill: "keep" },
        ] as CountEdit[]) {
            const outcome = await applyAndCheck(db, edit);
            expect(outcome.error, describeEdit(edit)).toBeUndefined();
            expectNoProblems(outcome.problems);
        }
    });

    it("a show with no pages: counts are added and removed with their measures, cues and holds", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        // every page but the first goes, and every move with them
        for (const t of [
            schema.timeline_held_marks,
            schema.timeline_shape_recipe_marchers,
            schema.timeline_shape_recipes,
            schema.timeline_assignments,
            schema.timeline_slot_destinations,
            schema.timeline_transitions,
            schema.timelines,
        ])
            await db.delete(t).run();
        await db.delete(schema.tag_appearances).run();
        await db.delete(schema.page_performer_settings).run();
        await db
            .delete(schema.pages)
            .where(sql`id <> 0`)
            .run();
        for (const edit of [
            { kind: "insert", at: 1, count: 1, duration: 0.5, drill: "adjust" },
            {
                kind: "insert",
                at: 21,
                count: 3,
                duration: 0.5,
                drill: "adjust",
            },
            { kind: "insert", at: 30, count: 1, duration: 0.4, drill: "keep" },
            {
                kind: "insert",
                at: 150,
                count: 1,
                duration: 0.5,
                drill: "adjust",
            },
            { kind: "delete", from: 12, to: 14, drill: "adjust" },
            { kind: "delete", from: 20, to: 21, drill: "keep" },
            { kind: "delete", from: 130, to: 131, drill: "adjust" },
        ] as CountEdit[]) {
            const outcome = await applyAndCheck(db, edit);
            expect(outcome.error, describeEdit(edit)).toBeUndefined();
            expectNoProblems(outcome.problems);
        }
    });

    it("a show with only beat 0: the first count added is stored with its page", async ({
        db,
    }) => {
        const outcome = await applyAndCheck(db, {
            kind: "insert",
            at: 3,
            count: 1,
            duration: 0.5,
            drill: "adjust",
        });
        expect(outcome.error).toBeUndefined();
        expectNoProblems(outcome.problems);
    });

    it("a show whose beat positions have gaps: the counts still go where they were asked", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        // positions 0, 2, 4, …: what a file written by another tool could hold
        const ids = await beatIds(db);
        for (let i = ids.length - 1; i >= 1; i--)
            await db
                .update(schema.beats)
                .set({ position: 2 * i })
                .where(sql`id = ${ids[i]!}`)
                .run();
        for (const edit of [
            {
                kind: "insert",
                at: 13,
                count: 1,
                duration: 0.5,
                drill: "adjust",
            },
            { kind: "delete", from: 30, to: 31, drill: "adjust" },
        ] as CountEdit[]) {
            const outcome = await applyAndCheck(db, edit);
            expect(outcome.error, describeEdit(edit)).toBeUndefined();
            expectNoProblems(outcome.problems);
        }
    });
});

/** Every page's start count and the last page's length */
const pageGrid = async (db: DbConnection) => {
    const s = await readState(db);
    return {
        starts: s.pages
            .map((p) => s.ordinal.get(p.start_beat as number)!)
            .sort((a, b) => a - b),
        lastPageCounts: s.lastPageCounts,
    };
};

describeDbTests("bugs found by these tests (regressions)", (it) => {
    it("counts added inside the last page make it longer, as any page, so its move stretches", async ({
        db,
        marchersAndPages: _,
    }) => {
        await insertCounts({
            at: 45,
            count: 2,
            duration: 0.5,
            drill: "adjust",
        });
        expect(await pageGrid(db)).toEqual({
            starts: [0, 1, 9, 17, 25, 33, 41],
            lastPageCounts: 10,
        });
        const moves = await db
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.start_beat))
            .all();
        expect([moves.at(-1)!.start_beat, moves.at(-1)!.end_beat]).toEqual([
            41, 51,
        ]);
    });

    it("counts removed inside the last page make it shorter; removing all of it is refused", async ({
        db,
        marchersAndPages: _,
    }) => {
        await deleteCounts({ from: 44, to: 46, drill: "adjust" });
        expect((await pageGrid(db)).lastPageCounts).toBe(6);
        const before = await dumpAll(db);
        await expect(
            deleteCounts({ from: 41, to: 47, drill: "adjust" }),
        ).rejects.toThrow(/would remove a page/);
        expect(await dumpAll(db)).toEqual(before);
    });

    it("keep: a move takes back a removed count only where nothing is in the way, never over the next page's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        // page 3's move [17, 25) is followed straight by page 4's: nothing to take back
        const before = await positionsAt(db, [25]);
        const result = await deleteCounts({ from: 20, to: 21, drill: "keep" });
        expect(result).toMatchObject({ kept: 0, couldNotKeep: 1 });
        const after = await positionsAt(db, [24]);
        // every marcher is on page 4's set at page 4's flag (now count 24)
        expect([...after.get(24)!]).toEqual([...before.get(25)!]);
        const layers = new Set(
            (await db.select().from(schema.timeline_assignments).all()).map(
                (a) => a.layer,
            ),
        );
        expect(layers).toEqual(new Set([0]));
    });

    it("keep: a move with a hold after it takes the removed count back from the hold", async ({
        db,
        marchersAndPages: _,
    }) => {
        // nobody moves on page 4 [25, 33): page 3's move can end a count later
        const t = await db
            .select()
            .from(schema.timelines)
            .where(sql`start_beat = 25`)
            .get();
        await db
            .delete(schema.timeline_assignments)
            .where(
                sql`transition_id IN (SELECT id FROM timeline_transitions WHERE timeline_id = ${t!.id})`,
            )
            .run();
        await db
            .delete(schema.timeline_slot_destinations)
            .where(
                sql`transition_id IN (SELECT id FROM timeline_transitions WHERE timeline_id = ${t!.id})`,
            )
            .run();
        await db
            .delete(schema.timeline_transitions)
            .where(sql`timeline_id = ${t!.id}`)
            .run();
        await db
            .delete(schema.timelines)
            .where(sql`id = ${t!.id}`)
            .run();
        const result = await deleteCounts({ from: 20, to: 21, drill: "keep" });
        expect(result).toMatchObject({ kept: 1, couldNotKeep: 0 });
        const moves = (
            await db
                .select()
                .from(schema.timelines)
                .orderBy(asc(schema.timelines.start_beat))
                .all()
        ).map((m) => [m.start_beat, m.end_beat]);
        expect(moves.slice(2, 4)).toEqual([
            [17, 25],
            [32, 40],
        ]);
    });

    it("keep: adding a count in the move a Held hold grows out of isn't refused; that move stretches", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        // marcher 76 is Held over page 5, growing out of page 4's move
        const result = await insertCounts({
            at: 30,
            count: 1,
            duration: 0.4,
            drill: "keep",
        });
        // the shape's move keeps its counts; page 4's move can't (the hold grows out of its end)
        expect(result).toEqual({ kept: 1, couldNotKeep: 1 });
        const held = await db.select().from(schema.timeline_held_marks).all();
        expect(held.map((h) => [h.start_beat, h.end_beat])).toEqual([[34, 42]]);
    });

    it("keep: a move doesn't give up counts a keyframe was pushed onto, so the keyframe can't hide its set", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        const set = (await positionsAt(db, [17])).get(17)!.get(1)!;
        // 6 counts before the keyframe (11–14): it moves to 17–20, past page 2's kept end (17)
        const result = await insertCounts({
            at: 11,
            count: 6,
            duration: 0.5,
            drill: "keep",
        });
        expect(result).toEqual({ kept: 0, couldNotKeep: 1 });
        // page 2's move stretched instead: marcher 1 is on page 2's set at page 3's flag (23)
        expect((await positionsAt(db, [23])).get(23)!.get(1)).toEqual(set);
    });

    it("keep: a keyframe takes back removed counts only short of the end of the move under it", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        // two counts out of the keyframe (11–14); page 2's move under it ends on 15 then
        const result = await deleteCounts({ from: 12, to: 14, drill: "keep" });
        // growing the keyframe back to 14 is fine, it still ends before page 2's move (15)
        expect(result).toEqual(expect.objectContaining({ kept: 1 }));
        const set = (await positionsAt(db, [15])).get(15)!.get(1);
        // one more: the keyframe (now 11–14) would end with page 2's move (14) and hide its set
        const second = await deleteCounts({ from: 12, to: 13, drill: "keep" });
        expect(second).toEqual(expect.objectContaining({ kept: 0 }));
        expect((await positionsAt(db, [14])).get(14)!.get(1)).toEqual(set);
    });

    it("keep: removing a move's first count says whether the move kept its counts", async ({
        db,
        marchersAndPages: _,
    }) => {
        // page 2's move [9, 17) loses count 9; page 3's move is right after it
        const result = await deleteCounts({ from: 9, to: 10, drill: "keep" });
        expect(result).toMatchObject({ kept: 0, couldNotKeep: 1 });
    });

    it("Add a measure before adds a measure in the time signature of the measure after", async ({
        db,
        marchersAndPages: _,
    }) => {
        await buildRichShow(db);
        // before the 7/8 m. 6 (counts 21–23): three counts of their own, reading 7/8
        await insertCounts({
            at: 21,
            count: 3,
            duration: 0.5,
            drill: "adjust",
            measure: true,
        });
        const s = await readState(db);
        const measures = s.measures
            .map((m) => ({
                start: s.ordinal.get(m.start_beat as number)!,
                meter: m.meter,
                grouping: m.grouping,
                mark: m.rehearsal_mark,
            }))
            .sort((a, b) => a.start - b.start);
        expect(measures.slice(3, 9)).toEqual([
            { start: 13, meter: null, grouping: null, mark: null },
            { start: 17, meter: null, grouping: null, mark: "A" },
            // the new measure: 7/8 written here, where it changes
            { start: 21, meter: "7/8", grouping: "2+2+3", mark: null },
            // the old m. 6 carries it on now
            { start: 24, meter: null, grouping: null, mark: null },
            { start: 27, meter: null, grouping: null, mark: null },
            { start: 30, meter: "4/4", grouping: null, mark: "B" },
        ]);
        await performUndo(db);
        expect((await readState(db)).measures).toHaveLength(
            s.measures.length - 1,
        );
    });
});

describeDbTests(
    "behavior the owner should know about (passing, by design today)",
    (it) => {
        it("removing the count a tempo point is on removes the point; the count after doesn't take it", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            await deleteCounts({ from: 29, to: 30, drill: "adjust" });
            const s = await readState(db);
            const points = s.beats.flatMap((b, i) =>
                b.tempo_change ? [i] : [],
            );
            expect(points).toEqual([9]);
        });

        it("removing a count removes the notes written on it", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            await deleteCounts({ from: 44, to: 45, drill: "adjust" });
            const s = await readState(db);
            expect(s.beats.filter((b) => b.notes).map((b) => b.notes)).toEqual([
                "breath",
            ]);
        });

        it("removing a measure drops its rehearsal mark when the measure after has its own", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            const ids = await beatIds(db);
            await db
                .update(schema.measures)
                .set({ rehearsal_mark: "D" })
                .where(sql`start_beat = ${ids[47]!}`)
                .run();
            await deleteCounts({ from: 43, to: 47, drill: "adjust" });
            const marks = (await readState(db)).measures
                .map((m) => m.rehearsal_mark)
                .filter(Boolean);
            expect(marks).toEqual(["A", "B", "D"]);
        });

        it("removing a cue's count drops the cue when the next count has one on the same channel (the toast says so)", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            const result = await deleteCounts({
                from: 12,
                to: 13,
                drill: "adjust",
            });
            expect(result.cues?.dropped).toHaveLength(1);
        });

        it("a prop put down mid-move is put down where its holder is on that count, so re-timing the move moves it", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            const flag = (await readState(db)).propIds;
            const flagId = Math.max(...flag);
            const before = (await positionsAt(db, [25])).get(25)!.get(flagId)!;
            // a count added in page 3's move, before the put-down on 22
            await insertCounts({
                at: 20,
                count: 1,
                duration: 0.5,
                drill: "adjust",
            });
            const after = (await positionsAt(db, [26])).get(26)!.get(flagId)!;
            expect(after).not.toEqual(before);
        });

        it("a count added before a measure's count 1 joins the measure before", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            // "Add a count before m. 6 count 1" (the 7/8 measure at count 21)
            await insertCounts({
                at: 21,
                count: 1,
                duration: 0.5,
                drill: "adjust",
            });
            const s = await readState(db);
            const starts = s.measures
                .map((m) => s.ordinal.get(m.start_beat as number)!)
                .sort((a, b) => a - b);
            // m. 5 now has 5 counts (17–21) and m. 6 starts on 22
            expect(starts.slice(4, 6)).toEqual([17, 22]);
        });

        it("removing the counts between a keyframe's end and its page's end hides that page's set for the keyframe's marchers", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            // marchers 1–3: a keyframe over counts 11–14 on top of page 2's move (counts 9–17)
            const set = (await positionsAt(db, [17])).get(17)!.get(1)!;
            await deleteCounts({ from: 14, to: 17, drill: "adjust" });
            // both moves end on count 14 (page 3's flag) now, and the keyframe, on top, wins there:
            // marcher 1 stands on the keyframe's spot at page 3's flag, never on page 2's set
            const atFlag = (await positionsAt(db, [14])).get(14)!.get(1)!;
            expect(atFlag).toEqual([300, 120]);
            expect(atFlag).not.toEqual(set);
        });

        it("removing a selection that holds a whole keyframe or shape is refused, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await buildRichShow(db);
            const before = await dumpAll(db);
            await expect(
                deleteCounts({ from: 26, to: 32, drill: "adjust" }),
            ).rejects.toThrow();
            expect(await dumpAll(db)).toEqual(before);
        });
    },
);
