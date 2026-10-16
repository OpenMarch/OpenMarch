import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createResolver, type Resolver } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { useTimelineResolverStore } from "../timelineStore";
import { pathsIntoPage } from "../timelinePaths";
import {
    useTimelinePathSamples,
    type PathRenderPage,
} from "../useTimelinePathSamples";
import { useTimelineStepSizes } from "../useTimelineStepSizes";

/**
 * The hooks that give the field and the inspector the resolver's paths
 * (docs/timeline/phases/07-page-parity.md P7.10).
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;

/** G8 (an arc over beats 0 to 8) split into pages 1 to 3, ending at beats 0, 4 and 8 */
const PAGES: PathRenderPage[] = [
    { id: 1, counts: 0, beats: [], previousPageId: null, nextPageId: 2 },
    {
        id: 2,
        counts: 4,
        beats: [{ index: 3 }],
        previousPageId: 1,
        nextPageId: 3,
    },
    {
        id: 3,
        counts: 4,
        beats: [{ index: 7 }],
        previousPageId: 2,
        nextPageId: null,
    },
];

const resolver = () =>
    createResolver(GOLDEN_FIXTURES.find((g) => g.name === "G8")!.build().show);

afterEach(() => {
    useTimelineResolverStore.setState({
        status: "off",
        resolver: null,
        version: 0,
        error: null,
    });
});

const MARCHER_IDS = [1];

const props = (
    enabled: boolean,
    overrides: Partial<{
        isPlaying: boolean;
        previousPathsEnabled: boolean;
        nextPathsEnabled: boolean;
        stepSizeWarningsEnabled: boolean;
    }> = {},
) => ({
    enabled,
    isPlaying: false,
    selectedPage: PAGES[1]!,
    pages: PAGES,
    marcherIds: MARCHER_IDS,
    previousPathsEnabled: true,
    nextPathsEnabled: true,
    stepSizeWarningsEnabled: true,
    ...overrides,
});

const ready = (r: Resolver = resolver()) => {
    useTimelineResolverStore.setState({
        status: "ready",
        resolver: r,
        version: 1,
    });
    return r;
};

describe("useTimelinePathSamples", () => {
    it("samples the moves into and out of the selected page from the resolver", () => {
        const r = ready();
        const { result } = renderHook(() =>
            useTimelinePathSamples(props(true)),
        );
        expect(result.current.active).toBe(true);
        expect(result.current.previousPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[1], PAGES[0]),
        );
        expect(result.current.nextPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[2], PAGES[1]),
        );
    });

    it("resamples when the resolver's version changes", () => {
        ready();
        const { result } = renderHook(() =>
            useTimelinePathSamples(props(true)),
        );
        const first = result.current.previousPaths;
        act(() => useTimelineResolverStore.setState({ version: 2 }));
        expect(result.current.previousPaths).not.toBe(first);
        expect(result.current.previousPaths).toEqual(first);
    });

    it("samples nothing and is inactive when disabled", () => {
        const r = ready();
        const spy = vi.spyOn(r, "positionAt");
        const { result } = renderHook(() =>
            useTimelinePathSamples(props(false)),
        );
        expect(result.current.active).toBe(false);
        expect(result.current.previousPaths.size).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it("doesn't sample while playing, and samples once playback stops", () => {
        const r = ready();
        const spy = vi.spyOn(r, "positionAt");
        const { result, rerender } = renderHook(
            ({ isPlaying }) =>
                useTimelinePathSamples(props(true, { isPlaying })),
            { initialProps: { isPlaying: true } },
        );
        act(() => useTimelineResolverStore.setState({ version: 2 }));
        expect(spy).not.toHaveBeenCalled();
        expect(result.current.active).toBe(false);

        rerender({ isPlaying: false });
        expect(result.current.active).toBe(true);
        expect(result.current.previousPaths.size).toBe(1);
    });

    it("keeps the samples through Play and Stop on the same page", () => {
        const r = ready();
        const { result, rerender } = renderHook(
            ({ isPlaying }) =>
                useTimelinePathSamples(props(true, { isPlaying })),
            { initialProps: { isPlaying: false } },
        );
        const first = result.current.previousPaths;
        const spy = vi.spyOn(r, "positionAt");
        rerender({ isPlaying: true });
        expect(result.current.previousPaths).toBe(first);
        rerender({ isPlaying: false });
        expect(spy).not.toHaveBeenCalled();
        expect(result.current.previousPaths).toBe(first);

        // A change while playing is sampled once playback stops
        rerender({ isPlaying: true });
        act(() => useTimelineResolverStore.setState({ version: 2 }));
        expect(result.current.previousPaths).toBe(first);
        rerender({ isPlaying: false });
        expect(result.current.previousPaths).not.toBe(first);
    });

    it("doesn't sample a side that can't show", () => {
        const r = ready();
        // Previous paths off (never forced); next paths off and warnings off (nothing forces them)
        const off = renderHook(() =>
            useTimelinePathSamples(
                props(true, {
                    previousPathsEnabled: false,
                    nextPathsEnabled: false,
                    stepSizeWarningsEnabled: false,
                }),
            ),
        ).result.current;
        expect(off.previousPaths.size).toBe(0);
        expect(off.nextPaths.size).toBe(0);

        // With warnings on, the next side may be forced on, so it is sampled
        const forced = renderHook(() =>
            useTimelinePathSamples(
                props(true, {
                    previousPathsEnabled: false,
                    nextPathsEnabled: false,
                    stepSizeWarningsEnabled: true,
                }),
            ),
        ).result.current;
        expect(forced.previousPaths.size).toBe(0);
        expect(forced.nextPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[2], PAGES[1]),
        );
    });

    it("keeps the other side's samples when a toggle changes", () => {
        const r = ready();
        const { result, rerender } = renderHook(
            ({ nextPathsEnabled }) =>
                useTimelinePathSamples(props(true, { nextPathsEnabled })),
            { initialProps: { nextPathsEnabled: true } },
        );
        const first = result.current;
        const spy = vi.spyOn(r, "positionAt");
        // Warnings still force the next side on, so neither side resamples
        rerender({ nextPathsEnabled: false });
        expect(result.current.previousPaths).toBe(first.previousPaths);
        expect(result.current.nextPaths).toBe(first.nextPaths);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("useTimelineStepSizes", () => {
    const stepSizes = (page = PAGES[1]) =>
        renderHook(() =>
            useTimelineStepSizes({
                marcherIds: [1],
                page,
                previousPage: page === PAGES[0] ? null : PAGES[0],
                fieldProperties,
            }),
        ).result.current;

    it("is inactive until the resolver is ready", () => {
        useTimelineResolverStore.setState({
            status: "loading",
            resolver: null,
            version: 0,
        });
        expect(stepSizes().active).toBe(false);
        // A resolver left over from an earlier build doesn't count while the store isn't ready
        useTimelineResolverStore.setState({
            status: "error",
            resolver: resolver(),
        });
        expect(stepSizes().active).toBe(false);
    });

    it("gives one marcher's step size from the resolver", () => {
        ready();
        const result = stepSizes();
        expect(result.active).toBe(true);
        expect(result.stepSize?.marcher_id).toBe(1);
        expect(Number.isFinite(result.stepSize!.stepsPerFiveYards)).toBe(true);
        expect(result.minMax).toBeUndefined();
    });

    it("has nothing on the first page", () => {
        ready();
        const result = stepSizes(PAGES[0]);
        expect(result.active).toBe(true);
        expect(result.stepSize).toBeUndefined();
    });
});
