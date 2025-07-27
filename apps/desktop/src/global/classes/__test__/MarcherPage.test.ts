import { mockMarcherPages } from "@/__mocks__/globalMocks";
import {
    getMarcherPages,
    updateMarcherPages,
    ModifiedMarcherPageArgs,
} from "../MarcherPage";
import { ElectronApi } from "electron/preload";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

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
        expect(pages).toEqual(mockMarcherPages);
        expect(window.electron.getMarcherPages).toHaveBeenCalled();
    });

    it("should update o`ne or many MarcherPages in the database", async () => {
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
