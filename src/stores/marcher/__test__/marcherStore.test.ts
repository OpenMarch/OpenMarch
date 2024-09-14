import { renderHook, act, cleanup } from "@testing-library/react";
import { useMarcherStore } from "../useMarcherStore";
import { mockMarchers } from "@/__mocks__/globalMocks";
import { Marcher } from "@/global/classes/Marcher";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("marcherStore", () => {
    beforeEach(async () => {
        const { result } = renderHook(() => useMarcherStore());
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue([]);
        await act(async () => {
            result.current.fetchMarchers();
        });
    });

    afterEach(async () => {
        vi.clearAllMocks();
        cleanup();
    });

    it("marcherStore - initial state", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherStore());
        expect(result.current.marchers).toEqual([]);
    });

    it("marcherStore - fetches marchers", async () => {
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue(mockMarchers);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherStore());
        expect(result.current.marchers).toEqual([]);
        await act(async () => {
            result.current.fetchMarchers();
        });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockMarchers];
        expect.soft(result.current.marchers).toEqual(expectedMarchers);
    });

    it("marcherStore - fetches single marcher", async () => {
        const mockToUse = [mockMarchers[0]];
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => {
            result.current.fetchMarchers();
        });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });

    it("marcherStore - fetch no marchers", async () => {
        const mockToUse: Marcher[] = [];
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => {
            result.current.fetchMarchers();
        });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });
});
