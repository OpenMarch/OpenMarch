import { describe, expect } from "vitest";
import {
    createMeasures,
    updateMeasures,
    deleteMeasures,
    getMeasures,
    getMeasureById,
    getMeasuresByStartBeat,
} from "../measures";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import type { DbConnection } from "@/db-functions";

describeDbTests("measures", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.measures,
        schema.beats,
    ]);

    describe("createMeasures", () => {
        describe("insert with no existing measures", () => {
            describe.each([
                {
                    description: "Single measure",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: null,
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single measure with rehearsal mark",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: "A",
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Single measure with notes",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: null,
                            notes: "jeff notes",
                        },
                    ],
                },
                {
                    description:
                        "Single measure with both rehearsal mark and notes",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: "B",
                            notes: "measure notes",
                        },
                    ],
                },
                {
                    description: "Two measures",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: "A",
                            notes: null,
                        },
                        {
                            start_beat: 4,
                            rehearsal_mark: "B",
                            notes: null,
                        },
                    ],
                },
                {
                    description: "Many measures",
                    newMeasures: [
                        {
                            start_beat: 1,
                            rehearsal_mark: "A",
                            notes: null,
                        },
                        {
                            start_beat: 4,
                            rehearsal_mark: "B",
                            notes: "second measure",
                        },
                        {
                            start_beat: 8,
                            rehearsal_mark: null,
                            notes: null,
                        },
                        {
                            start_beat: 12,
                            rehearsal_mark: "C",
                            notes: "fourth measure",
                        },
                        {
                            start_beat: 16,
                            rehearsal_mark: null,
                            notes: "fifth measure",
                        },
                    ],
                },
            ])("$description", ({ newMeasures }) => {
                testWithHistory(async ({ db }: { db: DbConnection }) => {
                    const result = await createMeasures({
                        db,
                        newItems: newMeasures,
                    });

                    expect(result).toHaveLength(newMeasures.length);

                    // Verify each created measure matches the expected data
                    for (let i = 0; i < newMeasures.length; i++) {
                        const createdMeasure = result[i];
                        const expectedMeasure = newMeasures[i];

                        expect(createdMeasure.id).toBeGreaterThan(0);
                        expect(createdMeasure.start_beat).toBe(
                            expectedMeasure.start_beat,
                        );
                        expect(createdMeasure.rehearsal_mark).toBe(
                            expectedMeasure.rehearsal_mark,
                        );
                        expect(createdMeasure.notes).toBe(
                            expectedMeasure.notes,
                        );
                        expect(createdMeasure.created_at).toBeDefined();
                        expect(createdMeasure.updated_at).toBeDefined();
                    }
                });
            });
        });

        describe("insert with existing measures", () => {
            testWithHistory(async ({ db }: { db: DbConnection }) => {
                // Create initial measures
                const initialMeasures = [
                    {
                        start_beat: 1,
                        rehearsal_mark: "A",
                        notes: null,
                    },
                    {
                        start_beat: 4,
                        rehearsal_mark: "B",
                        notes: null,
                    },
                ];

                await createMeasures({
                    db,
                    newItems: initialMeasures,
                });

                // Create additional measures
                const additionalMeasures = [
                    {
                        start_beat: 8,
                        rehearsal_mark: "C",
                        notes: "third measure",
                    },
                    {
                        start_beat: 12,
                        rehearsal_mark: null,
                        notes: "fourth measure",
                    },
                ];

                const result = await createMeasures({
                    db,
                    newItems: additionalMeasures,
                });

                expect(result).toHaveLength(2);

                // Verify each new measure was created correctly
                for (let i = 0; i < additionalMeasures.length; i++) {
                    const createdMeasure = result[i];
                    const expectedMeasure = additionalMeasures[i];

                    expect(createdMeasure.id).toBeGreaterThan(0);
                    expect(createdMeasure.start_beat).toBe(
                        expectedMeasure.start_beat,
                    );
                    expect(createdMeasure.rehearsal_mark).toBe(
                        expectedMeasure.rehearsal_mark,
                    );
                    expect(createdMeasure.notes).toBe(expectedMeasure.notes);
                }

                // Verify all measures exist
                const allMeasures = await getMeasures({ db });
                expect(allMeasures).toHaveLength(4);
            });
        });

        describe("edge cases", () => {
            testWithHistory(async ({ db }: { db: DbConnection }) => {
                // Empty array
                const result = await createMeasures({
                    db,
                    newItems: [],
                });

                expect(result).toHaveLength(0);
            });
        });
    });

    describe("getMeasures", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Initially no measures
            let measures = await getMeasures({ db });
            expect(measures).toHaveLength(0);

            // Create some measures
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: null,
                },
                {
                    start_beat: 4,
                    rehearsal_mark: "B",
                    notes: "second measure",
                },
                {
                    start_beat: 8,
                    rehearsal_mark: null,
                    notes: "third measure",
                },
            ];

            await createMeasures({
                db,
                newItems: newMeasures,
            });

            // Get all measures
            measures = await getMeasures({ db });
            expect(measures).toHaveLength(3);

            // Verify each measure matches the expected data
            for (let i = 0; i < newMeasures.length; i++) {
                const measure = measures[i];
                const expectedMeasure = newMeasures[i];

                expect(measure.start_beat).toBe(expectedMeasure.start_beat);
                expect(measure.rehearsal_mark).toBe(
                    expectedMeasure.rehearsal_mark,
                );
                expect(measure.notes).toBe(expectedMeasure.notes);
            }
        });
    });

    describe("getMeasureById", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Create a measure
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: "test measure",
                },
            ];

            const createdMeasures = await createMeasures({
                db,
                newItems: newMeasures,
            });

            const createdMeasure = createdMeasures[0];

            // Get measure by ID
            const retrievedMeasure = await getMeasureById({
                db,
                id: createdMeasure.id,
            });

            expect(retrievedMeasure).toBeDefined();
            expect(retrievedMeasure!.id).toBe(createdMeasure.id);
            expect(retrievedMeasure!.start_beat).toBe(
                createdMeasure.start_beat,
            );
            expect(retrievedMeasure!.rehearsal_mark).toBe(
                createdMeasure.rehearsal_mark,
            );
            expect(retrievedMeasure!.notes).toBe(createdMeasure.notes);

            // Get non-existent measure
            const nonExistentMeasure = await getMeasureById({
                db,
                id: 99999,
            });

            expect(nonExistentMeasure).toBeUndefined();
        });
    });

    describe("getMeasuresByStartBeat", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Create measures with different start beats
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: null,
                },
                {
                    start_beat: 4,
                    rehearsal_mark: "B",
                    notes: null,
                },
                {
                    start_beat: 1, // Same start beat as first
                    rehearsal_mark: "A'",
                    notes: "repeat",
                },
                {
                    start_beat: 8,
                    rehearsal_mark: "C",
                    notes: null,
                },
            ];

            await createMeasures({
                db,
                newItems: newMeasures,
            });

            // Get measures by start beat 1
            const measuresAtBeat1 = await getMeasuresByStartBeat({
                db,
                startBeat: 1,
            });

            expect(measuresAtBeat1).toHaveLength(2);
            expect(measuresAtBeat1[0].start_beat).toBe(1);
            expect(measuresAtBeat1[1].start_beat).toBe(1);

            // Get measures by start beat 4
            const measuresAtBeat4 = await getMeasuresByStartBeat({
                db,
                startBeat: 4,
            });

            expect(measuresAtBeat4).toHaveLength(1);
            expect(measuresAtBeat4[0].start_beat).toBe(4);
            expect(measuresAtBeat4[0].rehearsal_mark).toBe("B");

            // Get measures by non-existent start beat
            const measuresAtNonExistentBeat = await getMeasuresByStartBeat({
                db,
                startBeat: 999,
            });

            expect(measuresAtNonExistentBeat).toHaveLength(0);
        });
    });

    describe("updateMeasures", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Create initial measures
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: null,
                },
                {
                    start_beat: 4,
                    rehearsal_mark: "B",
                    notes: "original notes",
                },
                {
                    start_beat: 8,
                    rehearsal_mark: null,
                    notes: null,
                },
            ];

            const createdMeasures = await createMeasures({
                db,
                newItems: newMeasures,
            });

            // Update measures
            const modifiedMeasures = [
                {
                    id: createdMeasures[0].id,
                    start_beat: 2, // Change start beat
                    rehearsal_mark: "A'", // Change rehearsal mark
                    notes: "updated notes", // Add notes
                },
                {
                    id: createdMeasures[1].id,
                    rehearsal_mark: "B'", // Change rehearsal mark
                    notes: "updated notes", // Change notes
                    // Don't change start_beat
                },
                {
                    id: createdMeasures[2].id,
                    start_beat: 9, // Change start beat
                    rehearsal_mark: "C", // Add rehearsal mark
                    // Don't change notes
                },
            ];

            const updatedMeasures = await updateMeasures({
                db,
                modifiedItems: modifiedMeasures,
            });

            expect(updatedMeasures).toHaveLength(3);

            // Verify each updated measure matches the expected changes
            for (let i = 0; i < modifiedMeasures.length; i++) {
                const updatedMeasure = updatedMeasures[i];
                const expectedMeasure = modifiedMeasures[i];

                expect(updatedMeasure.id).toBe(expectedMeasure.id);
                expect(updatedMeasure.start_beat).toBe(
                    expectedMeasure.start_beat,
                );
                expect(updatedMeasure.rehearsal_mark).toBe(
                    expectedMeasure.rehearsal_mark,
                );
                expect(updatedMeasure.notes).toBe(expectedMeasure.notes);
            }

            // Verify the measures were actually updated in the database
            const retrievedMeasures = await getMeasures({ db });
            expect(retrievedMeasures).toHaveLength(3);

            // Verify each retrieved measure has the correct updated values
            for (const retrievedMeasure of retrievedMeasures) {
                const expectedMeasure = modifiedMeasures.find(
                    (m) => m.id === retrievedMeasure.id,
                );
                expect(retrievedMeasure.start_beat).toBe(
                    expectedMeasure!.start_beat,
                );
                expect(retrievedMeasure.rehearsal_mark).toBe(
                    expectedMeasure!.rehearsal_mark,
                );
                expect(retrievedMeasure.notes).toBe(expectedMeasure!.notes);
            }
        });

        describe("edge cases", () => {
            testWithHistory(async ({ db }: { db: DbConnection }) => {
                // Update non-existent measure
                const modifiedMeasures = [
                    {
                        id: 99999,
                        start_beat: 1,
                        rehearsal_mark: "A",
                        notes: "test",
                    },
                ];

                await expect(
                    updateMeasures({
                        db,
                        modifiedItems: modifiedMeasures,
                    }),
                ).rejects.toThrow();
            });
        });
    });

    describe("deleteMeasures", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Create measures
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: null,
                },
                {
                    start_beat: 4,
                    rehearsal_mark: "B",
                    notes: "second measure",
                },
                {
                    start_beat: 8,
                    rehearsal_mark: "C",
                    notes: "third measure",
                },
                {
                    start_beat: 12,
                    rehearsal_mark: "D",
                    notes: "fourth measure",
                },
            ];

            const createdMeasures = await createMeasures({
                db,
                newItems: newMeasures,
            });

            // Delete some measures
            const measuresToDelete = new Set([
                createdMeasures[0].id,
                createdMeasures[2].id,
            ]);

            const deletedMeasures = await deleteMeasures({
                db,
                itemIds: measuresToDelete,
            });

            expect(deletedMeasures).toHaveLength(2);

            // Verify the correct measures were deleted
            const deletedIds = deletedMeasures.map((m) => m.id);
            expect(deletedIds).toContain(createdMeasures[0].id);
            expect(deletedIds).toContain(createdMeasures[2].id);

            // Verify remaining measures
            const remainingMeasures = await getMeasures({ db });
            expect(remainingMeasures).toHaveLength(2);

            const remainingIds = remainingMeasures.map((m) => m.id);
            expect(remainingIds).toContain(createdMeasures[1].id);
            expect(remainingIds).toContain(createdMeasures[3].id);
        });

        describe("edge cases", () => {
            testWithHistory(async ({ db }: { db: DbConnection }) => {
                // Delete non-existent measures
                const nonExistentIds = new Set([99999, 99998]);

                const deletedMeasures = await deleteMeasures({
                    db,
                    itemIds: nonExistentIds,
                });

                expect(deletedMeasures).toHaveLength(0);
            });

            testWithHistory(async ({ db }: { db: DbConnection }) => {
                // Delete empty set
                const emptySet = new Set<number>();

                const deletedMeasures = await deleteMeasures({
                    db,
                    itemIds: emptySet,
                });

                expect(deletedMeasures).toHaveLength(0);
            });
        });
    });

    describe("integration tests", () => {
        testWithHistory(async ({ db }: { db: DbConnection }) => {
            // Create measures
            const newMeasures = [
                {
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: "opening",
                },
                {
                    start_beat: 4,
                    rehearsal_mark: "B",
                    notes: "verse",
                },
                {
                    start_beat: 8,
                    rehearsal_mark: "C",
                    notes: "chorus",
                },
            ];

            const createdMeasures = await createMeasures({
                db,
                newItems: newMeasures,
            });

            // Update one measure
            const updatedMeasures = await updateMeasures({
                db,
                modifiedItems: [
                    {
                        id: createdMeasures[1].id,
                        rehearsal_mark: "B'",
                        notes: "updated verse",
                    },
                ],
            });

            expect(updatedMeasures).toHaveLength(1);
            expect(updatedMeasures[0].rehearsal_mark).toBe("B'");
            expect(updatedMeasures[0].notes).toBe("updated verse");

            // Delete one measure
            const deletedMeasures = await deleteMeasures({
                db,
                itemIds: new Set([createdMeasures[2].id]),
            });

            expect(deletedMeasures).toHaveLength(1);
            expect(deletedMeasures[0].rehearsal_mark).toBe("C");

            // Verify final state
            const finalMeasures = await getMeasures({ db });
            expect(finalMeasures).toHaveLength(2);

            const finalIds = finalMeasures.map((m) => m.id);
            expect(finalIds).toContain(createdMeasures[0].id);
            expect(finalIds).toContain(createdMeasures[1].id);
            expect(finalIds).not.toContain(createdMeasures[2].id);

            // Verify the updated measure
            const updatedMeasure = finalMeasures.find(
                (m) => m.id === createdMeasures[1].id,
            );
            expect(updatedMeasure!.rehearsal_mark).toBe("B'");
            expect(updatedMeasure!.notes).toBe("updated verse");
        });
    });
});
