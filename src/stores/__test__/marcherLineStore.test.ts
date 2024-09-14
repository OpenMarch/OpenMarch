import { renderHook, act, cleanup } from "@testing-library/react";
import { useMarcherLineStore } from "../useMarcherLineStore";
import { mockMarcherLines } from "@/__mocks__/globalMocks";
import MarcherLine from "@/global/classes/MarcherLine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("marcherLineStore", () => {
    beforeEach(async () => {
        const { result } = renderHook(() => useMarcherLineStore());
        vi.spyOn(MarcherLine, "readAll").mockResolvedValue([]);
        await act(async () => {
            result.current.fetchMarcherLines();
        });
    });

    afterEach(async () => {
        vi.clearAllMocks();
        cleanup();
    });

    it("marcherLineStore - initial state", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherLineStore());
        expect(result.current.marcherLines).toEqual([]);
    });

    it("marcherLineStore - fetches marcherLines", async () => {
        vi.spyOn(MarcherLine, "readAll").mockResolvedValue(mockMarcherLines);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherLineStore());
        expect(result.current.marcherLines).toEqual([]);
        await act(async () => {
            result.current.fetchMarcherLines();
        });

        // Copy the mockMarcherLines array to avoid reference equality issues
        const expectedMarcherLines = [...mockMarcherLines];
        expect.soft(result.current.marcherLines).toEqual(expectedMarcherLines);
    });

    it("marcherLineStore - fetches single marcherLine", async () => {
        const mockToUse = [mockMarcherLines[0]];
        vi.spyOn(MarcherLine, "readAll").mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherLineStore());
        await act(async () => {
            result.current.fetchMarcherLines();
        });

        // Copy the mockMarcherLines array to avoid reference equality issues
        const expectedMarcherLines = [...mockToUse];
        expect(result.current.marcherLines).toEqual(expectedMarcherLines);
    });

    it("marcherLineStore - fetch no marcherLines", async () => {
        const mockToUse: MarcherLine[] = [];
        vi.spyOn(MarcherLine, "readAll").mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherLineStore());
        await act(async () => {
            result.current.fetchMarcherLines();
        });

        // Copy the mockMarcherLines array to avoid reference equality issues
        const expectedMarcherLines = [...mockToUse];
        expect(result.current.marcherLines).toEqual(expectedMarcherLines);
    });
});
