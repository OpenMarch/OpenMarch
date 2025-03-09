import { describe, expect, it } from "vitest";
import { compareBeats, beatsDuration } from "../Beat";
import type Beat from "../Beat";

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
            };
            const beatB: Beat = {
                id: 2,
                position: 20,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
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
            };
            const beatB: Beat = {
                id: 1,
                position: 10,
                duration: 1.0,
                includeInMeasure: true,
                notes: null,
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
            };
            const beatB: Beat = {
                id: 2,
                position: 10,
                duration: 2.0,
                includeInMeasure: false,
                notes: "Different beat, same position",
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
                },
                {
                    id: 2,
                    position: 20,
                    duration: 2.5,
                    includeInMeasure: true,
                    notes: null,
                },
                {
                    id: 3,
                    position: 30,
                    duration: 3.0,
                    includeInMeasure: false,
                    notes: null,
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
                },
                {
                    id: 2,
                    position: 20,
                    duration: -1.0, // Edge case: negative duration
                    includeInMeasure: true,
                    notes: null,
                },
            ];

            // Act
            const result = beatsDuration(beats);

            // Assert
            expect(result).toBe(1.0);
        });
    });
});
