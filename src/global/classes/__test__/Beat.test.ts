import { describe, expect, it } from "vitest";
import { compareBeats, beatsDuration, fromDatabaseBeat } from "../Beat";
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
});
