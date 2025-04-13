import { describe, expect, it } from "vitest";
import {
    compareBeats,
    beatsDuration,
    fromDatabaseBeat,
    durationToBeats,
} from "../Beat";
import type Beat from "../Beat";
import { DatabaseBeat } from "electron/database/tables/BeatTable";

describe("Beat", () => {
    describe("compareBeats", () => {
        it("should return negative when first beat has lower position", () => {
            // Arrange
            const beatA: Beat = {
                id: 1,
                position: 10,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
                i: 0,
            };
            const beatB: Beat = {
                id: 2,
                position: 20,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
                i: 1,
            };

            // Act
            const result = compareBeats(beatA, beatB);

            // Assert
            expect(result).toBeLessThan(0);
        });

        it("should return positive when first beat has higher position", () => {
            // Arrange
            const beatA: Beat = {
                id: 2,
                position: 20,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
                i: 0,
            };
            const beatB: Beat = {
                id: 1,
                position: 10,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
                i: 1,
            };

            // Act
            const result = compareBeats(beatA, beatB);

            // Assert
            expect(result).toBeGreaterThan(0);
        });

        it("should return zero when beats have the same position", () => {
            // Arrange
            const beatA: Beat = {
                id: 1,
                position: 10,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
                i: 0,
            };
            const beatB: Beat = {
                id: 2,
                position: 10,
                duration: 2.0,
                includeInMeasure: false,
                notes: "Different beat, same position",
                i: 1,
            };

            // Act
            const result = compareBeats(beatA, beatB);

            // Assert
            expect(result).toBe(0);
        });
    });

    describe("beatsDuration", () => {
        it("should calculate total duration of beats array", () => {
            // Arrange
            const beats: Beat[] = [
                {
                    id: 1,
                    position: 10,
                    duration: 1.5,
                    includeInMeasure: true,
                    notes: null,
                    i: 0,
                },
                {
                    id: 2,
                    position: 20,
                    duration: 2.5,
                    includeInMeasure: true,
                    notes: null,
                    i: 1,
                },
                {
                    id: 3,
                    position: 30,
                    duration: 3.0,
                    includeInMeasure: false,
                    notes: null,
                    i: 2,
                },
            ];

            // Act
            const result = beatsDuration(beats);

            // Assert
            expect(result).toBe(7.0);
        });

        it("should return 0 for empty beats array", () => {
            // Arrange
            const beats: Beat[] = [];

            // Act
            const result = beatsDuration(beats);

            // Assert
            expect(result).toBe(0);
        });

        it("should handle negative durations correctly", () => {
            // Arrange
            const beats: Beat[] = [
                {
                    id: 1,
                    position: 10,
                    duration: 2.0,
                    includeInMeasure: true,
                    notes: null,
                    i: 0,
                },
                {
                    id: 2,
                    position: 20,
                    duration: -1.0, // Edge case: negative duration
                    includeInMeasure: true,
                    notes: null,
                    i: 1,
                },
            ];

            // Act
            const result = beatsDuration(beats);

            // Assert
            expect(result).toBe(1.0);
        });
    });

    describe("fromDatabaseBeat", () => {
        it("should convert a DatabaseBeat to a Beat", () => {
            // Arrange
            const databaseBeat: DatabaseBeat = {
                id: 1,
                position: 10,
                duration: 2.5,
                include_in_measure: 1,
                notes: "Test note",
                created_at: "2022-01-01 00:00:00",
                updated_at: "2022-01-01 00:00:00",
            };

            // Act
            const result = fromDatabaseBeat(databaseBeat, 0);

            // Assert
            expect(result).toEqual({
                id: 1,
                i: 0,
                position: 10,
                duration: 2.5,
                includeInMeasure: true,
                notes: "Test note",
            });
        });

        it("should set includeInMeasure to false when include_in_measure is 0", () => {
            // Arrange
            const databaseBeat: DatabaseBeat = {
                id: 2,
                position: 20,
                duration: 1.5,
                include_in_measure: 0,
                notes: null,
                created_at: "2022-01-01 00:00:00",
                updated_at: "2022-01-01 00:00:00",
            };

            // Act
            const result = fromDatabaseBeat(databaseBeat, 0);

            // Assert
            expect(result.includeInMeasure).toBe(false);
        });

        it("should handle null notes", () => {
            // Arrange
            const databaseBeat: DatabaseBeat = {
                id: 3,
                position: 30,
                duration: 3.0,
                include_in_measure: 1,
                notes: null,
                created_at: "2022-01-01 00:00:00",
                updated_at: "2022-01-01 00:00:00",
            };

            // Act
            const result = fromDatabaseBeat(databaseBeat, 0);

            // Assert
            expect(result.notes).toBeNull();
        });
    });

    describe("durationToBeats", () => {
        // Create a mock array of beats for testing
        const mockBeats: Beat[] = [
            {
                id: 1,
                position: 1,
                duration: 2,
                includeInMeasure: true,
                notes: null,
                i: 0,
            },
            {
                id: 2,
                position: 2,
                duration: 3,
                includeInMeasure: true,
                notes: null,
                i: 1,
            },
            {
                id: 3,
                position: 3,
                duration: 1,
                includeInMeasure: true,
                notes: null,
                i: 2,
            },
            {
                id: 4,
                position: 4,
                duration: 4,
                includeInMeasure: true,
                notes: null,
                i: 3,
            },
            {
                id: 5,
                position: 5,
                duration: 2,
                includeInMeasure: true,
                notes: null,
                i: 4,
            },
        ];

        it("should return beats that cumulatively match or exceed the given duration", () => {
            const startBeat = mockBeats[1]; // Beat with i=1
            const result = durationToBeats({
                newDuration: 4,
                allBeats: mockBeats,
                startBeat,
            });

            // Should include beats at index 1 and 2 (durations 3 + 1 = 4)
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(2);
            expect(result[1].id).toBe(3);
        });

        it("should return beats that exceed the given duration if exact match is not possible", () => {
            const startBeat = mockBeats[0]; // Beat with i=0
            const result = durationToBeats({
                newDuration: 4.5,
                allBeats: mockBeats,
                startBeat,
            });

            // Should include beats at index 0 and 1 (durations 2 + 3 = 5 > 4.5)
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(1);
            expect(result[1].id).toBe(2);
        });

        it("should handle a duration of 0", () => {
            const startBeat = mockBeats[2]; // Beat with i=2
            const result = durationToBeats({
                newDuration: 0,
                allBeats: mockBeats,
                startBeat,
            });

            // Should include at least the start beat itself
            expect(result).toHaveLength(0);
        });

        it("should handle a duration larger than all available beats", () => {
            const startBeat = mockBeats[0]; // Beat with i=0
            const result = durationToBeats({
                newDuration: 20,
                allBeats: mockBeats,
                startBeat,
            });

            // Should include all beats from the start beat to the end
            expect(result).toHaveLength(5);
            expect(result[0].id).toBe(1);
            expect(result[4].id).toBe(5);
        });

        it("should handle starting from the last beat", () => {
            const startBeat = mockBeats[4]; // Beat with i=4 (last beat)
            const result = durationToBeats({
                newDuration: 3,
                allBeats: mockBeats,
                startBeat,
            });

            // Should include only the last beat
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(5);
        });

        it("should handle an empty beats array", () => {
            const emptyBeats: Beat[] = [];
            const mockStartBeat: Beat = {
                id: 1,
                position: 1,
                duration: 2,
                includeInMeasure: true,
                notes: null,
                i: 0,
            };

            const result = durationToBeats({
                newDuration: 5,
                allBeats: emptyBeats,
                startBeat: mockStartBeat,
            });

            // Should return an empty array
            expect(result).toHaveLength(0);
        });
    });
});
