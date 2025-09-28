import {
    DatabaseMarcherPage,
    databaseMarcherPagesToMarcherPages,
} from "../MarcherPage";
import { describe, expect, it } from "vitest";

// Mock pages data for testing beat order functionality
const mockPages = [
    {
        id: 1,
        order: 0,
        name: "1",
        counts: 8,
        notes: null,
        isSubset: false,
        duration: 8,
        beats: [],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 0,
        previousPageId: null,
        nextPageId: 2,
        start_beat: 1,
    },
    {
        id: 2,
        order: 1,
        name: "2",
        counts: 8,
        notes: null,
        isSubset: false,
        duration: 8,
        beats: [],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 8,
        previousPageId: 1,
        nextPageId: 3,
        start_beat: 9,
    },
    {
        id: 3,
        order: 2,
        name: "3",
        counts: 8,
        notes: null,
        isSubset: false,
        duration: 8,
        beats: [],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 16,
        previousPageId: 2,
        nextPageId: null,
        start_beat: 17,
    },
];

describe.skip("MarcherPage Functions", () => {
    it("should correctly find previous marcher page based on beat order", () => {
        // Create test data with marcher pages in non-sequential page order
        const testMarcherPages: DatabaseMarcherPage[] = [
            {
                id: 1,
                marcher_id: 1,
                page_id: 2,
                x: 100,
                y: 100,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                created_at: "",
                updated_at: "",
                rotation_degrees: 0,
            },
            {
                id: 2,
                marcher_id: 1,
                page_id: 1,
                x: 50,
                y: 50,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                created_at: "",
                updated_at: "",
                rotation_degrees: 0,
            },
            {
                id: 3,
                marcher_id: 1,
                page_id: 3,
                x: 150,
                y: 150,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                created_at: "",
                updated_at: "",
                rotation_degrees: 0,
            },
        ];

        const result = databaseMarcherPagesToMarcherPages(
            testMarcherPages,
            mockPages,
        );

        // Should be sorted by page order (1, 2, 3) not by array order (2, 1, 3)
        expect(result[0].page_id).toBe(1); // First page
        expect(result[1].page_id).toBe(2); // Second page
        expect(result[2].page_id).toBe(3); // Third page
    });
});
