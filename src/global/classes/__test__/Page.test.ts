import { fromDatabasePages, generatePageNames } from "../Page";
import Measure from "../Measure";
import { describe, expect, it } from "vitest";
import Beat from "../Beat";
import { DatabasePage } from "electron/database/tables/PageTable";

describe("Page", () => {
    describe("generatePageNames", () => {
        it('should generate a list with just "0" when input is empty', () => {
            const result = generatePageNames([]);
            expect(result).toEqual(["0"]);
        });

        it("should generate sequential page numbers for non-subset pages", () => {
            const result = generatePageNames([false, false, false, false]);
            expect(result).toEqual(["0", "1", "2", "3"]);
        });

        it("should generate alphabetical subsets when encountering true values", () => {
            const result = generatePageNames([false, true, true, false]);
            expect(result).toEqual(["0", "0A", "0B", "1"]);
        });

        it("should handle example case from documentation", () => {
            const result = generatePageNames([
                false,
                false,
                true,
                false,
                true,
                true,
                false,
            ]);
            expect(result).toEqual(["0", "1", "1A", "2", "2A", "2B", "3"]);
        });

        it("should handle case where first page is subset", () => {
            const result = generatePageNames([
                true,
                true,
                true,
                false,
                true,
                true,
                false,
            ]);
            // First page always evaluate to false
            expect(result).toEqual(["0", "0A", "0B", "1", "1A", "1B", "2"]);
        });

        it("should handle multiple consecutive subset sequences", () => {
            const result = generatePageNames([
                false, // 0
                true, // 0A
                true, // 0B
                false, // 1
                false, // 2
                true, // 2A
                true, // 2B
                true, // 2C
                false, // 3
            ]);
            expect(result).toEqual([
                "0",
                "0A",
                "0B",
                "1",
                "2",
                "2A",
                "2B",
                "2C",
                "3",
            ]);
        });

        it('should ignore the first boolean and always start with "0"', () => {
            // Test documentation note: "the first page will always evaluate to false no matter what is provided"
            const result = generatePageNames([true, false, false]);
            expect(result).toEqual(["0", "1", "2"]);
        });

        it("should handle many consecutive subsets with correct lettering", () => {
            const isSubsetArr = [
                false, // 0
                true, // 0A
                true, // 0B
                true, // 0C
                true, // 0D
                true, // 0E
                true, // 0F
                true, // 0G
            ];
            const result = generatePageNames(isSubsetArr);
            expect(result).toEqual([
                "0",
                "0A",
                "0B",
                "0C",
                "0D",
                "0E",
                "0F",
                "0G",
            ]);
        });

        it("should handle alphabetical rollover from Z to AA", () => {
            // Create an array with 27 true values to force rollover (A-Z then AA)
            const isSubsetArr = [false, ...Array(27).fill(true)];
            const result = generatePageNames(isSubsetArr);

            // Expected: ['0', '0A', '0B', ..., '0Z', '0AA']
            expect(result.length).toBe(28);
            expect(result[0]).toBe("0");
            expect(result[26]).toBe("0Z");
            expect(result[27]).toBe("0AA");
        });

        it("should handle mixed sequences of pages and subsets", () => {
            const result = generatePageNames([
                false, // 0
                false, // 1
                true, // 1A
                false, // 2
                true, // 2A
                false, // 3
                false, // 4
                true, // 4A
                true, // 4B
                true, // 4C
            ]);
            expect(result).toEqual([
                "0",
                "1",
                "1A",
                "2",
                "2A",
                "3",
                "4",
                "4A",
                "4B",
                "4C",
            ]);
        });

        it("should handle subset letters wrapping from Z to AA", () => {
            // Create array with many consecutive true values
            const isSubsetArr = Array(56).fill(true);
            isSubsetArr.push(false); // Add a non-subset page
            isSubsetArr[0] = false; // First page is non-subset

            const result = generatePageNames(isSubsetArr);

            // Check Z to AA transition
            expect(result[26]).toBe("0Z");
            expect(result[27]).toBe("0AA");
            expect(result[53]).toBe("0BA");
            expect(result[54]).toBe("0BB");
            expect(result[56]).toBe("1");
        });
    });

    describe("fromDatabasePages", () => {
        it("should return an empty array when no database pages are provided", () => {
            const result = fromDatabasePages({
                databasePages: [],
                allMeasures: [],
                allBeats: [],
            });

            expect(result).toEqual([]);
        });

        it("should convert database pages to Page objects with correct properties", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 0,
                    position: 0,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    i: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 1,
                } satisfies Beat,
                {
                    id: 2,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 2,
                } satisfies Beat,
                {
                    id: 3,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 3,
                } satisfies Beat,
                {
                    id: 4,
                    position: 4,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 4,
                } satisfies Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 1 } as Beat,
                    beats: [mockBeats[1], mockBeats[2]],
                } as Measure,
                {
                    id: 2,
                    number: 2,
                    startBeat: { id: 3, position: 3 } as Beat,
                    beats: [mockBeats[3], mockBeats[4]],
                } as Measure,
            ];

            const mockDatabasePages: DatabasePage[] = [
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: false,
                    notes: "First page",
                },
                {
                    id: 2,
                    start_beat: 3,
                    is_subset: false,
                    notes: "Second page",
                },
            ];

            const result = fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions
            expect(result).toHaveLength(2);

            // First page
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe("0");
            expect(result[0].counts).toBe(2);
            expect(result[0].notes).toBe("First page");
            expect(result[0].order).toBe(0);
            expect(result[0].isSubset).toBe(false);
            expect(result[0].duration).toBe(2000);
            expect(result[0].beats).toHaveLength(2);
            expect(result[0].measures).toHaveLength(1);
            expect(result[0].previousPageId).toBeNull();
            expect(result[0].nextPageId).toBe(2);

            // Second page
            expect(result[1].id).toBe(2);
            expect(result[1].name).toBe("1");
            expect(result[1].counts).toBe(2);
            expect(result[1].notes).toBe("Second page");
            expect(result[1].order).toBe(1);
            expect(result[1].isSubset).toBe(false);
            expect(result[1].duration).toBe(2000);
            expect(result[1].beats).toHaveLength(2);
            expect(result[1].measures).toHaveLength(1);
            expect(result[1].previousPageId).toBe(1);
            expect(result[1].nextPageId).toBeNull();
        });

        it("should handle subset pages correctly", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 0,
                    position: -1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    i: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 1,
                } satisfies Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 2,
                } satisfies Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    i: 3,
                } satisfies Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 0 } as Beat,
                    beats: [mockBeats[1], mockBeats[2], mockBeats[3]],
                    counts: 3,
                    notes: null,
                    rehearsalMark: null,
                    duration: 3000,
                } satisfies Measure,
            ];

            const mockDatabasePages: DatabasePage[] = [
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: false,
                    notes: "Main page",
                },
                { id: 2, start_beat: 3, is_subset: true, notes: "Subset page" },
            ];

            const result = fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions for page names
            expect(result[0].name).toBe("0");
            expect(result[0].counts).toBe(2);
            expect(result[0].measureBeatToStartOn).toBe(1);
            expect(result[0].measureBeatToEndOn).toBe(2);
            expect(result[0].measures).toEqual(mockMeasures);
            expect(result[0].beats).toEqual([mockBeats[1], mockBeats[2]]);
            expect(result[0].isSubset).toBe(false);

            expect(result[1].name).toBe("0A");
            expect(result[1].counts).toBe(1);
            expect(result[1].measureBeatToStartOn).toBe(3);
            expect(result[1].measureBeatToEndOn).toBe(3);
            expect(result[1].measures).toEqual(mockMeasures);
            expect(result[1].beats).toEqual([mockBeats[3]]);
            expect(result[1].isSubset).toBe(true);
        });

        it("should handle pages that span multiple measures", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 4,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 0,
                    position: -1,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 0 } as Beat,
                    beats: [mockBeats[0], mockBeats[1]],
                } as Measure,
                {
                    id: 2,
                    number: 2,
                    startBeat: { id: 3, position: 2 } as Beat,
                    beats: [mockBeats[2], mockBeats[3]],
                } as Measure,
            ];

            const mockDatabasePages: DatabasePage[] = [
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: false,
                    notes: "Page spanning measures",
                },
            ];

            const result = fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions
            expect(result[0].measures).toHaveLength(2);
            expect(result[0].measures[0].id).toBe(1);
            expect(result[0].measures[1].id).toBe(2);
            expect(result[0].duration).toBe(4000); // Sum of all beat durations
        });
    });
});
