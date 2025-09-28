import { renderHook, act } from "@testing-library/react";
import { useIsPlaying, IsPlayingProvider } from "@/context/IsPlayingContext";
import { describe, expect, it } from "vitest";

describe("IsPlayingContext", () => {
    it("initial isPlaying should be false", async () => {
        const { result } = renderHook(() => useIsPlaying(), {
            wrapper: IsPlayingProvider,
        });
        expect(result.current?.isPlaying).toBe(false);
    });

    it("set isPlaying once", async () => {
        const { result } = renderHook(() => useIsPlaying(), {
            wrapper: IsPlayingProvider,
        });

        let expectedIsPlaying = true;
        await act(() => result.current?.setIsPlaying(expectedIsPlaying));
        expect(result.current?.isPlaying).toEqual(expectedIsPlaying);
    });

    it("set isPlaying multiple times", async () => {
        const { result } = renderHook(() => useIsPlaying(), {
            wrapper: IsPlayingProvider,
        });

        let expectedIsPlaying = true;
        await act(() => result.current?.setIsPlaying(expectedIsPlaying));
        expect(result.current?.isPlaying).toEqual(expectedIsPlaying);

        expectedIsPlaying = false;
        await act(() => result.current?.setIsPlaying(expectedIsPlaying));
        expect(result.current?.isPlaying).toEqual(expectedIsPlaying);

        expectedIsPlaying = true;
        await act(() => result.current?.setIsPlaying(expectedIsPlaying));
        expect(result.current?.isPlaying).toEqual(expectedIsPlaying);

        expectedIsPlaying = true;
        await act(() => result.current?.setIsPlaying(expectedIsPlaying));
        expect(result.current?.isPlaying).toEqual(expectedIsPlaying);
    });
});
