import { mockMarcherPages } from "@/__mocks__/globalMocks";
import {
    getMarcherPages,
    updateMarcherPages,
    ModifiedMarcherPageArgs,
    databaseMarcherPagesToMarcherPages,
} from "../MarcherPage";
import { ElectronApi } from "electron/preload";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

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

describe("MarcherPage Functions", () => {
    beforeEach(() => {
        window.electron = {
            getMarcherPages: vi
                .fn()
                .mockResolvedValue({ data: mockMarcherPages }),
            createPages: vi.fn().mockResolvedValue({ success: true }),
            updateMarcherPages: vi.fn().mockResolvedValue({ success: true }),
            deletePage: vi.fn().mockResolvedValue({ success: true }),
        } as Partial<ElectronApi> as ElectronApi;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should fetch all MarcherPages from the database", async () => {
        const pages = await getMarcherPages();
        expect(pages).toEqual(
            databaseMarcherPagesToMarcherPages(mockMarcherPages),
        );
        expect(window.electron.getMarcherPages).toHaveBeenCalled();
    });

    it("should use beat order when pages data is provided", async () => {
        const pages = await getMarcherPages({ pages: mockPages });
        expect(pages).toEqual(
            databaseMarcherPagesToMarcherPages(mockMarcherPages, mockPages),
        );
        expect(window.electron.getMarcherPages).toHaveBeenCalled();
    });

    it("should correctly find previous marcher page based on beat order", () => {
        // Create test data with marcher pages in non-sequential page order
        const testMarcherPages = [
            {
                id: 1,
                marcher_id: 1,
                page_id: 2,
                x: 100,
                y: 100,
                path_data: null,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                pathway_notes: null,
                id_for_html: null,
                created_at: "",
                updated_at: "",
            },
            {
                id: 2,
                marcher_id: 1,
                page_id: 1,
                x: 50,
                y: 50,
                path_data: null,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                pathway_notes: null,
                id_for_html: null,
                created_at: "",
                updated_at: "",
            },
            {
                id: 3,
                marcher_id: 1,
                page_id: 3,
                x: 150,
                y: 150,
                path_data: null,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                notes: null,
                pathway_notes: null,
                id_for_html: null,
                created_at: "",
                updated_at: "",
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

        // Since path_data is null, all path_data should be null
        expect(result[0].path_data).toBeNull();
        expect(result[1].path_data).toBeNull();
        expect(result[2].path_data).toBeNull();
    });

    it("should update one or many MarcherPages in the database", async () => {
        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [
            { marcher_id: 1, page_id: 2, x: 8, y: 10 },
            { marcher_id: 2, page_id: 2, x: 54.6, y: -456 },
            { marcher_id: 1, page_id: 3, x: 0, y: 10.123021 },
            { marcher_id: 2, page_id: 3, x: -239.09, y: 10 },
        ];

        const mockResponse = { success: true };
        const fetchMarcherPagesFunction = vi.fn();

        const response = await updateMarcherPages(
            modifiedMarcherPages,
            fetchMarcherPagesFunction,
        );

        expect(response).toEqual(mockResponse);
        expect(window.electron.updateMarcherPages).toHaveBeenCalledWith(
            modifiedMarcherPages,
        );
        expect(fetchMarcherPagesFunction).toHaveBeenCalled();
    });
});
