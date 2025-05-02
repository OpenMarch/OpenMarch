import { describe, it, expect, vi } from "vitest";
import {
    convertDatabaseBeatsToBeats,
    createNewTemporaryBeats,
    findClosestUnusedBeatByTimestamp,
    getUpdatedBeatObjects,
    performDatabaseOperations,
    prepareBeatsForCreation,
    prepareMeasuresForCreation,
    preparePageUpdates,
} from "../EditableAudioPlayerUtils";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import Page from "@/global/classes/Page";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { DatabaseBeat } from "electron/database/tables/BeatTable";

describe("createNewTemporaryBeats", () => {
    // Test case 1: Empty beats array
    it("should return empty beats array when existingTemporaryBeats is empty", () => {
        const currentTime = 10;
        const totalDuration = 60;
        const existingTemporaryBeats: Beat[] = [];
        const numBeats = 2;

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

        const lastBeat = result[result.length - 1];

        expect(lastBeat.id).toBeLessThan(0); // Negative ID to indicate temporary
        expect(lastBeat.position).toBe(existingTemporaryBeats.length);
        expect(lastBeat.includeInMeasure).toBe(true);
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

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats,
            numNewBeats: numBeats,
        });

        expect(result).toHaveLength(3);
        expect(result[0].duration).toBe(5);
        expect(result[1].duration).toBe(5);
        expect(result[2].duration).toBe(45);
    });
});

describe("getUpdatedBeatObjects", () => {
    // Mock console.error to prevent test output pollution
    console.error = vi.fn();

    it("should correctly update beats based on closest matches", () => {
        const oldBeats: Beat[] = [
            {
                id: 1,
                timestamp: 1.0,
                duration: 1.0,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 2,
                timestamp: 2.0,
                duration: 1.0,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
            {
                id: 3,
                timestamp: 3.0,
                duration: 1.0,
                position: 2,
                includeInMeasure: true,
                notes: null,
                index: 2,
            },
        ];

        const newBeats: Beat[] = [
            {
                id: 4,
                timestamp: 1.1,
                duration: 1.5,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 5,
                timestamp: 2.2,
                duration: 1.2,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
            {
                id: 6,
                timestamp: 3.3,
                duration: 0.8,
                position: 2,
                includeInMeasure: true,
                notes: null,
                index: 2,
            },
        ];

        const beatIdsWithPages = new Set([1, 2]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([
            { id: 1, duration: 1.5 },
            { id: 2, duration: 1.2 },
        ]);
        expect(result.newBeatIdsUsed).toEqual(new Set([4, 5]));
    });

    it("should return empty array when oldBeats is empty", () => {
        const oldBeats: Beat[] = [];
        const newBeats: Beat[] = [
            {
                id: 4,
                timestamp: 1.1,
                duration: 1.5,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
        ];
        const beatIdsWithPages = new Set([1]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([]);
        expect(result.newBeatIdsUsed).toEqual(new Set());
        expect(console.error).toHaveBeenCalled();
    });

    it("should return empty array when newBeats is empty", () => {
        const oldBeats: Beat[] = [
            {
                id: 1,
                timestamp: 1.0,
                duration: 1.0,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
        ];
        const newBeats: Beat[] = [];
        const beatIdsWithPages = new Set([1]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([]);
        expect(result.newBeatIdsUsed).toEqual(new Set());
        expect(console.error).toHaveBeenCalled();
    });

    it("should return empty array when no matching beats are found", () => {
        const oldBeats: Beat[] = [
            {
                id: 1,
                timestamp: 1.0,
                duration: 1.0,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 2,
                timestamp: 2.0,
                duration: 1.0,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
        ];
        const newBeats: Beat[] = [
            {
                id: 3,
                timestamp: 10.0,
                duration: 1.5,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
        ];
        const beatIdsWithPages = new Set([1, 2]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([]);
        expect(result.newBeatIdsUsed).toEqual(new Set());
        expect(console.error).toHaveBeenCalled();
    });

    it("should handle case where all new beats are already used", () => {
        const oldBeats: Beat[] = [
            {
                id: 1,
                timestamp: 1.0,
                duration: 1.0,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 2,
                timestamp: 2.0,
                duration: 1.0,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
        ];
        const newBeats: Beat[] = [
            {
                id: 3,
                timestamp: 1.1,
                duration: 1.5,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
        ];
        const beatIdsWithPages = new Set([1, 2]);

        // First beat will use the only available new beat
        // Second beat will have no available beats
        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([]);
        expect(result.newBeatIdsUsed).toEqual(new Set());
        expect(console.error).toHaveBeenCalled();
    });

    it("should match beats based on closest timestamp", () => {
        const oldBeats: Beat[] = [
            {
                id: 1,
                timestamp: 1.0,
                duration: 1.0,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 2,
                timestamp: 5.0,
                duration: 1.0,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
        ];
        const newBeats: Beat[] = [
            {
                id: 3,
                timestamp: 1.2,
                duration: 1.5,
                position: 0,
                includeInMeasure: true,
                notes: null,
                index: 0,
            },
            {
                id: 4,
                timestamp: 2.0,
                duration: 1.2,
                position: 1,
                includeInMeasure: true,
                notes: null,
                index: 1,
            },
            {
                id: 5,
                timestamp: 4.8,
                duration: 0.8,
                position: 2,
                includeInMeasure: true,
                notes: null,
                index: 2,
            },
        ];
        const beatIdsWithPages = new Set([1, 2]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate).toEqual([
            { id: 1, duration: 1.5 }, // Closest to timestamp 1.2
            { id: 2, duration: 0.8 }, // Closest to timestamp 4.8
        ]);
        expect(result.newBeatIdsUsed).toEqual(new Set([3, 5]));
    });
});

// Mock Beat objects for testing
const createMockBeat = (
    id: number,
    position: number,
    duration: number,
    timestamp: number,
): Beat => ({
    id,
    position,
    duration,
    includeInMeasure: true,
    notes: null,
    index: position,
    timestamp,
});

describe("createNewTemporaryBeats", () => {
    it("should return empty array when no existing beats", () => {
        const result = createNewTemporaryBeats({
            currentTime: 10,
            totalDuration: 60,
            existingTemporaryBeats: [],
            numNewBeats: 4,
        });
        expect(result).toEqual([]);
    });

    it("should return empty array when numNewBeats is less than or equal to 0", () => {
        const existingBeats = [createMockBeat(1, 0, 2, 0)];
        const result = createNewTemporaryBeats({
            currentTime: 10,
            totalDuration: 60,
            existingTemporaryBeats: existingBeats,
            numNewBeats: 0,
        });
        expect(result).toEqual([]);
    });

    it("should return empty array when duration per beat is too small", () => {
        const existingBeats = [createMockBeat(1, 0, 2, 9.95)];
        const result = createNewTemporaryBeats({
            currentTime: 10,
            totalDuration: 60,
            existingTemporaryBeats: existingBeats,
            numNewBeats: 4,
        });
        expect(result).toEqual([]);
    });

    it("should create correct number of beats with proper durations", () => {
        const existingBeats = [createMockBeat(1, 0, 2, 0)];
        const currentTime = 10;
        const totalDuration = 60;
        const numNewBeats = 4;

        const result = createNewTemporaryBeats({
            currentTime,
            totalDuration,
            existingTemporaryBeats: existingBeats,
            numNewBeats,
        });

        // Should create numNewBeats + 1 beats (including the final beat)
        expect(result.length).toBe(numNewBeats + 1);

        // Check the durations and timestamps
        const durationPerBeat =
            (currentTime - existingBeats[0].timestamp) / numNewBeats;

        for (let i = 0; i < numNewBeats; i++) {
            expect(result[i].duration).toBeCloseTo(durationPerBeat);
            expect(result[i].timestamp).toBeCloseTo(durationPerBeat * i);
        }

        // Check the final beat
        const lastBeat = result[result.length - 1];
        expect(lastBeat.timestamp).toBe(currentTime);
        expect(lastBeat.duration).toBe(totalDuration - currentTime);
        expect(lastBeat.id).toBeLessThan(0); // Temporary beats have negative IDs
    });
});

describe("findClosestUnusedBeatByTimestamp", () => {
    it("should return null when beats array is empty", () => {
        const result = findClosestUnusedBeatByTimestamp(
            10,
            [],
            new Set<number>(),
        );
        expect(result).toBeNull();
    });

    it("should return null when all beats are used", () => {
        const beats = [createMockBeat(1, 0, 2, 0), createMockBeat(2, 1, 2, 2)];
        const usedBeatIds = new Set<number>([1, 2]);

        const result = findClosestUnusedBeatByTimestamp(1, beats, usedBeatIds);
        expect(result).toBeNull();
    });

    it("should find the closest unused beat by timestamp", () => {
        const beats = [
            createMockBeat(1, 0, 2, 0),
            createMockBeat(2, 1, 2, 5),
            createMockBeat(3, 2, 2, 10),
            createMockBeat(4, 3, 2, 15),
        ];
        const usedBeatIds = new Set<number>([1]);

        // Closest to timestamp 7 should be beat with id 2 (timestamp 5)
        const result = findClosestUnusedBeatByTimestamp(7, beats, usedBeatIds);
        expect(result).not.toBeNull();
        expect(result?.id).toBe(2);

        // Closest to timestamp 12 should be beat with id 3 (timestamp 10)
        const result2 = findClosestUnusedBeatByTimestamp(
            12,
            beats,
            usedBeatIds,
        );
        expect(result2).not.toBeNull();
        expect(result2?.id).toBe(3);
    });
});

describe("getUpdatedBeatObjects", () => {
    it("should return empty array when no matching beats are found", () => {
        const oldBeats = [createMockBeat(1, 0, 2, 0)];
        const newBeats: Beat[] = [];
        const beatIdsWithPages = new Set<number>([1]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );
        expect(result).toEqual({
            beatsToUpdate: [],
            newBeatIdsUsed: new Set<number>(),
        });
    });

    it("should match old beats with closest new beats and return modified beat args", () => {
        const oldBeats = [
            createMockBeat(1, 0, 2, 0),
            createMockBeat(2, 1, 2, 2),
            createMockBeat(3, 2, 2, 4),
        ];

        const newBeats = [
            createMockBeat(101, 0, 3, 0),
            createMockBeat(102, 1, 3, 3),
            createMockBeat(103, 2, 3, 6),
        ];

        const beatIdsWithPages = new Set<number>([1, 2]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        expect(result.beatsToUpdate.length).toBe(2);
        expect(result.beatsToUpdate).toContainEqual({
            id: 1,
            duration: 3,
        });
        expect(result.beatsToUpdate).toContainEqual({
            id: 2,
            duration: 3,
        });
        expect(result.newBeatIdsUsed.size).toBe(2);
        expect(result.newBeatIdsUsed).toContain(101);
        expect(result.newBeatIdsUsed).toContain(102);
    });

    it("should return empty array if any beat with page cannot find a match", () => {
        const oldBeats = [
            createMockBeat(1, 0, 2, 0),
            createMockBeat(2, 1, 2, 2),
        ];

        const newBeats = [createMockBeat(101, 0, 3, 0)];

        // We have two beats with pages but only one new beat
        const beatIdsWithPages = new Set<number>([1, 2]);

        const result = getUpdatedBeatObjects(
            oldBeats,
            newBeats,
            beatIdsWithPages,
        );

        // Should return empty array since we can't match all beats with pages
        expect(result).toEqual({
            beatsToUpdate: [],
            newBeatIdsUsed: new Set<number>(),
        });
    });
});

// Mock the necessary functions
vi.mock("@/global/classes/Page", () => ({
    updatePages: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/global/classes/Measure", () => ({
    createMeasures: vi.fn().mockResolvedValue({ success: true }),
    deleteMeasures: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/global/classes/Beat", async () => {
    const actual = await vi.importActual("@/global/classes/Beat");
    return {
        ...actual,
        deleteBeats: vi.fn().mockResolvedValue({ success: true }),
        createBeats: vi.fn().mockResolvedValue({ success: true }),
    };
});

vi.mock("@/utilities/ApiFunctions", () => ({
    GroupFunction: vi
        .fn()
        .mockImplementation(({ functionsToExecute, refreshFunction }) => {
            functionsToExecute.forEach((fn: () => void) => fn());
            if (refreshFunction) refreshFunction();
            return { success: true };
        }),
}));

// Helper function to create mock pages
const createMockPage = (
    id: number,
    timestamp: number,
    beats: Beat[],
): Page => ({
    id,
    timestamp,
    beats,
    name: `Page ${id}`,
    counts: beats.length,
    notes: null,
    order: id,
    nextPageId: id + 1,
    previousPageId: id > 1 ? id - 1 : null,
    isSubset: false,
    duration: beats.reduce((sum, beat) => sum + beat.duration, 0),
    measures: null,
    measureBeatToStartOn: null,
    measureBeatToEndOn: null,
});

describe("prepareBeatsForCreation", () => {
    it("should convert Beat objects to database format", () => {
        const beats: Beat[] = [
            createMockBeat(1, 0, 2.5, 0),
            createMockBeat(2, 1, 1.75, 2.5),
        ];

        const result = prepareBeatsForCreation(beats);

        expect(result).toEqual([
            { duration: 2.5, include_in_measure: 1 },
            { duration: 1.75, include_in_measure: 1 },
        ]);
    });

    it("should handle empty array", () => {
        const result = prepareBeatsForCreation([]);
        expect(result).toEqual([]);
    });
});

describe("convertDatabaseBeatsToBeats", () => {
    it("should convert database beats to Beat objects with calculated timestamps", () => {
        const databaseBeats: DatabaseBeat[] = [
            {
                id: 1,
                position: 1,
                duration: 2,
                include_in_measure: 1,
                notes: null,
            } as DatabaseBeat,
            {
                id: 2,
                position: 2,
                duration: 3,
                include_in_measure: 1,
                notes: null,
            } as DatabaseBeat,
            {
                id: 3,
                position: 3,
                duration: 1,
                include_in_measure: 0,
                notes: "test",
            } as DatabaseBeat,
        ];

        const result = convertDatabaseBeatsToBeats(databaseBeats);

        expect(result.length).toBe(3);
        expect(result[0].timestamp).toBe(0);
        expect(result[1].timestamp).toBe(2);
        expect(result[2].timestamp).toBe(5);
        expect(result[2].duration).toBe(1);
        expect(result[2].includeInMeasure).toBe(false);
        expect(result[2].notes).toBe("test");
    });

    it("should handle empty array", () => {
        const result = convertDatabaseBeatsToBeats([]);
        expect(result).toEqual([]);
    });
});

describe("preparePageUpdates", () => {
    it("should match pages with closest beats", () => {
        const beat1 = createMockBeat(10, 0, 1, 1);
        const beat2 = createMockBeat(11, 1, 1, 5);

        const pages: Page[] = [
            createMockPage(1, 1, [beat1]),
            createMockPage(2, 5, [beat2]),
        ];

        const oldBeats: Beat[] = [beat1, beat2];

        const createdBeats: Beat[] = [
            createMockBeat(20, 0, 1.5, 0.9),
            createMockBeat(21, 1, 1.5, 4.8),
            createMockBeat(22, 2, 1.5, 7),
        ];

        const { pagesToUpdate, usedBeatIds } = preparePageUpdates(
            pages,
            oldBeats,
            createdBeats,
        );

        expect(pagesToUpdate).toEqual([
            { id: 1, start_beat: 20 },
            { id: 2, start_beat: 21 },
        ]);
        expect(usedBeatIds).toEqual(new Set([20, 21]));
    });

    it("should throw error when beat not found in old beats", () => {
        const beat1 = createMockBeat(10, 0, 1, 1);
        const pages: Page[] = [createMockPage(1, 1, [beat1])];

        const oldBeats: Beat[] = [
            createMockBeat(11, 1, 1, 5), // Different ID than the one in page
        ];

        const createdBeats: Beat[] = [createMockBeat(20, 0, 1.5, 0.9)];

        expect(() => preparePageUpdates(pages, oldBeats, createdBeats)).toThrow(
            "Could not find beat with id 10 in old beats",
        );
    });

    it("should throw error when no unused beat found", () => {
        const beat1 = createMockBeat(10, 0, 1, 1);
        const beat2 = createMockBeat(11, 1, 1, 5);

        const pages: Page[] = [
            createMockPage(1, 1, [beat1]),
            createMockPage(2, 5, [beat2]),
        ];

        const oldBeats: Beat[] = [beat1, beat2];

        const createdBeats: Beat[] = [
            createMockBeat(20, 0, 1.5, 0.9), // Only one beat for two pages
        ];

        expect(() => preparePageUpdates(pages, oldBeats, createdBeats)).toThrow(
            "No unused beat found",
        );
    });

    it("should skip pages with no beats", () => {
        const beat1 = createMockBeat(11, 1, 1, 5);

        const pages: Page[] = [
            createMockPage(1, 1, []),
            createMockPage(2, 5, [beat1]),
        ];

        const oldBeats: Beat[] = [beat1];

        const createdBeats: Beat[] = [
            createMockBeat(20, 0, 1.5, 0.9),
            createMockBeat(21, 1, 1.5, 4.8),
        ];

        const { pagesToUpdate, usedBeatIds } = preparePageUpdates(
            pages,
            oldBeats,
            createdBeats,
        );

        expect(pagesToUpdate).toEqual([{ id: 2, start_beat: 21 }]);
        expect(usedBeatIds).toEqual(new Set([21]));
    });
});

describe("prepareMeasuresForCreation", () => {
    it("should throw error when beat not found in new beats", () => {
        const newMeasures: Measure[] = [
            { startBeat: createMockBeat(-5, 0, 1, 1) } as Measure, // ID not in newBeats
        ];

        const newBeats: Beat[] = [createMockBeat(-1, 0, 1, 1)];

        const createdBeats: Beat[] = [createMockBeat(101, 0, 1.5, 0.9)];

        expect(() =>
            prepareMeasuresForCreation(newMeasures, newBeats, createdBeats),
        ).toThrow();
    });

    it("should handle empty arrays", () => {
        const result = prepareMeasuresForCreation([], [], []);
        expect(result).toEqual([]);
    });
});

describe("performDatabaseOperations", () => {
    it("should call all database functions with correct parameters", async () => {
        const pagesToUpdate = [{ id: 1, start_beat: 101 }];
        const measuresToCreate = [{ start_beat: 101 }];
        const oldMeasures = [{ id: 1 } as Measure];
        const oldBeats = [createMockBeat(1, 0, 1, 1)];
        const refreshFunction = vi.fn();

        const result = await performDatabaseOperations(
            pagesToUpdate,
            measuresToCreate,
            oldMeasures,
            oldBeats,
            refreshFunction,
        );

        expect(result.success).toBe(true);
        expect(refreshFunction).toHaveBeenCalled();
        expect(GroupFunction).toHaveBeenCalledWith({
            functionsToExecute: expect.any(Array),
            useNextUndoGroup: false,
            refreshFunction,
        });
    });
});
