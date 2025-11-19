import Page, {
    fromDatabasePages,
    generatePageNames,
    yankOrPushPagesAfterIndex,
} from "../Page";
import Measure from "../Measure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Beat from "../Beat";
import { conToastError } from "@/utilities/utils";
import { DatabasePage, FIRST_BEAT_ID, FIRST_PAGE_ID } from "@/db-functions";

describe("Page", () => {
    describe("generatePageNames", () => {
        it('should generate a list with just "0" when input is empty', () => {
            const result = generatePageNames([]);
            expect(result).toEqual(["0"]);
        });

        it('should generate a list with just "0" when input is empty with offset', () => {
            const result = generatePageNames([], 5);
            expect(result).toEqual(["0"]);
        });

        it("should generate sequential page numbers for non-subset pages", () => {
            const result = generatePageNames([false, false, false, false]);
            expect(result).toEqual(["0", "1", "2", "3"]);
        });

        it("should generate sequential page numbers with offset", () => {
            const result = generatePageNames([false, false, false, false], 10);
            expect(result).toEqual(["0", "11", "12", "13"]);
        });

        it("should generate alphabetical subsets when encountering true values", () => {
            const result = generatePageNames([false, true, true, false]);
            expect(result).toEqual(["0", "0A", "0B", "1"]);
        });

        it("should generate alphabetical subsets with offset", () => {
            const result = generatePageNames([false, true, true, false], 5);
            expect(result).toEqual(["0", "5A", "5B", "6"]);
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

        it("should handle example case from documentation with offset", () => {
            const result = generatePageNames(
                [false, false, true, false, true, true, false],
                3,
            );
            expect(result).toEqual(["0", "4", "4A", "5", "5A", "5B", "6"]);
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

        it("should handle case where first page is subset with offset", () => {
            const result = generatePageNames(
                [true, true, true, false, true, true, false],
                7,
            );
            // First page always starts with "0", then offset applies
            expect(result).toEqual(["0", "7A", "7B", "8", "8A", "8B", "9"]);
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

        it("should handle multiple consecutive subset sequences with offset", () => {
            const result = generatePageNames(
                [
                    false, // 0
                    true, // 15A
                    true, // 15B
                    false, // 16
                    false, // 17
                    true, // 17A
                    true, // 17B
                    true, // 17C
                    false, // 18
                ],
                15,
            );
            expect(result).toEqual([
                "0",
                "15A",
                "15B",
                "16",
                "17",
                "17A",
                "17B",
                "17C",
                "18",
            ]);
        });

        it('should ignore the first boolean and always start with "0"', () => {
            // Test documentation note: "the first page will always evaluate to false no matter what is provided"
            const result = generatePageNames([true, false, false]);
            expect(result).toEqual(["0", "1", "2"]);
        });

        it('should ignore the first boolean and always start with "0" even with offset', () => {
            const result = generatePageNames([true, false, false], 20);
            expect(result).toEqual(["0", "21", "22"]);
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

        it("should handle many consecutive subsets with correct lettering and offset", () => {
            const isSubsetArr = [
                false, // 0
                true, // 12A
                true, // 12B
                true, // 12C
                true, // 12D
                true, // 12E
                true, // 12F
                true, // 12G
            ];
            const result = generatePageNames(isSubsetArr, 12);
            expect(result).toEqual([
                "0",
                "12A",
                "12B",
                "12C",
                "12D",
                "12E",
                "12F",
                "12G",
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

        it("should handle alphabetical rollover from Z to AA with offset", () => {
            const isSubsetArr = [false, ...Array(27).fill(true)];
            const result = generatePageNames(isSubsetArr, 8);

            expect(result.length).toBe(28);
            expect(result[0]).toBe("0");
            expect(result[26]).toBe("8Z");
            expect(result[27]).toBe("8AA");
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

        it("should handle mixed sequences of pages and subsets with offset", () => {
            const result = generatePageNames(
                [
                    false, // 0
                    false, // 101
                    true, // 101A
                    false, // 102
                    true, // 102A
                    false, // 103
                    false, // 104
                    true, // 104A
                    true, // 104B
                    true, // 104C
                ],
                100,
            );
            expect(result).toEqual([
                "0",
                "101",
                "101A",
                "102",
                "102A",
                "103",
                "104",
                "104A",
                "104B",
                "104C",
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

        it("should handle subset letters wrapping from Z to AA with offset", () => {
            const isSubsetArr = Array(56).fill(true);
            isSubsetArr.push(false);
            isSubsetArr[0] = false;

            const result = generatePageNames(isSubsetArr, 25);

            expect(result[26]).toBe("25Z");
            expect(result[27]).toBe("25AA");
            expect(result[53]).toBe("25BA");
            expect(result[54]).toBe("25BB");
            expect(result[56]).toBe("26");
        });

        it("should handle negative offset", () => {
            const result = generatePageNames([false, false, true, false], -5);
            expect(result).toEqual(["0", "-4", "-4A", "-3"]);
        });

        it("should handle zero offset explicitly", () => {
            const result = generatePageNames([false, false, true, false], 0);
            expect(result).toEqual(["0", "1", "1A", "2"]);
        });
    });

    describe("fromDatabasePages", () => {
        it("should return an empty array when no database pages are provided", () => {
            const result = fromDatabasePages({
                databasePages: [],
                allMeasures: [],
                allBeats: [],
                lastPageCounts: 8,
            });

            expect(result).toEqual([]);
        });

        it("should convert database pages to Page objects with correct properties when there is only the first page", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: FIRST_BEAT_ID,
                    position: 0,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 1000,
                } satisfies Beat,
                {
                    id: 2,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 2000,
                } satisfies Beat,
                {
                    id: 3,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 3000,
                } satisfies Beat,
                {
                    id: 4,
                    position: 4,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 4000,
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
                    id: FIRST_PAGE_ID,
                    start_beat: FIRST_BEAT_ID,
                    is_subset: false,
                    notes: "First page",
                },
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: false,
                    notes: "Second page",
                },
            ];

            const result = fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
                lastPageCounts: 6,
            });

            // Assertions
            expect(result).toHaveLength(2);

            // First page
            expect(result[0].id).toBe(FIRST_BEAT_ID);
            expect(result[0].name).toBe("0");
            expect(result[0].counts).toBe(0);
            expect(result[0].notes).toBe("First page");
            expect(result[0].order).toBe(0);
            expect(result[0].isSubset).toBe(false);
            expect(result[0].duration).toBe(0);
            expect(result[0].beats).toHaveLength(1);
            expect(result[0].measures).toBeNull();
            expect(result[0].previousPageId).toBeNull();
            expect(result[0].nextPageId).toBe(1);

            // Second page
            expect(result[1].id).toBe(1);
            expect(result[1].name).toBe("1");
            expect(result[1].counts).toBe(4);
            expect(result[1].notes).toBe("Second page");
            expect(result[1].order).toBe(1);
            expect(result[1].isSubset).toBe(false);
            expect(result[1].duration).toBe(4000);
            expect(result[1].beats).toHaveLength(4);
            expect(result[1].measures).toHaveLength(2);
            expect(result[1].previousPageId).toBe(0);
            expect(result[1].nextPageId).toBeNull();
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
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 2,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 1000,
                } satisfies Beat,
                {
                    id: 3,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 2000,
                } satisfies Beat,
                {
                    id: 4,
                    position: 4,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 3000,
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
                lastPageCounts: 6,
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
        it("should convert database pages to Page objects with correct with less counts in the last page", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 0,
                    position: 0,
                    duration: 0,
                    includeInMeasure: true,
                    notes: null,
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 2,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 100,
                } satisfies Beat,
                {
                    id: 3,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 2000,
                } satisfies Beat,
                {
                    id: 4,
                    position: 4,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 4,
                    timestamp: 3000,
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
                lastPageCounts: 1,
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
            expect(result[1].counts).toBe(1);
            expect(result[1].notes).toBe("Second page");
            expect(result[1].order).toBe(1);
            expect(result[1].isSubset).toBe(false);
            expect(result[1].duration).toBe(1000);
            expect(result[1].beats).toHaveLength(1);
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
                    index: 0,
                    timestamp: 0,
                } satisfies Beat,
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 1,
                    timestamp: 1000,
                } satisfies Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 2,
                    timestamp: 2000,
                } satisfies Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                    index: 3,
                    timestamp: 3000,
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
                    timestamp: 0,
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
                lastPageCounts: 1,
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
                lastPageCounts: 12963981273,
            });

            // Assertions
            expect(result[0].measures).toHaveLength(2);
            expect(result[0].measures![0].id).toBe(1);
            expect(result[0].measures![1].id).toBe(2);
            expect(result[0].duration).toBe(4000); // Sum of all beat durations
        });
    });

    // Mock the console.error to avoid polluting test output
    vi.spyOn(console, "error").mockImplementation(() => {});

    describe("yankOrPushPagesAfterIndex", () => {
        // Mock the conToastError function
        vi.mock("@/utilities/utils", () => ({
            conToastError: vi.fn(),
        }));

        // Helper function to create test data
        const createTestData = (
            numPages: number = 3,
            beatsPerPage: number = 4,
        ) => {
            const beats = Array.from(
                { length: numPages * beatsPerPage },
                (_, i) =>
                    ({
                        id: i + 1,
                        index: i,
                        position: i,
                        duration: 1,
                        includeInMeasure: true,
                        notes: null,
                        timestamp: i,
                    }) as Beat,
            );

            const pages = Array.from(
                { length: numPages },
                (_, i) =>
                    ({
                        id: i + 1,
                        counts: beatsPerPage,
                        beats: beats.slice(
                            i * beatsPerPage,
                            (i + 1) * beatsPerPage,
                        ),
                    }) as Pick<Page, "id" | "beats" | "counts">,
            );

            return { pages, beats };
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("should successfully push pages forward", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: 2,
            });

            expect(result).toBeDefined();
            expect(result!).toEqual([
                {
                    id: 2,
                    start_beat: beats[6].id, // Original start (4) + offset (2)
                },
                {
                    id: 3,
                    start_beat: beats[10].id, // Original start (8) + offset (2)
                },
            ]);
        });

        it("should successfully yank pages backward", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: -2,
            });

            expect(result).toBeDefined();
            expect(result!).toEqual([
                {
                    id: 2,
                    start_beat: beats[2].id, // Original start (4) - offset (2)
                },
                {
                    id: 3,
                    start_beat: beats[6].id, // Original start (8) - offset (2)
                },
            ]);
        });

        it("should throw error for invalid index", () => {
            const { pages, beats } = createTestData();

            expect(() =>
                yankOrPushPagesAfterIndex({
                    allPages: pages,
                    allBeats: beats,
                    index: -1,
                    offset: 1,
                }),
            ).toThrow("Index out of bounds");

            expect(() =>
                yankOrPushPagesAfterIndex({
                    allPages: pages,
                    allBeats: beats,
                    index: 3,
                    offset: 1,
                }),
            ).toThrow("Index out of bounds");
        });

        it("should prevent yanking that results in negative counts", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: -5,
            });

            expect(result).toBeUndefined();
            expect(conToastError).toHaveBeenCalledWith(
                "Cannot yank pages that would result in negative counts",
            );
        });

        it("should prevent pushing beyond available beats", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: 10,
            });

            expect(result).toBeUndefined();
            expect(conToastError).toHaveBeenCalled();
        });

        it("should handle pages with no beats", () => {
            const { pages: originalPages, beats } = createTestData();
            const pages = [...originalPages];
            pages[1] = { ...pages[1], beats: [] };

            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: 1,
            });

            expect(result).toBeUndefined();
            expect(conToastError).toHaveBeenCalledWith(
                "Cannot yank pages that have no beats",
                pages[1],
            );
        });

        it("should handle single page modification", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 1,
                offset: 1,
            });

            expect(result).toBeDefined();
            expect(result!).toEqual([
                {
                    id: 3,
                    start_beat: beats[9].id, // Original start (8) + offset (1)
                },
            ]);
        });

        it("should handle modification of all pages", () => {
            const { pages, beats } = createTestData();
            const result = yankOrPushPagesAfterIndex({
                allPages: pages,
                allBeats: beats,
                index: 0,
                offset: 1,
            });

            expect(result).toBeDefined();
            expect(result!).toEqual([
                { id: 2, start_beat: beats[5].id }, // Original start (4) + offset (1)
                { id: 3, start_beat: beats[9].id }, // Original start (8) + offset (1)
            ]);
        });
    });
});
