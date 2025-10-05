import { describeDbTests } from "@/test/base";
import { renderHook, waitFor } from "@testing-library/react";
import { useTimingObjects } from "../useTimingObjects";
import { expect } from "vitest";
import { FIRST_BEAT_ID, FIRST_PAGE_ID } from "@/db-functions";

describeDbTests("useTimingObjects", (it) => {
    it("returns the correct data by default", async ({ wrapper, db }) => {
        const { result } = renderHook(() => useTimingObjects(), { wrapper });
        await waitFor(() => {
            expect(result.current.pages).toHaveLength(1);
            expect(result.current.beats).toHaveLength(1);
        });

        expect(result.current.measures).toHaveLength(0);
        expect(result.current.fetchTimingObjects).toBeDefined();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasError).toBe(false);

        expect(result.current.pages[0].id).toBe(FIRST_PAGE_ID);
        expect(result.current.pages[0].beats[0].id).toBe(FIRST_BEAT_ID);
        expect(result.current.pages[0].duration).toBe(0);
        expect(result.current.pages[0].timestamp).toBe(0);
    });
    it("returns the correct data given more pages", async ({
        wrapper,
        db,
        marchersAndPages,
    }) => {
        const { result } = renderHook(() => useTimingObjects(), { wrapper });
        await waitFor(() => {
            expect(result.current.pages).toHaveLength(
                marchersAndPages.expectedPages.length,
            );
            expect(result.current.beats).toHaveLength(
                marchersAndPages.expectedBeats.length,
            );
        });
    });
});
