import { renderHook, act } from "@testing-library/react";
import { useMarcherPageStore } from "../MarcherPageStore";
import { mockMarcherPages } from "@/__mocks__/globalMocks";
import * as MarcherPage from "@/global/classes/MarcherPage";
import { describe, expect, it, vi, afterEach } from "vitest";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex"; // <-- use your utility

describe("marcherPageStore", () => {
    afterEach(async () => {
        vi.clearAllMocks();
        const { result } = renderHook(() => useMarcherPageStore());
        vi.spyOn(MarcherPage, "getMarcherPages").mockResolvedValue([]);
        await act(async () => {
            result.current.fetchMarcherPages();
        });
        vi.clearAllMocks();
    });

    it("marcherPagesStore - initial state", async () => {
        const { result } = renderHook(() => useMarcherPageStore());
        // Expect the initial state to be an empty map object
        expect(result.current.marcherPages).toEqual({
            marcherPagesByMarcher: {},
            marcherPagesByPage: {},
        });
    });

    it("marcherPagesStore - fetch all", async () => {
        const mockToUse = mockMarcherPages;
        vi.spyOn(MarcherPage, "getMarcherPages").mockResolvedValue(
            mockToUse as any,
        );

        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual({
            marcherPagesByMarcher: {},
            marcherPagesByPage: {},
        });
        await act(async () => {
            result.current.fetchMarcherPages();
        });

        // Use the utility to create the expected map
        const expectedMarcherPages = marcherPageMapFromArray(mockToUse);
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });

    it("marcherPagesStore - fetches single marcherPage", async () => {
        const mockToUse = [mockMarcherPages[0]];
        vi.spyOn(MarcherPage, "getMarcherPages").mockResolvedValue(
            mockToUse as any,
        );

        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual({
            marcherPagesByMarcher: {},
            marcherPagesByPage: {},
        });
        await act(async () => {
            result.current.fetchMarcherPages();
        });

        const expectedMarcherPages = marcherPageMapFromArray(mockToUse);
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });

    it("marcherPagesStore - fetch no marcherPages", async () => {
        const mockToUse: any[] = [];
        vi.spyOn(MarcherPage, "getMarcherPages").mockResolvedValue(
            mockToUse as any,
        );

        const { result } = renderHook(() => useMarcherPageStore());
        await act(async () => {
            result.current.fetchMarcherPages();
        });

        expect(result.current.marcherPages).toEqual({
            marcherPagesByMarcher: {},
            marcherPagesByPage: {},
        });
    });
});
