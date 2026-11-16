import { describe, expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { compileCues, isCueType } from "@openmarch/core";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    carryCuesPastDeletedBeatsInTransaction,
    createCues,
    deleteCues,
    getCueById,
    getCues,
    planCueCarry,
    remapCuesOntoReplacementBeatsInTransaction,
    subscribeCueCarry,
    type CueCarryNotice,
    updateCues,
    type CarryCue,
    type NewCueArgs,
} from "../cues";
import { deleteMarchers } from "../marcher";
import { deleteBeats, deleteBeatsInTransaction } from "../beat";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { editedPerformers, planEquipmentCues } from "@/cues/equipment";

/** The show's beat ids in order, without the fixed first beat. */
const beatIds = async (db: DbConnection) =>
    (
        await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all()
    )
        .map((b) => b.id)
        .slice(1);

const cueTables = [schema.cues, schema.cue_marchers];

/** Each cue as `[id, beat, performers]`. */
const placed = async (db: DbConnection) =>
    (await getCues({ db })).map((c) => [c.id, c.beatId, c.marcherIds]);

describeDbTests("cues", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        ...cueTables,
        schema.marchers,
        schema.beats,
    ]);

    describe("createCues", () => {
        testWithHistory(
            "creates a lasting cue with its performers and reads it back in compile's shape",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const [, beat] = await beatIds(db);
                const [created] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "position",
                            beatId: beat!,
                            value: "builtin:horn.down",
                            // given twice and out of order: stored once, read in id order
                            marcherIds: [m2!.id, m1!.id, m2!.id],
                            settings: { angle: "box" },
                            label: "Trumpets",
                        },
                    ],
                });
                expect(created).toMatchObject({
                    type: "position",
                    beatId: beat,
                    value: "builtin:horn.down",
                    settings: { angle: "box" },
                    length: null,
                    transition: null,
                    marcherIds: [m1!.id, m2!.id].sort((a, b) => a - b),
                    label: "Trumpets",
                    notes: null,
                });
                expect(await getCues({ db })).toEqual([created]);
                expect(await getCueById({ db, id: created!.id })).toEqual(
                    created,
                );
                // one edit, both tables
                await expectNumberOfChanges.test(db, 1);
            },
        );

        testWithHistory(
            "creates a momentary cue with a transition",
            async ({ db, marchersAndPages }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const [beat] = await beatIds(db);
                const [created] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "facing",
                            beatId: beat!,
                            value: "builtin:facing.back",
                            marcherIds: [m1!.id],
                            length: 1,
                            transition: 4,
                            notes: "turn on the hit",
                        },
                    ],
                });
                expect(created).toMatchObject({
                    length: 1,
                    transition: 4,
                    notes: "turn on the hit",
                    settings: {},
                });
            },
        );

        it("refuses a cue with no performers, and writes nothing", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const [beat] = await beatIds(db);
            await expect(
                createCues({
                    db,
                    newCues: [
                        {
                            type: "look",
                            beatId: beat!,
                            value: "builtin:look.guard",
                            marcherIds: [],
                        },
                    ],
                }),
            ).rejects.toThrow("at least one marcher");
            expect(await getCues({ db })).toEqual([]);
        });

        it("refuses a length or a transition under one count, and settings that aren't an object", async ({
            db,
            marchersAndPages,
        }) => {
            const [m1] = marchersAndPages.expectedMarchers;
            const [beat] = await beatIds(db);
            const base: NewCueArgs = {
                type: "look",
                beatId: beat!,
                value: "builtin:look.guard",
                marcherIds: [m1!.id],
            };
            for (const bad of [
                { length: 0 },
                { length: 1.5 },
                { transition: 0 },
                { settings: [] as unknown as Record<string, unknown> },
            ])
                await expect(
                    createCues({ db, newCues: [{ ...base, ...bad }] }),
                ).rejects.toThrow();
            expect(await getCues({ db })).toEqual([]);
        });
    });

    describe("a cue type this build doesn't know (ADR 0015 D-9)", () => {
        testWithHistory(
            "is stored, read and edited like any other, and compile ignores it",
            async ({ db, marchersAndPages }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const [beat, next] = await beatIds(db);
                expect(isCueType("lights")).toBe(false);
                const [created] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "lights",
                            beatId: beat!,
                            value: "future:lights.on",
                            marcherIds: [m1!.id],
                            settings: { color: "#ff0000", nested: { a: [1] } },
                        },
                    ],
                });
                expect(created).toMatchObject({
                    type: "lights",
                    value: "future:lights.on",
                    settings: { color: "#ff0000", nested: { a: [1] } },
                });

                // an edit that names neither keeps the type, value and settings
                const [moved] = await updateCues({
                    db,
                    modifiedCues: [{ id: created!.id, beatId: next! }],
                });
                expect(moved).toMatchObject({
                    type: "lights",
                    beatId: next,
                    value: "future:lights.on",
                    settings: { color: "#ff0000", nested: { a: [1] } },
                    marcherIds: [m1!.id],
                });

                const beats = (await db.select().from(schema.beats).all()).map(
                    (b) => ({ id: b.id, duration: b.duration }),
                );
                const compiled = compileCues({
                    beats,
                    marchers: [
                        { id: m1!.id, section: "Trumpet", carries: "winds" },
                    ],
                    cues: await getCues({ db }),
                });
                expect(compiled.flags).toEqual([]);
                expect(compiled.segments(m1!.id, "look")).toHaveLength(1);
            },
        );
    });

    describe("updateCues", () => {
        testWithHistory(
            "changes fields and leaves the rest",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const [beat, next] = await beatIds(db);
                const [created] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "facing",
                            beatId: beat!,
                            value: "builtin:facing.back",
                            marcherIds: [m1!.id],
                            transition: 4,
                        },
                    ],
                });
                const [updated] = await updateCues({
                    db,
                    modifiedCues: [
                        {
                            id: created!.id,
                            beatId: next!,
                            value: "builtin:facing.angle",
                            settings: { degrees: 45 },
                            length: 8,
                            transition: null,
                            label: "Front line",
                        },
                    ],
                });
                expect(updated).toMatchObject({
                    type: "facing",
                    beatId: next,
                    value: "builtin:facing.angle",
                    settings: { degrees: 45 },
                    length: 8,
                    transition: null,
                    marcherIds: [m1!.id],
                    label: "Front line",
                });
                expect(await getCues({ db })).toEqual([updated]);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistory(
            "replaces the performers, keeping the rows of those who stay",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2, m3] = marchersAndPages.expectedMarchers;
                const [beat] = await beatIds(db);
                const [created] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "look",
                            beatId: beat!,
                            value: "builtin:look.guard",
                            marcherIds: [m1!.id, m2!.id],
                        },
                    ],
                });
                const rowOf = async (marcherId: number) =>
                    (
                        await db
                            .select()
                            .from(schema.cue_marchers)
                            .where(
                                eq(schema.cue_marchers.marcher_id, marcherId),
                            )
                            .get()
                    )?.id;
                const kept = await rowOf(m2!.id);

                const [updated] = await updateCues({
                    db,
                    modifiedCues: [
                        { id: created!.id, marcherIds: [m2!.id, m3!.id] },
                    ],
                });
                expect(updated!.marcherIds).toEqual(
                    [m2!.id, m3!.id].sort((a, b) => a - b),
                );
                expect(await rowOf(m2!.id)).toBe(kept);
                expect(await rowOf(m1!.id)).toBeUndefined();
                await expectNumberOfChanges.test(db, 2);
            },
        );

        it("refuses to leave a cue with no performers, or to edit one that isn't there", async ({
            db,
            marchersAndPages,
        }) => {
            const [m1] = marchersAndPages.expectedMarchers;
            const [beat] = await beatIds(db);
            const [created] = await createCues({
                db,
                newCues: [
                    {
                        type: "look",
                        beatId: beat!,
                        value: "builtin:look.guard",
                        marcherIds: [m1!.id],
                    },
                ],
            });
            await expect(
                updateCues({
                    db,
                    modifiedCues: [{ id: created!.id, marcherIds: [] }],
                }),
            ).rejects.toThrow("at least one marcher");
            await expect(
                updateCues({ db, modifiedCues: [{ id: 999, notes: "x" }] }),
            ).rejects.toThrow("not found");
            expect(await getCues({ db })).toEqual([created]);
        });
    });

    describe("deleteCues", () => {
        testWithHistory(
            "deletes a cue with its performers; undo restores both",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const [beat] = await beatIds(db);
                const [first, second] = await createCues({
                    db,
                    newCues: [
                        {
                            type: "look",
                            beatId: beat!,
                            value: "builtin:look.guard",
                            marcherIds: [m1!.id, m2!.id],
                        },
                        {
                            type: "facing",
                            beatId: beat!,
                            value: "builtin:facing.back",
                            marcherIds: [m1!.id],
                        },
                    ],
                });
                const before = await getCues({ db });

                const deleted = await deleteCues({
                    db,
                    cueIds: new Set([first!.id]),
                });
                expect(deleted).toEqual([first]);
                expect(await getCues({ db })).toEqual([second]);
                expect(
                    await db.select().from(schema.cue_marchers).all(),
                ).toHaveLength(1);

                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(await getCues({ db })).toEqual([second]);
                await expectNumberOfChanges.test(db, 2);
            },
        );
    });

    describe("deleting a marcher", () => {
        testWithHistory(
            "takes them out of their cues and deletes a cue left with nobody; undo restores both",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const [beat] = await beatIds(db);
                const look: NewCueArgs = {
                    type: "look",
                    beatId: beat!,
                    value: "builtin:look.guard",
                    marcherIds: [m1!.id],
                };
                const [solo, pair, other] = await createCues({
                    db,
                    newCues: [
                        look,
                        { ...look, marcherIds: [m1!.id, m2!.id] },
                        { ...look, marcherIds: [m2!.id] },
                    ],
                });
                const before = await getCues({ db });

                await deleteMarchers({ db, marcherIds: new Set([m1!.id]) });

                const after = await placed(db);
                expect(after).toEqual([
                    [pair!.id, beat, [m2!.id]],
                    [other!.id, beat, [m2!.id]],
                ]);
                expect(solo).toBeDefined();

                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(await placed(db)).toEqual(after);
                await expectNumberOfChanges.test(db, 2);
            },
        );
    });

    describe("an Equipment cue's performers (#992)", () => {
        testWithHistory(
            "adding one and removing another are one undo step each",
            async ({ db, marchersAndPages }) => {
                const [m1, m2, m3] = marchersAndPages.expectedMarchers;
                const [beat] = await beatIds(db);
                const [rifles] = await createCues({
                    db,
                    newCues: planEquipmentCues({
                        choice: "rifle",
                        marcherIds: [m1!.id, m2!.id],
                        beatId: beat!,
                        usualOf: () => "flag",
                        label: "Rifles",
                    }),
                });
                expect(rifles).toMatchObject({
                    type: "equipment",
                    value: "builtin:equipment.rifle",
                    length: null,
                    label: "Rifles",
                });
                const withM3 = editedPerformers(rifles!, [m3!.id], "add")!;
                await updateCues({
                    db,
                    modifiedCues: [{ id: rifles!.id, marcherIds: withM3 }],
                });
                const after = (await getCueById({ db, id: rifles!.id }))!;
                const withoutM1 = editedPerformers(after, [m1!.id], "remove")!;
                await updateCues({
                    db,
                    modifiedCues: [{ id: rifles!.id, marcherIds: withoutM1 }],
                });
                const ids = async () =>
                    (await getCueById({ db, id: rifles!.id }))!.marcherIds;
                expect(await ids()).toEqual(
                    [m2!.id, m3!.id].sort((a, b) => a - b),
                );

                await performUndo(db);
                expect(await ids()).toEqual(
                    [m1!.id, m2!.id, m3!.id].sort((a, b) => a - b),
                );
                await performUndo(db);
                expect(await ids()).toEqual(
                    [m1!.id, m2!.id].sort((a, b) => a - b),
                );
            },
        );
    });

    describe("the notice after deleting beats (#992)", () => {
        testWithHistory(
            "says how many cues moved and where, once the deletion is saved",
            async ({ db, marchersAndPages }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                await createCues({
                    db,
                    newCues: [
                        {
                            type: "equipment",
                            beatId: b[2]!,
                            value: "builtin:equipment.rifle",
                            marcherIds: [m1!.id],
                        },
                        {
                            type: "equipment",
                            beatId: b[3]!,
                            value: "builtin:equipment.sabre",
                            marcherIds: [m2!.id],
                        },
                    ],
                });
                const heard: CueCarryNotice[] = [];
                const stop = subscribeCueCarry((n) => heard.push(n));
                try {
                    await deleteBeats({ db, beatIds: new Set([b[2]!, b[3]!]) });
                } finally {
                    stop();
                }
                // `b` leaves out the first beat, so b[4] is spec beat 5; two beats before it went
                expect(heard).toEqual([{ moved: 2, movedTo: [3], dropped: 0 }]);
            },
        );
    });

    describe("deleting beats carries their cues (ADR 0004 amendment of 2026-10-15)", () => {
        const look = (
            beatId: number,
            marcherIds: number[],
            extra: Partial<NewCueArgs> = {},
        ): NewCueArgs => ({
            type: "look",
            beatId,
            value: "builtin:look.guard",
            marcherIds,
            ...extra,
        });

        testWithHistory(
            "moves a cue to the next count, and one undo restores the beats and the cue",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                const [cue] = await createCues({
                    db,
                    newCues: [
                        look(b[2]!, [m1!.id], {
                            length: 4,
                            transition: 2,
                            settings: { a: 1 },
                        }),
                    ],
                });
                const before = await getCues({ db });
                const beatsBefore = await beatIds(db);

                await deleteBeats({ db, beatIds: new Set([b[2]!, b[3]!]) });

                // on the first count after the deleted ones, otherwise as it was
                expect(await getCues({ db })).toEqual([
                    { ...cue, beatId: b[4], updatedAt: expect.any(String) },
                ]);

                await performUndo(db);
                expect(await beatIds(db)).toEqual(beatsBefore);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(await placed(db)).toEqual([[cue!.id, b[4], [m1!.id]]]);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistory(
            "keeps the last cue per type and performer, and drops a cue that keeps nobody",
            async ({ db, marchersAndPages }) => {
                const [m1, m2, m3] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                const [early, late, facing] = await createCues({
                    db,
                    newCues: [
                        // m1 and m2 early, m2 and m3 later: m2's later cue wins
                        look(b[2]!, [m1!.id, m2!.id]),
                        look(b[3]!, [m2!.id, m3!.id]),
                        // another type is another parameter
                        look(b[2]!, [m2!.id], {
                            type: "facing",
                            value: "builtin:facing.back",
                        }),
                        // beaten for its only performer
                        look(b[2]!, [m3!.id]),
                    ],
                });

                await deleteBeats({ db, beatIds: new Set([b[2]!, b[3]!]) });

                expect(await placed(db)).toEqual([
                    [early!.id, b[4], [m1!.id]],
                    [late!.id, b[4], [m2!.id, m3!.id].sort((x, y) => x - y)],
                    [facing!.id, b[4], [m2!.id]],
                ]);
            },
        );

        testWithHistory(
            "lets a cue already on the next count win, per performer",
            async ({ db, marchersAndPages }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                const [moved, existing, beaten] = await createCues({
                    db,
                    newCues: [
                        look(b[2]!, [m1!.id, m2!.id]),
                        look(b[3]!, [m2!.id], { value: "builtin:look.band" }),
                        look(b[2]!, [m2!.id]),
                    ],
                });

                await deleteBeats({ db, beatIds: new Set([b[2]!]) });

                expect(await placed(db)).toEqual([
                    [moved!.id, b[3], [m1!.id]],
                    [existing!.id, b[3], [m2!.id]],
                ]);
                expect(beaten).toBeDefined();
            },
        );

        testWithHistory(
            "keeps lasting and momentary cues apart",
            async ({ db, marchersAndPages }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                const [lasting, momentary] = await createCues({
                    db,
                    newCues: [
                        look(b[2]!, [m1!.id]),
                        look(b[3]!, [m1!.id], { length: 2 }),
                    ],
                });

                await deleteBeats({ db, beatIds: new Set([b[2]!, b[3]!]) });

                expect(await placed(db)).toEqual([
                    [lasting!.id, b[4], [m1!.id]],
                    [momentary!.id, b[4], [m1!.id]],
                ]);
            },
        );

        testWithHistory(
            "drops the cues on the show's last counts",
            async ({ db, marchersAndPages }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const b = await beatIds(db);
                const last = b.at(-1)!;
                const [kept] = await createCues({
                    db,
                    newCues: [look(b[2]!, [m1!.id]), look(last, [m1!.id])],
                });

                await deleteBeats({ db, beatIds: new Set([last]) });

                expect(await placed(db)).toEqual([[kept!.id, b[2], [m1!.id]]]);
            },
        );

        it("says what it moved and dropped", async ({
            db,
            marchersAndPages,
        }) => {
            const [m1, m2] = marchersAndPages.expectedMarchers;
            const b = await beatIds(db);
            const [early, late] = await createCues({
                db,
                newCues: [
                    look(b[2]!, [m1!.id, m2!.id]),
                    look(b[3]!, [m2!.id]),
                    look(b[2]!, [m2!.id]),
                ],
            });
            const result = await transactionWithHistory(db, "carry", (tx) =>
                carryCuesPastDeletedBeatsInTransaction({
                    tx,
                    beatIds: new Set([b[2]!, b[3]!]),
                }),
            );
            expect(result).toEqual({
                moved: [
                    {
                        cueId: early!.id,
                        fromBeatId: b[2],
                        toBeatId: b[4],
                        removedMarcherIds: [m2!.id],
                    },
                    {
                        cueId: late!.id,
                        fromBeatId: b[3],
                        toBeatId: b[4],
                        removedMarcherIds: [],
                    },
                ],
                dropped: [late!.id + 1],
            });
        });

        it("leaves the cues alone when none sits on a deleted beat", async ({
            db,
            marchersAndPages,
        }) => {
            const [m1] = marchersAndPages.expectedMarchers;
            const b = await beatIds(db);
            const [cue] = await createCues({
                db,
                newCues: [look(b[2]!, [m1!.id])],
            });
            await deleteBeats({ db, beatIds: new Set([b[5]!]) });
            expect(await getCues({ db })).toEqual([cue]);
        });
    });

    describe("replacing every beat", () => {
        it("moves each cue to the new beat nearest its time, instead of losing it", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const marcher = await db
                .insert(schema.marchers)
                .values({
                    section: "Trumpet",
                    drill_prefix: "T",
                    drill_order: 1,
                })
                .returning({ id: schema.marchers.id })
                .get();
            const cue = (
                type: string,
                beatId: number,
                value: string,
            ): NewCueArgs => ({
                type,
                beatId,
                value,
                marcherIds: [marcher.id],
            });
            const [a, b, beaten, existing] = await createCues({
                db,
                newCues: [
                    cue("look", 2, "builtin:look.guard"),
                    cue("look", 3, "builtin:look.band"),
                    cue("facing", 5, "builtin:facing.back"),
                    cue("facing", 6, "builtin:facing.side1"),
                ],
            });

            await db.transaction(async (tx) => {
                const beatIds = new Set([2, 3, 5]);
                await remapCuesOntoReplacementBeatsInTransaction({
                    tx,
                    beatIds,
                });
                await deleteBeatsInTransaction({ tx, beatIds });
            });

            // Old timeline 0, 2, 3, 5 at 0, 0, 0.5, 1 s; new 0, 1, 4, 6, 7... at 0, 0, 0.5, 1,
            // 1.5 s. 2 (0 s) and 3 (0.5 s) are nearest 1 and 4; 5 (1 s) is nearest 6, where the
            // marcher already has a Facing cue, so that one stays and 5's goes.
            expect(await placed(db)).toEqual([
                [a!.id, 1, [marcher.id]],
                [b!.id, 4, [marcher.id]],
                [existing!.id, 6, [marcher.id]],
            ]);
            expect(beaten).toBeDefined();
        });
    });
});

describe("planCueCarry", () => {
    const cue = (
        id: number,
        beatId: number,
        marcherIds: number[],
        extra: Partial<CarryCue> = {},
    ): CarryCue => ({
        id,
        type: "look",
        beatId,
        length: null,
        marcherIds,
        ...extra,
    });
    /** Beats 1-3 are deleted and land on beat 4, in beat order. */
    const deleted = new Set([1, 2, 3]);
    const toFour = (c: CarryCue) => ({ to: 4, at: c.beatId });

    it("gives two cues on one deleted beat to the newer, per performer", () => {
        expect(
            planCueCarry(
                [cue(10, 2, [1, 2]), cue(11, 2, [2])],
                deleted,
                toFour,
            ),
        ).toEqual({
            moved: [
                {
                    cueId: 10,
                    fromBeatId: 2,
                    toBeatId: 4,
                    removedMarcherIds: [2],
                },
                {
                    cueId: 11,
                    fromBeatId: 2,
                    toBeatId: 4,
                    removedMarcherIds: [],
                },
            ],
            dropped: [],
        });
    });

    it("keeps a cue of a type this build doesn't know by the same rule", () => {
        const lights = { type: "lights" };
        expect(
            planCueCarry(
                [
                    cue(10, 1, [1], lights),
                    cue(11, 3, [1], lights),
                    cue(12, 2, [1]),
                ],
                deleted,
                toFour,
            ),
        ).toEqual({
            moved: [
                {
                    cueId: 11,
                    fromBeatId: 3,
                    toBeatId: 4,
                    removedMarcherIds: [],
                },
                {
                    cueId: 12,
                    fromBeatId: 2,
                    toBeatId: 4,
                    removedMarcherIds: [],
                },
            ],
            dropped: [10],
        });
    });

    it("drops a cue with nowhere to go, and leaves surviving cues out", () => {
        expect(
            planCueCarry(
                [cue(10, 2, [1]), cue(11, 9, [1])],
                deleted,
                () => null,
            ),
        ).toEqual({ moved: [], dropped: [10] });
    });

    it("lands cues on different beats independently", () => {
        const result = planCueCarry(
            [cue(10, 1, [1]), cue(11, 3, [1])],
            deleted,
            (c) => ({ to: c.beatId === 1 ? 4 : 5, at: c.beatId }),
        );
        expect(result.moved.map((m) => [m.cueId, m.toBeatId])).toEqual([
            [10, 4],
            [11, 5],
        ]);
        expect(result.dropped).toEqual([]);
    });
});
