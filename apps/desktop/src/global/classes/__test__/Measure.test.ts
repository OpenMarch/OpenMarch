import { beforeEach, describe, expect, it } from "vitest";
import Beat from "../Beat";
import { setupTestSqlProxy } from "@/__mocks__/TestSqlProxy";
import { FIRST_BEAT_ID } from "../../../../electron/database/tables/BeatTable";
import { db, schema } from "@/global/database/db";
import {
    DatabaseMeasure,
    fromDatabaseMeasures,
    getMeasures,
    getMeasureById,
    createMeasuresDb,
    updateMeasuresDb,
    deleteMeasuresDb,
    getMeasuresByBeatId,
    type NewMeasureArgs,
    type ModifiedMeasureArgs,
} from "../Measure";

const { beats } = schema;

describe("Measure", () => {
    describe("fromDatabaseMeasures", () => {
        it("should return an empty array when no measures are provided", () => {
            const result = fromDatabaseMeasures({
                databaseMeasures: [],
                allBeats: [],
            });

            expect(result).toEqual([]);
        });

        it("should correctly convert a single measure", () => {
            const beat = {
                position: 1,
                id: 1,
                duration: 1000,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 0,
            } satisfies Beat;
            const databaseMeasure: DatabaseMeasure = {
                id: 1,
                start_beat: 1,
                rehearsal_mark: "A",
                notes: "First measure",
                created_at: "2023-01-01",
                updated_at: "2023-01-01",
            };

            const result = fromDatabaseMeasures({
                databaseMeasures: [databaseMeasure],
                allBeats: [beat],
            });

            expect(result.length).toBe(1);
            expect(result[0].id).toBe(1);
            expect(result[0].rehearsalMark).toBe("A");
            expect(result[0].notes).toBe("First measure");
            expect(result[0].beats).toHaveLength(1);
            expect(result[0].beats[0]).toBe(beat);
            expect(result[0].duration).toBe(1000); // From mocked beatsDuration
        });

        it("should correctly convert multiple measures", () => {
            const beats = [
                {
                    position: 1,
                    id: 1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    position: 2,
                    id: 2,
                    duration: 100,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 100,
                } satisfies Beat,
                {
                    position: 3,
                    id: 3,
                    duration: 200,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 200,
                } satisfies Beat,
                {
                    position: 4,
                    id: 4,
                    duration: 300,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 300,
                } satisfies Beat,
            ];

            const databaseMeasures: DatabaseMeasure[] = [
                {
                    id: 1,
                    start_beat: 1,
                    rehearsal_mark: "A",
                    notes: "First measure",
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
                {
                    id: 2,
                    start_beat: 3,
                    rehearsal_mark: "B",
                    notes: "Second measure",
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
            ];

            const result = fromDatabaseMeasures({
                databaseMeasures,
                allBeats: beats,
            });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].rehearsalMark).toBe("A");
            expect(result[0].number).toBe(1); // First measure number is 1
            expect(result[1].id).toBe(2);
            expect(result[1].rehearsalMark).toBe("B");
            expect(result[1].number).toBe(2); // Second measure number is 2
        });

        it("should handle measures with null rehearsal marks and notes", () => {
            const beats = [
                {
                    position: 1,
                    id: 1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 0,
                } satisfies Beat,
                {
                    position: 2,
                    id: 2,
                    duration: 100,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 100,
                } satisfies Beat,
            ];

            const databaseMeasures: DatabaseMeasure[] = [
                {
                    id: 1,
                    start_beat: 1,
                    rehearsal_mark: null,
                    notes: null,
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
            ];

            const result = fromDatabaseMeasures({
                databaseMeasures,
                allBeats: beats,
            });

            expect(result.length).toBe(1);
            expect(result[0].id).toBe(1);
            expect(result[0].rehearsalMark).toBeNull();
            expect(result[0].notes).toBeNull();
        });

        it("should correctly sort measures by number", () => {
            const beats = [
                {
                    position: 3,
                    id: 3,
                    duration: 200,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 200,
                } satisfies Beat, // Intentionally out of order
                {
                    position: 1,
                    id: 1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    position: 2,
                    id: 2,
                    duration: 100,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 100,
                } satisfies Beat,
                {
                    position: 4,
                    id: 4,
                    duration: 300,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 300,
                } satisfies Beat,
            ];

            const databaseMeasures: DatabaseMeasure[] = [
                {
                    id: 2,
                    start_beat: 3, // This should come second
                    rehearsal_mark: "B",
                    notes: "Second measure",
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
                {
                    id: 1,
                    start_beat: 1, // This should come first
                    rehearsal_mark: "A",
                    notes: "First measure",
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
            ];

            const result = fromDatabaseMeasures({
                databaseMeasures,
                allBeats: beats,
            });

            expect(result.length).toBe(2);
            expect(result[0].number).toBe(1);
            expect(result[1].number).toBe(2);
            expect(result[0].id).toBe(1); // First in sorted order
            expect(result[1].id).toBe(2); // Second in sorted order
        });

        it("should assign beats to the correct measures", () => {
            const beats = [
                {
                    position: 1,
                    id: 1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 0,
                } satisfies Beat,
                {
                    position: 2,
                    id: 2,
                    duration: 100,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 100,
                } satisfies Beat,
                {
                    position: 3,
                    id: 3,
                    duration: 200,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 200,
                } satisfies Beat,
                {
                    position: 4,
                    id: 4,
                    duration: 300,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 300,
                } satisfies Beat,
            ];

            const databaseMeasures: DatabaseMeasure[] = [
                {
                    id: 1,
                    start_beat: 1, // First measure starts at beat 1
                    rehearsal_mark: null,
                    notes: null,
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
                {
                    id: 2,
                    start_beat: 3, // Second measure starts at beat 3
                    rehearsal_mark: null,
                    notes: null,
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                },
            ];

            const result = fromDatabaseMeasures({
                databaseMeasures,
                allBeats: beats,
            });

            expect(result.length).toBe(2);

            // First measure should include beats 1 and 2
            expect(result[0].beats).toHaveLength(2);
            expect(result[0].beats[0].id).toBe(1);
            expect(result[0].beats[1].id).toBe(2);

            // Second measure should include beats 3 and 4
            expect(result[1].beats).toHaveLength(2);
            expect(result[1].beats[0].id).toBe(3);
            expect(result[1].beats[1].id).toBe(4);
        });
    });

    // Database operation tests
    describe("Database Operations", () => {
        beforeEach(async () => {
            await setupTestSqlProxy();

            // Create some beats for measures to reference using direct database calls
            // Beat with ID 0 already exists, so create additional beats with IDs 1 and 2
            await db
                .insert(beats)
                .values([
                    {
                        id: 1,
                        duration: 1.0,
                        position: 1,
                        include_in_measure: 1,
                    },
                    {
                        id: 2,
                        duration: 1.0,
                        position: 2,
                        include_in_measure: 1,
                    },
                ])
                .run();
        });

        describe("getMeasures", () => {
            it("should return all measures", async () => {
                const result = await getMeasures();
                expect(result.success).toBe(true);
                expect(Array.isArray(result.data)).toBe(true);
            });
        });

        describe("createMeasures", () => {
            it("should create new measures", async () => {
                const newMeasures: NewMeasureArgs[] = [
                    {
                        start_beat: FIRST_BEAT_ID,
                        rehearsal_mark: "A",
                        notes: "Test measure",
                    },
                ];

                const result = await createMeasuresDb(newMeasures);
                expect(Array.isArray(result)).toBe(true);
                expect(result).toHaveLength(1);
                expect(result[0]).toMatchObject({
                    start_beat: FIRST_BEAT_ID,
                    rehearsal_mark: "A",
                    notes: "Test measure",
                });
            });
        });

        describe("updateMeasures", () => {
            it("should update existing measures", async () => {
                // First create a measure
                const newMeasures: NewMeasureArgs[] = [
                    {
                        start_beat: FIRST_BEAT_ID,
                        rehearsal_mark: "A",
                        notes: "Original",
                    },
                ];
                const createResult = await createMeasuresDb(newMeasures);
                expect(Array.isArray(createResult)).toBe(true);
                const createdMeasure = createResult[0];

                // Now update it
                const modifiedMeasures: ModifiedMeasureArgs[] = [
                    {
                        id: createdMeasure.id,
                        rehearsal_mark: "B",
                        notes: "Updated",
                    },
                ];

                const result = await updateMeasuresDb(modifiedMeasures);
                expect(Array.isArray(result)).toBe(true);
                expect(result[0]).toMatchObject({
                    id: createdMeasure.id,
                    rehearsal_mark: "B",
                    notes: "Updated",
                });
            });
        });

        describe("deleteMeasures", () => {
            it("should delete measures", async () => {
                // First create a measure
                const newMeasures: NewMeasureArgs[] = [
                    {
                        start_beat: FIRST_BEAT_ID,
                        rehearsal_mark: "A",
                    },
                ];
                const createResult = await createMeasuresDb(newMeasures);
                expect(Array.isArray(createResult)).toBe(true);
                const createdMeasure = createResult[0];

                // Now delete it
                const result = await deleteMeasuresDb(
                    new Set([createdMeasure.id]),
                );
                expect(Array.isArray(result)).toBe(true);
                expect(result[0].id).toBe(createdMeasure.id);
            });
        });

        describe("getMeasureById", () => {
            it("should return a specific measure", async () => {
                // First create a measure
                const newMeasures: NewMeasureArgs[] = [
                    {
                        start_beat: FIRST_BEAT_ID,
                        rehearsal_mark: "A",
                    },
                ];
                const createResult = await createMeasuresDb(newMeasures);
                expect(Array.isArray(createResult)).toBe(true);
                const createdMeasure = createResult[0];

                // Get it by ID
                const result = await getMeasureById(createdMeasure.id);
                expect(result.success).toBe(true);
                expect(result.data?.id).toBe(createdMeasure.id);
            });

            it("should return undefined for non-existent measure", async () => {
                const result = await getMeasureById(999);
                expect(result.success).toBe(true);
                expect(result.data).toBeUndefined();
            });
        });

        describe("getMeasuresByBeatId", () => {
            it("should return measures for a specific beat", async () => {
                // First create a measure
                const newMeasures: NewMeasureArgs[] = [
                    {
                        start_beat: FIRST_BEAT_ID,
                        rehearsal_mark: "A",
                    },
                ];
                const createResult = await createMeasuresDb(newMeasures);
                expect(Array.isArray(createResult)).toBe(true);

                // Get measures by beat ID
                const result = await getMeasuresByBeatId(FIRST_BEAT_ID);
                expect(result.success).toBe(true);
                expect(Array.isArray(result.data)).toBe(true);
            });
        });
    });
});
