import { describe, it, expect } from "vitest";
import { createNewTemporaryBeat } from "../EditableAudioPlayer";
import Beat from "@/global/classes/Beat";

describe("createNewTemporaryBeat", () => {
    // Test case 1: Empty beats array
    it("should return empty beats array when existingTemporaryBeats is empty", () => {
        const currentTime = 10;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [];
        const numBeats = 2;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(result).toEqual([]);
    });

    // Test case 2: Invalid numBeats parameter
    it("should return empty beats array when numBeats is less than or equal to 0", () => {
        const currentTime = 10;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 0,
            },
        ];
        const numBeats = 0;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(result).toEqual([]);
    });

    // Test case 3: Creating a single beat (numBeats = 1)
    it("should create a single new beat when numBeats is 1", () => {
        const currentTime = 10;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 5,
            },
        ];
        const numBeats = 1;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(result.length).toBe(2);
        expect(result[0]).toEqual(existingTemporaryBeats[0]);
        expect(result[1].timestamp).toBe(currentTime);
        expect(result[1].duration).toBe(50);
        expect(result[1].position).toBe(1);
        expect(result[1].index).toBe(1);
    });

    // Test case 4: Creating multiple beats (numBeats > 1)
    it("should create multiple beats when numBeats is greater than 1", () => {
        const currentTime = 15;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 5,
            },
        ];
        const numBeats = 3;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(result.length).toBe(4); // Original beat + 3 new beats
        expect(result[1].duration).toBe(10 / 3);
        expect(result[2].duration).toBe(10 / 3);
        expect(result[3].duration).toBe(45);
    });

    // Test case 5: Verifying correct timestamp calculations
    it("should calculate timestamps correctly for intermediate beats", () => {
        const currentTime = 20;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 10,
            },
        ];
        const numBeats = 2;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        // First beat is the original beat
        expect(result[0].timestamp).toBe(10);

        // Second beat should be halfway between 10 and 20
        expect(result[1].timestamp).toBe(15);

        // Last beat should be at currentTime
        expect(result[2].timestamp).toBe(20);
    });

    // Test case 6: Verifying correct duration calculations
    it("should calculate durations correctly for all beats", () => {
        const currentTime = 20;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 10,
            },
        ];
        const numBeats = 2;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        // Intermediate beat should have duration of (20-10)/2 = 5
        expect(result[1].duration).toBe(5);

        // Last beat should have duration of (60-20) = 40
        expect(result[2].duration).toBe(40);
    });

    // Test case 7: Verifying the structure of the returned object
    it("should return an array of beats", () => {
        const currentTime = 15;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 5,
            },
        ];
        const numBeats = 2;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(Array.isArray(result)).toBe(true);
    });

    // Test case 8: Verify the last beat has the correct properties
    it("should create the last beat with correct properties", () => {
        const currentTime = 15;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 5,
            },
        ];
        const numBeats = 2;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        const lastBeat = result[result.length - 1];

        expect(lastBeat.id).toBeLessThan(0); // Negative ID to indicate temporary
        expect(lastBeat.position).toBe(existingTemporaryBeats.length);
        expect(lastBeat.includeInMeasure).toBe(false);
        expect(lastBeat.notes).toBeNull();
        expect(lastBeat.index).toBe(existingTemporaryBeats.length);
        expect(lastBeat.timestamp).toBe(currentTime);
        expect(lastBeat.duration).toBe(totalDuration - currentTime);
    });

    // Test case 9: Verify adding beats to the end without affecting earlier beats
    it("should add beats to the end without affecting earlier beats", () => {
        const currentTime = 15;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [
            {
                id: 1,
                position: 0,
                duration: 5,
                includeInMeasure: true,
                notes: null,
                index: 0,
                timestamp: 5,
            },
            {
                id: 2,
                position: 1,
                duration: 50,
                includeInMeasure: true,
                notes: null,
                index: 1,
                timestamp: 10,
            },
        ];
        const numBeats = 1;

        const result = createNewTemporaryBeat(
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numBeats,
        );

        expect(result).toHaveLength(3);
        expect(result[0].duration).toBe(5);
        expect(result[1].duration).toBe(5);
        expect(result[2].duration).toBe(45);
    });
});
