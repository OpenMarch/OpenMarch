import { describe, expect, it } from "vitest";
import { createNewTemporaryBeat } from "../EditableAudioPlayer";
import type Beat from "@/global/classes/Beat";

describe("createNewTemporaryBeat", () => {
    it("should return empty array and false when no existing beats", () => {
        // Arrange
        const currentTime = 5.0;
        const totalDuration = 10.0;
        const existingTemporaryBeats: Beat[] = [];

        // Act
        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
        );

        // Assert
        expect(result.updatedBeats).toEqual([]);
        expect(result.shouldUpdateDisplay).toBe(false);
    });

    it("should create a new beat and update the previous beat's duration", () => {
        // Arrange
        const currentTime = 5.0;
        const totalDuration = 10.0;
        const existingTemporaryBeats: Beat[] = [
            {
                id: -1,
                position: 0,
                duration: 2.0, // This should be updated
                includeInMeasure: false,
                notes: null,
                index: 0,
                timestamp: 0,
            },
        ];

        // Act
        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
        );

        // Assert
        expect(result.updatedBeats.length).toBe(2);
        expect(result.shouldUpdateDisplay).toBe(true);

        // Check that the previous beat's duration was updated
        expect(result.updatedBeats[0].id).toBe(-1);
        expect(result.updatedBeats[0].duration).toBe(5.0); // currentTime - timestamp

        // Check that the new beat was created correctly
        expect(result.updatedBeats[1].position).toBe(1);
        expect(result.updatedBeats[1].duration).toBe(5.0); // totalDuration - currentTime
        expect(result.updatedBeats[1].timestamp).toBe(5.0);
        expect(result.updatedBeats[1].index).toBe(1);
        expect(result.updatedBeats[1].id).toBeLessThan(0); // Should be negative
    });

    it("should handle multiple existing beats correctly", () => {
        // Arrange
        const currentTime = 7.5;
        const totalDuration = 10.0;
        const existingTemporaryBeats: Beat[] = [
            {
                id: -1,
                position: 0,
                duration: 2.5,
                includeInMeasure: false,
                notes: null,
                index: 0,
                timestamp: 0,
            },
            {
                id: -2,
                position: 2.5,
                duration: 7.5, // This should be updated
                includeInMeasure: false,
                notes: null,
                index: 1,
                timestamp: 2.5,
            },
        ];

        // Act
        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
        );

        // Assert
        expect(result.updatedBeats.length).toBe(3);

        // First beat should remain unchanged
        expect(result.updatedBeats[0]).toEqual(existingTemporaryBeats[0]);

        // Second beat's duration should be updated
        expect(result.updatedBeats[1].id).toBe(-2);
        expect(result.updatedBeats[1].duration).toBe(5.0); // currentTime - timestamp

        // New beat should be added
        expect(result.updatedBeats[2].position).toBe(2);
        expect(result.updatedBeats[2].duration).toBe(2.5); // totalDuration - currentTime
        expect(result.updatedBeats[2].index).toBe(2);
    });

    it("should handle edge case when currentTime equals totalDuration", () => {
        // Arrange
        const currentTime = 10.0;
        const totalDuration = 10.0;
        const existingTemporaryBeats: Beat[] = [
            {
                id: -1,
                position: 0,
                duration: 10.0,
                includeInMeasure: false,
                notes: null,
                index: 0,
                timestamp: 0,
            },
        ];

        // Act
        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
        );

        // Assert
        expect(result.updatedBeats.length).toBe(2);

        // First beat's duration should be updated
        expect(result.updatedBeats[0].duration).toBe(10.0);

        // New beat should have zero duration
        expect(result.updatedBeats[1].duration).toBe(0);
    });
});
