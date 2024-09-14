import { renderHook, act } from "@testing-library/react";
import { usePageStore } from "../PageStore";
import { mockPages } from "@/__mocks__/globalMocks";
import Page from "@/global/classes/Page";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/api/api");

describe("pageStore", () => {
    afterEach(async () => {
        vi.clearAllMocks();
        const { result } = renderHook(() => usePageStore());
        vi.spyOn(Page, "getPages").mockResolvedValue([]);
        await act(async () => {
            result.current.fetchPages();
        });
        vi.clearAllMocks();
    });

    it("pageStore - initial state []", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);
    });

    it("pageStore - fetches pages", async () => {
        const mockToUse = mockPages;
        vi.spyOn(Page, "getPages").mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);

        await act(async () => {
            result.current.fetchPages();
        });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });

    it("pageStore - fetches single page", async () => {
        const mockToUse = [mockPages[0]];
        vi.spyOn(Page, "getPages").mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);

        await act(async () => {
            result.current.fetchPages();
        });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });

    it("pageStore - fetch no pages", async () => {
        const mockToUse: Page[] = [];
        vi.spyOn(Page, "getPages").mockResolvedValue(mockToUse);

        const { result } = renderHook(() => usePageStore());
        await act(async () => {
            result.current.fetchPages();
        });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });
});
