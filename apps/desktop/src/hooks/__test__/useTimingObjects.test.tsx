import { describeDbTests } from "@/test/base";
import { renderHook, waitFor } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { _combineTimingObjects, useTimingObjects } from "../useTimingObjects";
import { describe, expect, it } from "vitest";
import {
    FIRST_BEAT_ID,
    FIRST_PAGE_ID,
    type DatabaseBeat,
    type DatabaseMeasure,
    type DatabasePage,
} from "@/db-functions";
import type { DatabaseUtility } from "@/db-functions/utility";

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

describe("_combineTimingObjects", () => {
    const beat = (id: number, position: number): DatabaseBeat => ({
        id,
        position,
        duration: 0.5,
        include_in_measure: true,
        notes: null,
        created_at: "",
        updated_at: "",
    });
    const result = <T,>(data: T) =>
        ({ data, isLoading: false, isError: false }) as UseQueryResult<T>;
    const results = (
        beats: DatabaseBeat[],
        pages: DatabasePage[],
        measures: DatabaseMeasure[],
        utility: DatabaseUtility,
    ) =>
        [
            result(pages),
            result(measures),
            result(beats),
            result(utility),
            result(undefined),
        ] as Parameters<typeof _combineTimingObjects>[0];

    it("doesn't reorder the cached query arrays, and shares one build for the same data", () => {
        // Out of order on purpose, as the cache may hold them
        const beats = [beat(3, 2), beat(1, 0), beat(2, 1)];
        const pages: DatabasePage[] = [
            { id: 2, start_beat: 2, is_subset: false, notes: null },
            { id: 1, start_beat: 1, is_subset: false, notes: null },
        ];
        const measures: DatabaseMeasure[] = [];
        const utility = { id: 0, last_page_counts: 1 } as DatabaseUtility;

        const first = _combineTimingObjects(
            results(beats, pages, measures, utility),
        );
        expect(beats.map((b) => b.id)).toEqual([3, 1, 2]);
        expect(pages.map((p) => p.id)).toEqual([2, 1]);
        expect(first.beats.map((b) => b.id)).toEqual([1, 2, 3]);
        expect(first.pages.map((p) => p.id)).toEqual([1, 2]);

        // Another observer with the same cached data gets the same objects
        expect(
            _combineTimingObjects(results(beats, pages, measures, utility)),
        ).toBe(first);
        // New data is built again
        const rebuilt = _combineTimingObjects(
            results([...beats], pages, measures, utility),
        );
        expect(rebuilt).not.toBe(first);
        expect(rebuilt.pages.map((p) => p.id)).toEqual([1, 2]);
    });
});
