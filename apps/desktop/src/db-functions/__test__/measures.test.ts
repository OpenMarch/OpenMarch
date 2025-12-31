import { describe, expect } from "vitest";
import {
    createMeasures,
    updateMeasures,
    deleteMeasures,
    getMeasures,
    getMeasureById,
    getMeasuresByStartBeat,
    getBeatIdsByMeasureId,
} from "../measures";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import * as fc from "fast-check";

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
                testWithHistory(
                    "should create measures",
                    async ({ db, beats }) => {
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
                    },
                );
            });
        });

        describe("insert with existing measures", () => {
            testWithHistory(
                "should create additional measures when measures already exist",
                async ({ db, beats }) => {
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
                        expect(createdMeasure.notes).toBe(
                            expectedMeasure.notes,
                        );
                    }

                    // Verify all measures exist
                    const allMeasures = await getMeasures({ db });
                    expect(allMeasures).toHaveLength(4);
                },
            );
        });

        describe("edge cases", () => {
            testWithHistory(
                "should handle empty array",
                async ({ db, beats }) => {
                    // Empty array
                    const result = await createMeasures({
                        db,
                        newItems: [],
                    });

                    expect(result).toHaveLength(0);
                },
            );
        });
    });

    describe("getMeasures", () => {
        testWithHistory("should get all measures", async ({ db, beats }) => {
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
        testWithHistory(
            "should get measure by ID and return undefined for non-existent ID",
            async ({ db, beats }) => {
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
            },
        );
    });

    describe("getMeasuresByStartBeat", () => {
        testWithHistory(
            "should get measures by start beat",
            async ({ db, beats }) => {
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
            },
        );
    });

    describe("updateMeasures", () => {
        testWithHistory("should update measures", async ({ db, beats }) => {
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
                const originalMeasure = createdMeasures[i];

                expect(updatedMeasure.id).toBe(expectedMeasure.id);
                // If start_beat wasn't modified, it should retain the original value
                expect(updatedMeasure.start_beat).toBe(
                    expectedMeasure.start_beat ?? originalMeasure.start_beat,
                );
                expect(updatedMeasure.rehearsal_mark).toBe(
                    expectedMeasure.rehearsal_mark,
                );
                expect(updatedMeasure.notes ?? null).toBe(
                    expectedMeasure.notes ?? null,
                );
            }

            // Verify the measures were actually updated in the database
            const retrievedMeasures = await getMeasures({ db });
            expect(retrievedMeasures).toHaveLength(3);

            // Verify each retrieved measure has the correct updated values
            for (const retrievedMeasure of retrievedMeasures) {
                const modifiedMeasure = modifiedMeasures.find(
                    (m) => m.id === retrievedMeasure.id,
                );
                const originalMeasure = createdMeasures.find(
                    (m) => m.id === retrievedMeasure.id,
                );
                // If start_beat wasn't modified, it should retain the original value
                expect(retrievedMeasure.start_beat).toBe(
                    modifiedMeasure!.start_beat ?? originalMeasure!.start_beat,
                );
                expect(retrievedMeasure.rehearsal_mark).toBe(
                    modifiedMeasure!.rehearsal_mark,
                );
                expect(retrievedMeasure.notes ?? null).toBe(
                    modifiedMeasure!.notes ?? null,
                );
            }
        });

        describe("edge cases", () => {
            testWithHistory(
                "should throw error when updating non-existent measure",
                async ({ db, beats }) => {
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
                },
            );
        });
    });

    describe("deleteMeasures", () => {
        testWithHistory("should delete measures", async ({ db, beats }) => {
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
            testWithHistory(
                "should handle deleting non-existent measures",
                async ({ db, beats }) => {
                    // Delete non-existent measures
                    const nonExistentIds = new Set([99999, 99998]);

                    const deletedMeasures = await deleteMeasures({
                        db,
                        itemIds: nonExistentIds,
                    });

                    expect(deletedMeasures).toHaveLength(0);
                },
            );

            testWithHistory(
                "should handle deleting empty set",
                async ({ db, beats }) => {
                    // Delete empty set
                    const emptySet = new Set<number>();

                    const deletedMeasures = await deleteMeasures({
                        db,
                        itemIds: emptySet,
                    });

                    expect(deletedMeasures).toHaveLength(0);
                },
            );
        });
    });

    describe("integration tests", () => {
        testWithHistory(
            "should handle create, update, and delete operations together",
            async ({ db, beats }) => {
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
            },
        );
    });

    describe("getBeatIdsByMeasureId", () => {
        describe("basic tests", () => {
            it("single measure returns all beats from start position to end", async ({
                db,
                beats,
            }) => {
                // beats fixture has 97 beats with positions 0-96
                // Create a single measure starting at beat 1 (position 1)
                const createdMeasures = await createMeasures({
                    db,
                    newItems: [{ start_beat: 1 }],
                });

                const result = await getBeatIdsByMeasureId({
                    db,
                    measureId: createdMeasures[0].id,
                });

                // Should return all beats from position 1 onwards (beats 1-96)
                // Beat 0 is at position 0, which is before measure start
                const allBeats = await db.query.beats.findMany({});
                const expectedBeatIds = new Set(
                    allBeats.filter((b) => b.position >= 1).map((b) => b.id),
                );

                expect(result).toEqual(expectedBeatIds);
                expect(result.size).toBe(96); // beats 1-96
            });

            it("first measure returns beats up to second measure", async ({
                db,
                beats,
            }) => {
                // Create two measures
                const createdMeasures = await createMeasures({
                    db,
                    newItems: [
                        { start_beat: 1 }, // position 1
                        { start_beat: 5 }, // position 5
                    ],
                });

                const result = await getBeatIdsByMeasureId({
                    db,
                    measureId: createdMeasures[0].id,
                });

                // First measure should have beats at positions 1, 2, 3, 4 (not 5)
                const allBeats = await db.query.beats.findMany({});
                const expectedBeatIds = new Set(
                    allBeats
                        .filter((b) => b.position >= 1 && b.position < 5)
                        .map((b) => b.id),
                );

                expect(result).toEqual(expectedBeatIds);
                expect(result.size).toBe(4);
            });

            it("last measure returns all remaining beats", async ({
                db,
                beats,
            }) => {
                // Create two measures
                const createdMeasures = await createMeasures({
                    db,
                    newItems: [
                        { start_beat: 1 }, // position 1
                        { start_beat: 90 }, // position 90
                    ],
                });

                const result = await getBeatIdsByMeasureId({
                    db,
                    measureId: createdMeasures[1].id,
                });

                // Last measure should have all beats from position 90 to 96
                const allBeats = await db.query.beats.findMany({});
                const expectedBeatIds = new Set(
                    allBeats.filter((b) => b.position >= 90).map((b) => b.id),
                );

                expect(result).toEqual(expectedBeatIds);
                expect(result.size).toBe(7); // positions 90-96
            });

            it("middle measure returns beats between adjacent measures", async ({
                db,
                beats,
            }) => {
                // Create three measures
                const createdMeasures = await createMeasures({
                    db,
                    newItems: [
                        { start_beat: 1 }, // position 1
                        { start_beat: 10 }, // position 10
                        { start_beat: 20 }, // position 20
                    ],
                });

                const result = await getBeatIdsByMeasureId({
                    db,
                    measureId: createdMeasures[1].id,
                });

                // Middle measure should have beats at positions 10-19
                const allBeats = await db.query.beats.findMany({});
                const expectedBeatIds = new Set(
                    allBeats
                        .filter((b) => b.position >= 10 && b.position < 20)
                        .map((b) => b.id),
                );

                expect(result).toEqual(expectedBeatIds);
                expect(result.size).toBe(10);
            });

            it("throws error for non-existent measure", async ({
                db,
                beats,
            }) => {
                await expect(
                    getBeatIdsByMeasureId({
                        db,
                        measureId: 99999,
                    }),
                ).rejects.toThrow("Measure ID 99999 does not exist");
            });

            it("measure with single beat returns only that beat", async ({
                db,
                beats,
            }) => {
                // Create two measures where the first has only one beat
                const createdMeasures = await createMeasures({
                    db,
                    newItems: [
                        { start_beat: 1 }, // position 1
                        { start_beat: 2 }, // position 2 (immediately after)
                    ],
                });

                const result = await getBeatIdsByMeasureId({
                    db,
                    measureId: createdMeasures[0].id,
                });

                // First measure should have only beat at position 1
                expect(result.size).toBe(1);
                expect(result.has(1)).toBe(true);
            });
        });

        describe("property-based tests", () => {
            it("returned beat IDs are valid and within measure bounds", async ({
                db,
                beats,
            }) => {
                const allBeats = await db.query.beats.findMany({});
                const validBeatIds = new Set(allBeats.map((b) => b.id));
                const beatPositionById = new Map(
                    allBeats.map((b) => [b.id, b.position]),
                );

                // Generate random measure start positions (sorted, unique)
                await fc.assert(
                    fc.asyncProperty(
                        fc.uniqueArray(fc.integer({ min: 1, max: 90 }), {
                            minLength: 1,
                            maxLength: 5,
                        }),
                        async (startPositions) => {
                            // Sort positions to create ordered measures
                            const sortedPositions = [...startPositions].sort(
                                (a, b) => a - b,
                            );

                            // Create measures at these positions
                            const createdMeasures = await createMeasures({
                                db,
                                newItems: sortedPositions.map((pos) => ({
                                    start_beat: pos,
                                })),
                            });

                            // Test each measure
                            for (let i = 0; i < createdMeasures.length; i++) {
                                const measure = createdMeasures[i];
                                const result = await getBeatIdsByMeasureId({
                                    db,
                                    measureId: measure.id,
                                });

                                const measureStartPos = sortedPositions[i];
                                const nextMeasureStartPos =
                                    i < sortedPositions.length - 1
                                        ? sortedPositions[i + 1]
                                        : Infinity;

                                // All returned beat IDs should be valid
                                for (const beatId of result) {
                                    expect(validBeatIds.has(beatId)).toBe(true);
                                }

                                // All returned beats should be within bounds
                                for (const beatId of result) {
                                    const pos = beatPositionById.get(beatId)!;
                                    expect(pos).toBeGreaterThanOrEqual(
                                        measureStartPos,
                                    );
                                    expect(pos).toBeLessThan(
                                        nextMeasureStartPos,
                                    );
                                }
                            }

                            // Cleanup: delete created measures
                            await deleteMeasures({
                                db,
                                itemIds: new Set(
                                    createdMeasures.map((m) => m.id),
                                ),
                            });
                        },
                    ),
                    { numRuns: 20 },
                );
            });

            it("measures do not share beats - no overlap", async ({
                db,
                beats,
            }) => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.uniqueArray(fc.integer({ min: 1, max: 80 }), {
                            minLength: 2,
                            maxLength: 5,
                        }),
                        async (startPositions) => {
                            const sortedPositions = [...startPositions].sort(
                                (a, b) => a - b,
                            );

                            const createdMeasures = await createMeasures({
                                db,
                                newItems: sortedPositions.map((pos) => ({
                                    start_beat: pos,
                                })),
                            });

                            // Get beat IDs for all measures
                            const beatIdsByMeasure: Set<number>[] = [];
                            for (const measure of createdMeasures) {
                                const result = await getBeatIdsByMeasureId({
                                    db,
                                    measureId: measure.id,
                                });
                                beatIdsByMeasure.push(result);
                            }

                            // Check no overlap between any two measures
                            for (let i = 0; i < beatIdsByMeasure.length; i++) {
                                for (
                                    let j = i + 1;
                                    j < beatIdsByMeasure.length;
                                    j++
                                ) {
                                    const intersection = new Set(
                                        [...beatIdsByMeasure[i]].filter((id) =>
                                            beatIdsByMeasure[j].has(id),
                                        ),
                                    );
                                    expect(
                                        intersection.size,
                                        `Measures ${i} and ${j} should not share beats`,
                                    ).toBe(0);
                                }
                            }

                            // Cleanup
                            await deleteMeasures({
                                db,
                                itemIds: new Set(
                                    createdMeasures.map((m) => m.id),
                                ),
                            });
                        },
                    ),
                    { numRuns: 20 },
                );
            });

            it("union of all measures covers all beats from first measure to end", async ({
                db,
                beats,
            }) => {
                const allBeats = await db.query.beats.findMany({});

                await fc.assert(
                    fc.asyncProperty(
                        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), {
                            minLength: 1,
                            maxLength: 5,
                        }),
                        async (startPositions) => {
                            const sortedPositions = [...startPositions].sort(
                                (a, b) => a - b,
                            );

                            const createdMeasures = await createMeasures({
                                db,
                                newItems: sortedPositions.map((pos) => ({
                                    start_beat: pos,
                                })),
                            });

                            // Collect all beat IDs from all measures
                            const allMeasureBeatIds = new Set<number>();
                            for (const measure of createdMeasures) {
                                const result = await getBeatIdsByMeasureId({
                                    db,
                                    measureId: measure.id,
                                });
                                result.forEach((id) =>
                                    allMeasureBeatIds.add(id),
                                );
                            }

                            // Should cover all beats from first measure position to end
                            const firstMeasurePos = sortedPositions[0];
                            const expectedBeatIds = new Set(
                                allBeats
                                    .filter(
                                        (b) => b.position >= firstMeasurePos,
                                    )
                                    .map((b) => b.id),
                            );

                            expect(allMeasureBeatIds).toEqual(expectedBeatIds);

                            // Cleanup
                            await deleteMeasures({
                                db,
                                itemIds: new Set(
                                    createdMeasures.map((m) => m.id),
                                ),
                            });
                        },
                    ),
                    { numRuns: 20 },
                );
            });
        });
    });

    describe("deleteMeasuresAndBeatsInTransaction", () => {
        testWithHistory(
            "should delete measures and beats in transaction",
            async ({ db, beats }) => {
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
                ];
            },
        );
    });
});
