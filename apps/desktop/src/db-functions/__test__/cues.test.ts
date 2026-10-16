import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    createCues,
    deleteCues,
    getCueById,
    getCues,
    phraseAssetIdOfCueValue,
    updateCues,
    type NewCueArgs,
} from "../cues";
import { createPhraseAssets, deletePhraseAssets } from "../phraseAssets";
import { deleteMarchers } from "../marcher";
import { deleteBeats, deleteBeatsCarryingCues } from "../beat";
import { deleteMeasuresAndBeatsInTransaction } from "../measures";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { deleteTagsInTransaction } from "../tag";

const hornsUp: NewCueArgs = {
    channel: "horn_equipment",
    kind: "state",
    target: { kind: "band" },
    beatId: 3,
    value: "builtin:horn_equipment.horn.up",
    settings: { angle: "box" },
};

const cueTables = [schema.cues, schema.cue_marchers, schema.phrase_assets];

const insertTag = async (db: DbConnection) =>
    (
        await db
            .insert(schema.tags)
            .values({ name: "Front" })
            .returning({ id: schema.tags.id })
            .get()
    ).id;

const cueCount = async (db: DbConnection) =>
    (await db.select().from(schema.cues).all()).length;

describeDbTests("cues", (it) => {
    const testWithHistory = getTestWithHistory(it, cueTables);
    const testWithHistoryAndMarchers = getTestWithHistory(it, [
        ...cueTables,
        schema.marchers,
        schema.beats,
        schema.tags,
    ]);

    describe("phraseAssetIdOfCueValue", () => {
        it("reads show phrase ids only", () => {
            expect(phraseAssetIdOfCueValue("show:12")).toBe(12);
            expect(phraseAssetIdOfCueValue("show:0")).toBeNull();
            expect(phraseAssetIdOfCueValue("show:x")).toBeNull();
            expect(phraseAssetIdOfCueValue("builtin:body.kneel")).toBeNull();
        });
    });

    describe("createCues", () => {
        testWithHistory(
            "creates a band state and reads it back in compile's shape",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                void marchersAndPages;
                const [created] = await createCues({ db, newCues: [hornsUp] });
                expect(created).toMatchObject({
                    channel: "horn_equipment",
                    kind: "state",
                    target: { kind: "band" },
                    beatId: 3,
                    value: "builtin:horn_equipment.horn.up",
                    phraseAssetId: null,
                    length: null,
                    transitionLength: null,
                    settings: { angle: "box" },
                    ripple: null,
                    notes: null,
                });
                expect(await getCues({ db })).toEqual([created]);
                await expectNumberOfChanges.test(db, 1);
            },
        );

        testWithHistory(
            "creates section, tag and set targets, a ripple and the new channels in one edit",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const tagId = await insertTag(db);
                const created = await createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            target: { kind: "section", section: "Trumpet" },
                            ripple: { span: 4, order: "left_right" },
                        },
                        {
                            channel: "facing",
                            kind: "state",
                            target: { kind: "tag", tagId },
                            beatId: 5,
                            value: "builtin:facing.back",
                            transitionLength: 2,
                        },
                        {
                            channel: "carry",
                            kind: "state",
                            target: {
                                kind: "set",
                                marcherIds: [m2!.id, m1!.id, m1!.id],
                            },
                            beatId: 5,
                            value: "library:4f1c2a7e-0b7e-4c1e-9a55-2f2d8b9f0c11@9a8b7c",
                        },
                        {
                            channel: "carry",
                            kind: "state",
                            target: { kind: "band" },
                            beatId: 6,
                            value: "none",
                        },
                        {
                            channel: "silk",
                            kind: "state",
                            target: { kind: "band" },
                            beatId: 6,
                            value: "library:a@b",
                        },
                        {
                            channel: "uniform",
                            kind: "state",
                            target: { kind: "section", section: "Trumpet" },
                            beatId: 7,
                            value: "builtin:uniform.band",
                            ripple: { span: 8, order: "drill" },
                        },
                    ],
                });
                expect(created.map((c) => c.target)).toEqual([
                    { kind: "section", section: "Trumpet" },
                    { kind: "tag", tagId },
                    {
                        kind: "set",
                        marcherIds: [m1!.id, m2!.id].sort((a, b) => a - b),
                    },
                    { kind: "band" },
                    { kind: "band" },
                    { kind: "section", section: "Trumpet" },
                ]);
                expect(created[0]!.ripple).toEqual({
                    span: 4,
                    order: "left_right",
                });
                const stored = await db
                    .select({ ripple_json: schema.cues.ripple_json })
                    .from(schema.cues)
                    .where(eq(schema.cues.id, created[0]!.id))
                    .get();
                expect(JSON.parse(stored!.ripple_json!)).toEqual({
                    version: 1,
                    span: 4,
                    order: "left_right",
                });
                expect(await getCues({ db })).toEqual(created);
                // The tag insert, then the cues as one edit
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistory(
            "links a show phrase to its asset",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                void marchersAndPages;
                const [asset] = await createPhraseAssets({
                    db,
                    newPhraseAssets: [
                        {
                            name: "Dance copy",
                            label: "Ch",
                            source: "copied_builtin",
                            channels: ["body", "horn_equipment"],
                            formatVersion: 1,
                            data: {},
                        },
                    ],
                });
                const [cue] = await createCues({
                    db,
                    newCues: [
                        {
                            channel: "body",
                            kind: "phrase",
                            target: { kind: "band" },
                            beatId: 9,
                            value: `show:${asset!.id}`,
                            length: 8,
                        },
                    ],
                });
                expect(cue!.phraseAssetId).toBe(asset!.id);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        it("rejects a set with no marchers, writing nothing", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            await expect(
                createCues({
                    db,
                    newCues: [
                        hornsUp,
                        { ...hornsUp, target: { kind: "set", marcherIds: [] } },
                    ],
                }),
            ).rejects.toThrow(/at least one marcher/);
            expect(await cueCount(db)).toBe(0);
        });

        it("rejects settings that aren't an object", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            await expect(
                createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            settings: [1] as unknown as Record<string, never>,
                        },
                    ],
                }),
            ).rejects.toThrow();
            expect(await cueCount(db)).toBe(0);
        });

        it.for<[string, Partial<NewCueArgs>]>([
            ["a phrase without a length", { kind: "phrase" }],
            ["a phrase of length 1", { kind: "phrase", length: 1 }],
            ["a state with a length", { length: 4 }],
            ["a transition of 0 counts", { transitionLength: 0 }],
            [
                "a ripple on Feet",
                {
                    channel: "feet",
                    value: "builtin:feet.step",
                    ripple: { span: 4, order: "drill" },
                },
            ],
            ["a ripple of 0 counts", { ripple: { span: 0, order: "drill" } }],
            [
                "an unknown channel",
                { channel: "head" as NewCueArgs["channel"] },
            ],
            ["a library value on Horn/Equipment", { value: "library:a@b" }],
            ["none off Carry", { value: "none" }],
            [
                "a library value without a version",
                { channel: "uniform", value: "library:abc" },
            ],
            [
                "a library value on a phrase",
                {
                    channel: "silk",
                    kind: "phrase",
                    length: 4,
                    value: "library:a@b",
                },
            ],
            [
                "a show phrase that doesn't exist",
                { kind: "phrase", length: 4, value: "show:999" },
            ],
            ["a show value on a state", { value: "show:1" }],
            ["an unknown value form", { value: "horn.up" }],
            ["a beat that doesn't exist", { beatId: 9999 }],
            [
                "a tag that doesn't exist",
                { target: { kind: "tag", tagId: 9999 } },
            ],
        ])("rejects %s", async ([, change], { db, marchersAndPages }) => {
            void marchersAndPages;
            await expect(
                createCues({ db, newCues: [{ ...hornsUp, ...change }] }),
            ).rejects.toThrow();
            expect(await cueCount(db)).toBe(0);
        });
    });

    describe("updateCues", () => {
        testWithHistory(
            "edits fields, keeps the rest, and replaces set members",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2, m3] = marchersAndPages.expectedMarchers;
                const [cue] = await createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            target: {
                                kind: "set",
                                marcherIds: [m1!.id, m2!.id],
                            },
                        },
                    ],
                });
                const [edited] = await updateCues({
                    db,
                    modifiedCues: [
                        {
                            id: cue!.id,
                            beatId: 8,
                            transitionLength: 3,
                            ripple: { span: 2, order: "right_left" },
                            notes: "sweep",
                            target: {
                                kind: "set",
                                marcherIds: [m2!.id, m3!.id],
                            },
                        },
                    ],
                });
                expect(edited).toMatchObject({
                    id: cue!.id,
                    beatId: 8,
                    transitionLength: 3,
                    ripple: { span: 2, order: "right_left" },
                    notes: "sweep",
                    value: hornsUp.value,
                    settings: { angle: "box" },
                    target: {
                        kind: "set",
                        marcherIds: [m2!.id, m3!.id].sort((a, b) => a - b),
                    },
                });
                // The member that stayed kept its row
                const members = await db
                    .select()
                    .from(schema.cue_marchers)
                    .where(eq(schema.cue_marchers.marcher_id, m2!.id))
                    .all();
                expect(members).toHaveLength(1);

                const [band] = await updateCues({
                    db,
                    modifiedCues: [
                        { id: cue!.id, target: { kind: "band" }, ripple: null },
                    ],
                });
                expect(band!.target).toEqual({ kind: "band" });
                expect(band!.ripple).toBeNull();
                expect(
                    await db.select().from(schema.cue_marchers).all(),
                ).toEqual([]);
                expect(await getCueById({ db, id: cue!.id })).toEqual(band);
                await expectNumberOfChanges.test(db, 3);
            },
        );

        testWithHistory(
            "turns a state into a phrase when the lengths come along",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                void marchersAndPages;
                const [cue] = await createCues({
                    db,
                    newCues: [
                        {
                            channel: "body",
                            kind: "state",
                            target: { kind: "band" },
                            beatId: 4,
                            value: "builtin:body.kneel",
                            transitionLength: 3,
                        },
                    ],
                });
                await expect(
                    updateCues({
                        db,
                        modifiedCues: [{ id: cue!.id, kind: "phrase" }],
                    }),
                ).rejects.toThrow();
                const [phrase] = await updateCues({
                    db,
                    modifiedCues: [
                        {
                            id: cue!.id,
                            kind: "phrase",
                            value: "builtin:body.dance",
                            length: 8,
                            transitionLength: null,
                        },
                    ],
                });
                expect(phrase).toMatchObject({
                    kind: "phrase",
                    length: 8,
                    transitionLength: null,
                });
                await expectNumberOfChanges.test(db, 2);
            },
        );

        it("rejects emptying a set", async ({ db, marchersAndPages }) => {
            const [m1] = marchersAndPages.expectedMarchers;
            const [cue] = await createCues({
                db,
                newCues: [
                    {
                        ...hornsUp,
                        target: { kind: "set", marcherIds: [m1!.id] },
                    },
                ],
            });
            await expect(
                updateCues({
                    db,
                    modifiedCues: [
                        {
                            id: cue!.id,
                            target: { kind: "set", marcherIds: [] },
                        },
                    ],
                }),
            ).rejects.toThrow(/at least one marcher/);
            expect((await getCueById({ db, id: cue!.id }))!.target).toEqual({
                kind: "set",
                marcherIds: [m1!.id],
            });
        });
    });

    describe("deleteCues", () => {
        testWithHistory(
            "deletes cues and their set members, and undo restores both",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const [a, b] = await createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            target: {
                                kind: "set",
                                marcherIds: [m1!.id, m2!.id],
                            },
                        },
                        hornsUp,
                    ],
                });
                const before = await getCues({ db });
                await deleteCues({ db, cueIds: new Set([a!.id]) });
                expect((await getCues({ db })).map((c) => c.id)).toEqual([
                    b!.id,
                ]);
                expect(
                    await db.select().from(schema.cue_marchers).all(),
                ).toEqual([]);

                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect((await getCues({ db })).map((c) => c.id)).toEqual([
                    b!.id,
                ]);
                await expectNumberOfChanges.test(db, 2);
            },
        );
    });

    describe("ON DELETE through the app's write paths", () => {
        testWithHistoryAndMarchers(
            "deleting a marcher that empties a set deletes the cue; undo restores both",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1, m2] = marchersAndPages.expectedMarchers;
                const [solo, pair] = await createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            target: { kind: "set", marcherIds: [m1!.id] },
                        },
                        {
                            ...hornsUp,
                            target: {
                                kind: "set",
                                marcherIds: [m1!.id, m2!.id],
                            },
                        },
                    ],
                });
                const before = await getCues({ db });

                await deleteMarchers({ db, marcherIds: new Set([m1!.id]) });

                const after = await getCues({ db });
                expect(after.map((c) => c.id)).toEqual([pair!.id]);
                expect(after[0]!.target).toEqual({
                    kind: "set",
                    marcherIds: [m2!.id],
                });
                expect(solo).toBeDefined();

                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(await getCues({ db })).toEqual(after);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistoryAndMarchers(
            "deleting counts carries their cues to the next count; undo restores them",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                const [m1] = marchersAndPages.expectedMarchers;
                const [onSix, onSeven] = await createCues({
                    db,
                    newCues: [
                        {
                            ...hornsUp,
                            beatId: 6,
                            target: { kind: "set", marcherIds: [m1!.id] },
                        },
                        { ...hornsUp, beatId: 7 },
                    ],
                });
                const before = await getCues({ db });

                await deleteBeats({ db, beatIds: new Set([6]) });

                const after = (await getCues({ db })).map((c) => [
                    c.id,
                    c.beatId,
                ]);
                // A set cue and a band cue: different targets, so both stay on 7
                expect(after).toEqual([
                    [onSix!.id, 7],
                    [onSeven!.id, 7],
                ]);
                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(
                    (await getCues({ db })).map((c) => [c.id, c.beatId]),
                ).toEqual(after);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistoryAndMarchers(
            "deleting a tag deletes the cues that target it; undo restores them",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                void marchersAndPages;
                const tagId = await insertTag(db);
                await createCues({
                    db,
                    newCues: [
                        { ...hornsUp, target: { kind: "tag", tagId } },
                        hornsUp,
                    ],
                });
                const before = await getCues({ db });

                await transactionWithHistory(db, "deleteTags", (tx) =>
                    deleteTagsInTransaction({ tx, tagIds: new Set([tagId]) }),
                );

                expect((await getCues({ db })).map((c) => c.target)).toEqual([
                    { kind: "band" },
                ]);
                await performUndo(db);
                expect(await getCues({ db })).toEqual(before);
                await performRedo(db);
                expect(await getCues({ db })).toHaveLength(1);
                // The tag insert, the cues, the tag delete
                await expectNumberOfChanges.test(db, 3);
            },
        );

        it("refuses to delete a phrase asset a cue uses", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const [asset] = await createPhraseAssets({
                db,
                newPhraseAssets: [
                    {
                        name: "Toss copy",
                        label: "1x",
                        source: "copied_builtin",
                        channels: ["horn_equipment"],
                        formatVersion: 1,
                        data: {},
                    },
                ],
            });
            const [cue] = await createCues({
                db,
                newCues: [
                    {
                        ...hornsUp,
                        kind: "phrase",
                        length: 3,
                        value: `show:${asset!.id}`,
                    },
                ],
            });
            await expect(
                deletePhraseAssets({
                    db,
                    phraseAssetIds: new Set([asset!.id]),
                }),
            ).rejects.toThrow();
            expect(
                await db.select().from(schema.phrase_assets).all(),
            ).toHaveLength(1);

            await deleteCues({ db, cueIds: new Set([cue!.id]) });
            await deletePhraseAssets({
                db,
                phraseAssetIds: new Set([asset!.id]),
            });
            expect(await db.select().from(schema.phrase_assets).all()).toEqual(
                [],
            );
        });
    });

    describe("deleting beats carries their cues (ADR 0004 amendment of 2026-10-15)", () => {
        const facing = (
            beatId: number,
            extra: Partial<NewCueArgs> = {},
        ): NewCueArgs => ({
            channel: "facing",
            kind: "state",
            target: { kind: "band" },
            beatId,
            value: "builtin:facing.back",
            ...extra,
        });
        const bodyPhrase = (beatId: number, length: number): NewCueArgs => ({
            channel: "body",
            kind: "phrase",
            target: { kind: "section", section: "Trumpet" },
            beatId,
            value: "builtin:body.choreo", // cspell:disable-line
            length,
        });
        const placed = async (db: DbConnection) =>
            (await getCues({ db })).map((c) => ({
                id: c.id,
                beatId: c.beatId,
                length: c.length,
            }));

        testWithHistoryAndMarchers(
            "keeps only the last cue per channel and target and moves it to the next beat",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [first, last, section5, section6] = await createCues({
                    db,
                    newCues: [
                        facing(6),
                        facing(7, { value: "builtin:facing.side1" }),
                        facing(6, {
                            target: { kind: "section", section: "Trumpet" },
                        }),
                        // The same section, ignoring case and outer spaces
                        facing(7, {
                            target: { kind: "section", section: " trumpet" },
                        }),
                    ],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6, 7]),
                });

                expect(await placed(db)).toEqual([
                    { id: last!.id, beatId: 8, length: null },
                    { id: section6!.id, beatId: 8, length: null },
                ]);
                expect(cues.moved).toEqual([
                    {
                        cueId: last!.id,
                        fromBeatId: 7,
                        toBeatId: 8,
                        toPosition: 6,
                    },
                    {
                        cueId: section6!.id,
                        fromBeatId: 7,
                        toBeatId: 8,
                        toPosition: 6,
                    },
                ]);
                expect(cues.dropped).toEqual([first!.id, section5!.id]);
            },
        );

        testWithHistoryAndMarchers(
            "lets a cue already on the next beat win",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [moved, existing] = await createCues({
                    db,
                    newCues: [facing(6), facing(7)],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6]),
                });

                expect(await placed(db)).toEqual([
                    { id: existing!.id, beatId: 7, length: null },
                ]);
                expect(cues).toEqual({ moved: [], dropped: [moved!.id] });
            },
        );

        testWithHistoryAndMarchers(
            "moves a phrase's start and keeps its length",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [phrase] = await createCues({
                    db,
                    newCues: [bodyPhrase(6, 4)],
                });

                await deleteBeatsCarryingCues({ db, beatIds: new Set([6]) });

                expect(await placed(db)).toEqual([
                    { id: phrase!.id, beatId: 7, length: 4 },
                ]);
            },
        );

        testWithHistoryAndMarchers(
            "shortens a moved phrase to end at the next cue on its channel and target",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [phrase, next, otherTarget] = await createCues({
                    db,
                    newCues: [
                        bodyPhrase(6, 4),
                        // Counts 7 to 10 would run into the state on 9
                        {
                            ...bodyPhrase(9, 2),
                            kind: "state",
                            value: "builtin:body.neutral",
                            length: null,
                        },
                        // Another target doesn't shorten it
                        { ...bodyPhrase(8, 2), target: { kind: "band" } },
                    ],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6]),
                });

                expect(await placed(db)).toEqual([
                    { id: phrase!.id, beatId: 7, length: 2 },
                    { id: next!.id, beatId: 9, length: null },
                    { id: otherTarget!.id, beatId: 8, length: 2 },
                ]);
                expect(cues.moved).toEqual([
                    {
                        cueId: phrase!.id,
                        fromBeatId: 6,
                        toBeatId: 7,
                        toPosition: 6,
                        shortenedTo: 2,
                    },
                ]);
            },
        );

        testWithHistoryAndMarchers(
            "drops a moved phrase that can't fit 2 counts before the next cue",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [phrase, next] = await createCues({
                    db,
                    newCues: [bodyPhrase(6, 4), bodyPhrase(8, 2)],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6]),
                });

                expect(await placed(db)).toEqual([
                    { id: next!.id, beatId: 8, length: 2 },
                ]);
                expect(cues).toEqual({ moved: [], dropped: [phrase!.id] });
            },
        );

        testWithHistoryAndMarchers(
            "drops the cues when nothing comes after the deleted beats",
            async ({ db, marchersAndPages }) => {
                const last = marchersAndPages.expectedBeats.at(-1)!.id;
                const [onLast] = await createCues({
                    db,
                    newCues: [facing(last)],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([last - 1, last]),
                });

                expect(await getCues({ db })).toEqual([]);
                expect(cues).toEqual({ moved: [], dropped: [onLast!.id] });
            },
        );

        testWithHistoryAndMarchers(
            "moves a ripple with its cue unchanged",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [rippled] = await createCues({
                    db,
                    newCues: [
                        facing(6, { ripple: { span: 8, order: "left_right" } }),
                    ],
                });

                await deleteBeatsCarryingCues({ db, beatIds: new Set([6]) });

                expect(await getCueById({ db, id: rippled!.id })).toMatchObject(
                    {
                        beatId: 7,
                        ripple: { span: 8, order: "left_right" },
                        value: "builtin:facing.back",
                    },
                );
            },
        );

        testWithHistoryAndMarchers(
            "carries each run of deleted beats to its own next beat",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                const [onSix, onEleven] = await createCues({
                    db,
                    newCues: [facing(6), facing(11)],
                });

                const { cues } = await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6, 11]),
                });

                expect(await placed(db)).toEqual([
                    { id: onSix!.id, beatId: 7, length: null },
                    { id: onEleven!.id, beatId: 12, length: null },
                ]);
                expect(cues.moved.map((m) => m.toPosition)).toEqual([6, 10]);
            },
        );

        testWithHistoryAndMarchers(
            "is one undo step with the beat deletion",
            async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                void marchersAndPages;
                await createCues({
                    db,
                    newCues: [facing(6), facing(7), bodyPhrase(7, 4)],
                });
                const beforeCues = await getCues({ db });
                const beforeBeats = await db.select().from(schema.beats).all();

                await deleteBeatsCarryingCues({
                    db,
                    beatIds: new Set([6, 7]),
                });
                const afterCues = await getCues({ db });

                await performUndo(db);
                expect(await getCues({ db })).toEqual(beforeCues);
                expect(await db.select().from(schema.beats).all()).toEqual(
                    beforeBeats,
                );
                await performRedo(db);
                expect(await getCues({ db })).toEqual(afterCues);
                await expectNumberOfChanges.test(db, 2);
            },
        );

        testWithHistoryAndMarchers(
            "carries the cues of a deleted measure",
            async ({ db, marchersAndPages }) => {
                void marchersAndPages;
                // Measure 2 is beats 5 to 8; measure 3 starts on 9
                const [onSix] = await createCues({ db, newCues: [facing(6)] });

                const cues = await transactionWithHistory(
                    db,
                    "deleteMeasuresAndBeats",
                    (tx) =>
                        deleteMeasuresAndBeatsInTransaction({
                            tx,
                            measureIds: new Set([2]),
                        }),
                );

                expect(await placed(db)).toEqual([
                    { id: onSix!.id, beatId: 9, length: null },
                ]);
                expect(cues.moved.map((m) => m.toBeatId)).toEqual([9]);
            },
        );
    });
});
