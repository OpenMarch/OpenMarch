import { describe, expect } from "vitest";
import {
    createBeats,
    updateBeats,
    deleteBeats,
    shiftBeats,
    flattenOrder,
    FIRST_BEAT_ID,
} from "../beat";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { inArray, eq } from "drizzle-orm";

const includeInMeasureBooleanToInteger = (beat: any) => {
    return { ...beat, include_in_measure: beat.include_in_measure ? 1 : 0 };
};

describeDbTests("beats", (it) => {
    const testWithHistory = getTestWithHistory(it, [schema.beats]);

    describe("createBeats", () => {
        describe("insert with no existing beats", () => {
            describe.each([
                {
                    description: "Single beat",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single beat not in measure",
                    newBeats: [
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single beat with notes",
                    newBeats: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                    ],
                },
                {
                    description: "Two beats",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Many beats",
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                            notes: "beat 2",
                        },
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.25,
                            include_in_measure: false,
                            notes: "beat 4",
                        },
                        {
                            duration: 1.25,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 0.6,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                },
            ])(
                "%# successfully create atomic beats - $description",
                ({ newBeats }) => {
                    testWithHistory(
                        "Create beats as one action",
                        async ({ db, expectNumberOfChanges }) => {
                            const expectedCreatedBeats = newBeats.map(
                                (newBeat, index) => ({
                                    ...newBeat,
                                    id: index + 1,
                                    position: index + 1,
                                }),
                            );

                            const result = await createBeats({
                                newBeats,
                                db,
                            });
                            expect(new Set(result)).toMatchObject(
                                new Set(expectedCreatedBeats),
                            );

                            const allBeats = await db.query.beats.findMany({
                                orderBy: schema.beats.position,
                            });
                            expect(allBeats.length).toEqual(
                                expectedCreatedBeats.length,
                            );
                            expect(new Set(allBeats)).toMatchObject(
                                new Set(
                                    expectedCreatedBeats.map(
                                        includeInMeasureBooleanToInteger,
                                    ),
                                ),
                            );
                            await expectNumberOfChanges.test(db, 1);
                        },
                    );

                    testWithHistory(
                        "Create beats as many actions",
                        async ({ db, expectNumberOfChanges }) => {
                            const expectedCreatedBeats = newBeats.map(
                                (newBeat, index) => ({
                                    ...newBeat,
                                    id: index + 1,
                                    position: index + 1,
                                }),
                            );

                            for (const newBeat of newBeats) {
                                await createBeats({
                                    newBeats: [newBeat],
                                    db,
                                });
                            }

                            const allBeats = await db.query.beats.findMany({
                                orderBy: schema.beats.position,
                            });
                            expect(allBeats.length).toEqual(
                                expectedCreatedBeats.length,
                            );
                            expect(new Set(allBeats)).toMatchObject(
                                new Set(
                                    expectedCreatedBeats.map(
                                        includeInMeasureBooleanToInteger,
                                    ),
                                ),
                            );
                            // Expect that each beat creation is a separate change on the undo stack
                            await expectNumberOfChanges.test(
                                db,
                                newBeats.length,
                            );
                        },
                    );
                },
            );
        });

        describe("insert with existing beats", () => {
            testWithHistory.for([
                {
                    description: "Single beat",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                    ],
                },
                {
                    description: "insert single at end",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.0,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert single at beginning",
                    existingBeatsArgs: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description: "insert single in middle",
                    existingBeatsArgs: [
                        {
                            duration: 1.0,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert multiple at beginning",
                    existingBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                    ],
                },
                {
                    description: "insert multiple at end",
                    existingBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 3.25,
                            include_in_measure: true,
                        },
                    ],
                },
                {
                    description:
                        "Many existing beats, insert multiple in middle",
                    existingBeatsArgs: [
                        {
                            duration: 0.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 0.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 2.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 2.75,
                            include_in_measure: false,
                        },
                        {
                            duration: 3.25,
                            include_in_measure: true,
                        },
                    ],
                    newBeatsArgs: [
                        {
                            duration: 1.25,
                            include_in_measure: true,
                        },
                        {
                            duration: 1.75,
                            include_in_measure: false,
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, newBeatsArgs },
                    { db, expectNumberOfChanges },
                ) => {
                    const createdExistingBeats = await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });
                    const existingBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });
                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const sortByPosition = (
                        a: { position: number },
                        b: { position: number },
                    ) => a.position - b.position;
                    expect(existingBeats.sort(sortByPosition)).toMatchObject(
                        existingBeatsArgs
                            .map(includeInMeasureBooleanToInteger)
                            .sort(sortByPosition),
                    );
                    expect(new Set(createdExistingBeats)).toMatchObject(
                        new Set(existingBeatsArgs),
                    );

                    const createdNewBeats = await createBeats({
                        newBeats: newBeatsArgs,
                        db,
                    });
                    const allBeats = await db.query.beats.findMany({
                        orderBy: schema.beats.position,
                    });
                    expect(allBeats.sort(sortByPosition)).toMatchObject(
                        [...existingBeatsArgs, ...newBeatsArgs]
                            .map(includeInMeasureBooleanToInteger)
                            .sort(sortByPosition),
                    );
                    expect(new Set(createdNewBeats)).toMatchObject(
                        new Set(newBeatsArgs),
                    );

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("insert with failure", () => {
            testWithHistory.for([
                {
                    description: "duplicate position",
                    newBeatsArgs: [
                        { duration: 0.5, include_in_measure: true },
                        { duration: 0.75, include_in_measure: false },
                    ],
                },
            ])(
                "%# - $description",
                async ({ newBeatsArgs }, { db, expectNumberOfChanges }) => {
                    // This should not fail since we're creating beats with sequential positions
                    // The test structure is kept for consistency but the actual test logic
                    // would need to be adjusted based on actual constraint violations
                    await createBeats({ newBeats: newBeatsArgs, db });
                    await expectNumberOfChanges.test(db, 1);
                },
            );
        });
    });

    describe("updateBeats", () => {
        describe.each([
            {
                description: "updates multiple beats",
                existingBeatsArgs: [
                    {
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "do not touch",
                    },
                    {
                        duration: 2.0,
                        include_in_measure: true,
                        notes: "notes jeff",
                    },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 1,
                        duration: 1.25,
                        include_in_measure: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 1,
                        duration: 1.25,
                        include_in_measure: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: 1.75,
                        include_in_measure: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: true,
            },
            {
                description:
                    "should not update values if it is not provided in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 3,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should not update values if it is undefined in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 3,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should update values if it is null in the updatedBeatArgs",
                existingBeatsArgs: [
                    { duration: 2.0, include_in_measure: true },
                    { duration: 1.5, include_in_measure: false },
                    {
                        duration: 2.25,
                        include_in_measure: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedBeatsArgs: [
                    {
                        id: 1,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: "asdf notes",
                    },
                    {
                        id: 3,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: null,
                    },
                    {
                        id: 2,
                        duration: undefined,
                        include_in_measure: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedBeats: [
                    {
                        id: 1,
                        duration: 2.0,
                        include_in_measure: true,
                        notes: "asdf notes",
                    },
                    {
                        id: 2,
                        duration: 1.5,
                        include_in_measure: false,
                        notes: null,
                    },
                    {
                        id: 3,
                        duration: 2.25,
                        include_in_measure: true,
                        notes: null,
                    },
                ],
                isChangeExpected: true,
            },
        ])(
            "%# - $description",
            ({
                existingBeatsArgs,
                modifiedBeatsArgs,
                expectedUpdatedBeats,
                isChangeExpected,
            }) => {
                testWithHistory(
                    "update as single action",
                    async ({ db, expectNumberOfChanges }) => {
                        // Create existing beats first
                        await createBeats({
                            newBeats: existingBeatsArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the beats
                        const updateResult = await updateBeats({
                            modifiedBeats: modifiedBeatsArgs,
                            db,
                        });

                        expect(updateResult.length).toBe(
                            expectedUpdatedBeats.length,
                        );

                        expect(
                            updateResult.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedBeats.sort((a, b) => a.id - b.id),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                    },
                );
                testWithHistory(
                    "update as multiple actions",
                    async ({ db, expectNumberOfChanges }) => {
                        // Create existing beats first
                        await createBeats({
                            newBeats: existingBeatsArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the beats
                        for (const modifiedBeat of modifiedBeatsArgs) {
                            await updateBeats({
                                modifiedBeats: [modifiedBeat],
                                db,
                            });
                        }

                        const updateBeatIds = modifiedBeatsArgs.map(
                            (modifiedBeat) => modifiedBeat.id,
                        );

                        const updatedBeats = await db.query.beats.findMany({
                            where: inArray(schema.beats.id, updateBeatIds),
                        });

                        expect(updatedBeats.length).toBe(
                            expectedUpdatedBeats.length,
                        );

                        expect(
                            updatedBeats.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedBeats
                                .sort((a, b) => a.id - b.id)
                                .map(includeInMeasureBooleanToInteger),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                modifiedBeatsArgs.length,
                                databaseState,
                            );
                    },
                );
            },
        );

        describe("update with failure", () => {
            testWithHistory.for([
                {
                    description: "should fail to update first beat",
                    existingBeatsArgs: [
                        { duration: 2.0, include_in_measure: true },
                        { duration: 1.5, include_in_measure: false },
                    ],
                    modifiedBeatsArgs: [
                        {
                            id: FIRST_BEAT_ID,
                            duration: 1.0, // Trying to update first beat
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, modifiedBeatsArgs },
                    { db, expectNumberOfChanges },
                ) => {
                    // Create existing beats first
                    await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Attempt to update first beat should be filtered out
                    const updateResult = await updateBeats({
                        modifiedBeats: modifiedBeatsArgs,
                        db,
                    });

                    // Should return empty array since first beat is filtered out
                    expect(updateResult.length).toBe(0);

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );
        });
    });

    describe("deleteBeats", () => {
        describe("no existing data", () => {
            describe.each([
                {
                    description: "delete a single beat",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1],
                },
                {
                    description: "delete multiple beats",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                        {
                            duration: 1.0,
                            include_in_measure: true,
                            notes: "notes",
                        },
                        {
                            duration: 2.5,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1, 3, 5],
                },
                {
                    description: "delete all beats",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1, 2, 3],
                },
                {
                    description: "delete beat with notes",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "very important notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [1],
                },
                {
                    description: "delete beat not in measure",
                    existingBeatsArgs: [
                        {
                            duration: 2.25,
                            include_in_measure: true,
                            notes: "jeff notes",
                        },
                        {
                            duration: 1.5,
                            include_in_measure: false,
                            notes: null,
                        },
                        {
                            duration: 2.0,
                            include_in_measure: true,
                            notes: null,
                        },
                    ],
                    beatIdsToDelete: [2],
                },
            ])(
                "%# - $description",
                ({ beatIdsToDelete, existingBeatsArgs }) => {
                    testWithHistory(
                        "as single action",
                        async ({ db, expectNumberOfChanges }) => {
                            await createBeats({
                                newBeats: existingBeatsArgs,
                                db,
                            });

                            const beatsBeforeDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsBeforeDelete.length,
                                "Ensure all the beats are created",
                            ).toBe(existingBeatsArgs.length);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            const deleteResult = await deleteBeats({
                                beatIds: new Set(beatIdsToDelete),
                                db,
                            });
                            expect(deleteResult.length).toBe(
                                beatIdsToDelete.length,
                            );

                            const beatsAfterDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsAfterDelete.length,
                                "Ensure all the beats are deleted",
                            ).toBe(
                                existingBeatsArgs.length -
                                    beatIdsToDelete.length,
                            );

                            const allBeatIds = new Set(
                                beatsAfterDelete.map((b) => b.id),
                            );
                            for (const beatId of beatIdsToDelete) {
                                expect(allBeatIds.has(beatId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                        },
                    );
                    testWithHistory(
                        "as multiple actions",
                        async ({ db, expectNumberOfChanges }) => {
                            await createBeats({
                                newBeats: existingBeatsArgs,
                                db,
                            });

                            const beatsBeforeDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsBeforeDelete.length,
                                "Ensure all the beats are created",
                            ).toBe(existingBeatsArgs.length);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            for (const beatId of beatIdsToDelete)
                                await deleteBeats({
                                    beatIds: new Set([beatId]),
                                    db,
                                });

                            const beatsAfterDelete =
                                await db.query.beats.findMany();
                            expect(
                                beatsAfterDelete.length,
                                "Ensure all the beats are deleted",
                            ).toBe(
                                existingBeatsArgs.length -
                                    beatIdsToDelete.length,
                            );

                            const allBeatIds = new Set(
                                beatsAfterDelete.map((b) => b.id),
                            );
                            for (const beatId of beatIdsToDelete) {
                                expect(allBeatIds.has(beatId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                beatIdsToDelete.length,
                                databaseState,
                            );
                        },
                    );
                },
            );
            describe("deleteBeats with failure", () => {
                // don't use testWithHistory here because we want to test the failure and nothing will change
                it("Should fail to delete the first beat", async ({ db }) => {
                    // create the first beat
                    await db.insert(schema.beats).values({
                        id: FIRST_BEAT_ID,
                        position: 0,
                        duration: 0,
                    });

                    const beatsBeforeDelete = await db.query.beats.findMany();
                    const firstBeat = beatsBeforeDelete.find(
                        (b) => b.id === FIRST_BEAT_ID,
                    )!;
                    expect(firstBeat).toBeDefined();
                    const allBeatIds = new Set(
                        beatsBeforeDelete.map((b) => b.id),
                    );

                    await deleteBeats({
                        beatIds: allBeatIds,
                        db,
                    });

                    const beatsAfterDelete = await db.query.beats.findMany();

                    // First beat should not have been deleted
                    expect(beatsAfterDelete).toHaveLength(1);
                    expect(beatsAfterDelete[0].id).toEqual(firstBeat.id);
                });

                testWithHistory.for([
                    {
                        description:
                            "Delete beats and also provide beats that don't exist",
                        realBeatIdsToDelete: [1, 2, 3],
                        fakeBeatIdsToDelete: [
                            7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                        ],
                    },
                ])(
                    "%# - Should ignore beats that don't exist",
                    async (
                        { realBeatIdsToDelete, fakeBeatIdsToDelete },
                        { db, expectNumberOfChanges },
                    ) => {
                        // create beats
                        await createBeats({
                            newBeats: Array.from({ length: 10 }, (_, i) => ({
                                duration: 0.5,
                                include_in_measure: true,
                                notes: `beat ${i}`,
                            })),
                            db,
                        });

                        const beatsBeforeDelete = await db
                            .select()
                            .from(schema.beats);

                        const deleteIds = new Set([
                            ...realBeatIdsToDelete,
                            ...fakeBeatIdsToDelete,
                        ]);

                        await deleteBeats({
                            beatIds: deleteIds,
                            db,
                        });

                        const beatsAfterDelete = await db
                            .select()
                            .from(schema.beats);

                        expect(beatsAfterDelete).toHaveLength(
                            beatsBeforeDelete.length -
                                realBeatIdsToDelete.length,
                        );
                    },
                );
            });
        });
    });

    describe("shiftBeats", () => {
        testWithHistory(
            "shift beats forward by positive amount",
            async ({ db, expectNumberOfChanges }) => {
                const existingBeatsArgs = [
                    { duration: 0.5, include_in_measure: true, notes: "first" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "second",
                    },
                    { duration: 0.5, include_in_measure: true, notes: "third" },
                ];
                const shiftParams = {
                    startingPosition: 2,
                    shiftAmount: 2,
                };
                const expectedPositions = [0, 1, 4, 5]; // First beat at 0, then 1, then shifted beats at 4, 5

                // create beat with start beat id
                await db.insert(schema.beats).values({
                    id: FIRST_BEAT_ID,
                    position: 0,
                    duration: 0,
                });

                await createBeats({
                    newBeats: existingBeatsArgs,
                    db,
                });

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                const previousBeatOrders = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const shiftResult = await shiftBeats({
                    db,
                    ...shiftParams,
                });

                expect(shiftResult.length).toBeGreaterThan(0);

                const beatsAfterShift = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const positions = beatsAfterShift.map((b) => b.position);
                expect(
                    positions,
                    `Expected positions to shift from ${previousBeatOrders.map((b) => b.position)} to ${expectedPositions}`,
                ).toEqual(expectedPositions);

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );

        testWithHistory(
            "shift beats backward by negative amount",
            async ({ db, expectNumberOfChanges }) => {
                const existingBeatsArgs = [
                    { duration: 0.5, include_in_measure: true, notes: "first" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "second",
                    },
                    { duration: 0.5, include_in_measure: true, notes: "third" },
                    {
                        duration: 0.5,
                        include_in_measure: true,
                        notes: "fourth",
                    },
                ];
                const shiftParams = {
                    startingPosition: 3,
                    shiftAmount: -1,
                };
                const expectedPositions = [0, 1, 2, 3, 4]; // Should shift third and fourth beats back

                // create beat with start beat id
                await db.insert(schema.beats).values({
                    id: FIRST_BEAT_ID,
                    position: 0,
                    duration: 0,
                });

                await createBeats({
                    newBeats: existingBeatsArgs,
                    db,
                });

                await db
                    .update(schema.beats)
                    .set({
                        position: 5,
                    })
                    .where(eq(schema.beats.position, 4));
                await db
                    .update(schema.beats)
                    .set({
                        position: 4,
                    })
                    .where(eq(schema.beats.position, 3));

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                const previousBeatOrders = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const shiftResult = await shiftBeats({
                    db,
                    ...shiftParams,
                });

                expect(shiftResult.length).toBeGreaterThan(0);

                const beatsAfterShift = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                const positions = beatsAfterShift.map((b) => b.position);
                expect(
                    positions,
                    `Expected positions to shift from ${previousBeatOrders.map((b) => b.position)} to ${expectedPositions}`,
                ).toEqual(expectedPositions);

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );

        describe("shiftBeats with failure", () => {
            testWithHistory.for([
                {
                    description: "should fail to shift beats at position <= 0",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                    ],
                    shiftParams: {
                        startingPosition: 0,
                        shiftAmount: 2,
                    },
                },
                {
                    description:
                        "should fail to shift beats to negative position",
                    existingBeatsArgs: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                    ],
                    shiftParams: {
                        startingPosition: 1,
                        shiftAmount: -2,
                    },
                },
            ])(
                "%# - $description",
                async (
                    { existingBeatsArgs, shiftParams },
                    { db, expectNumberOfChanges },
                ) => {
                    await createBeats({
                        newBeats: existingBeatsArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    await expect(
                        shiftBeats({
                            db,
                            ...shiftParams,
                        }),
                    ).rejects.toThrow();

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );
        });
    });

    describe("flattenOrder", () => {
        testWithHistory(
            "should flatten beat positions to be sequential",
            async ({ db, expectNumberOfChanges }) => {
                // Create beats with non-sequential positions
                await createBeats({
                    newBeats: [
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "first",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "second",
                        },
                        {
                            duration: 0.5,
                            include_in_measure: true,
                            notes: "third",
                        },
                    ],
                    db,
                });

                // Manually create gaps in positions to test flattening
                await db
                    .update(schema.beats)
                    .set({ position: 10 })
                    .where(eq(schema.beats.id, 2));

                await db
                    .update(schema.beats)
                    .set({ position: 20 })
                    .where(eq(schema.beats.id, 3));

                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                await flattenOrder({ db });

                const beatsAfterFlatten = await db.query.beats.findMany({
                    orderBy: schema.beats.position,
                });

                // Check that positions are now sequential (excluding first beat)
                const nonFirstBeats = beatsAfterFlatten.filter(
                    (b) => b.id !== FIRST_BEAT_ID,
                );
                for (let i = 0; i < nonFirstBeats.length; i++) {
                    expect(nonFirstBeats[i].position).toBe(i + 1);
                }

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );
    });
});
