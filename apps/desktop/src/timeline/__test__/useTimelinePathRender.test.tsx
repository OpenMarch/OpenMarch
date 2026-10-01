import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createResolver, type Resolver } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type { MarcherVisualMap } from "@/hooks/queries";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { useTimelineResolverStore } from "../timelineStore";
import { pathsIntoPage } from "../timelinePaths";
import {
    useTimelinePathRender,
    type PathRenderPage,
} from "../useTimelinePathRender";
import { useTimelineStepSizes } from "../useTimelineStepSizes";

/**
 * The hooks that put the resolver's paths on the canvas and in the inspector
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

const stubCanvas = () =>
    ({
        renderTimelinePathVisuals: vi.fn(),
        removeTimelinePathways: vi.fn(),
        sendCanvasMarchersToFront: vi.fn(),
        requestRenderAll: vi.fn(),
    }) as unknown as OpenMarchCanvas & {
        renderTimelinePathVisuals: ReturnType<typeof vi.fn>;
        removeTimelinePathways: ReturnType<typeof vi.fn>;
    };

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
const VISUALS = {} as MarcherVisualMap;

const props = (
    canvas: OpenMarchCanvas,
    enabled: boolean,
    overrides: Partial<{
        isPlaying: boolean;
        previousPathsEnabled: boolean;
        nextPathsEnabled: boolean;
        stepSizeWarningsEnabled: boolean;
    }> = {},
) => ({
    canvas,
    enabled,
    isPlaying: false,
    selectedPage: PAGES[1]!,
    pages: PAGES,
    marcherIds: MARCHER_IDS,
    marcherVisuals: VISUALS,
    fieldProperties,
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

describe("useTimelinePathRender", () => {
    it("draws the moves into and out of the selected page from the resolver", () => {
        const r = ready();
        const canvas = stubCanvas();
        renderHook(() => useTimelinePathRender(props(canvas, true)));

        expect(canvas.renderTimelinePathVisuals).toHaveBeenCalledTimes(1);
        const args = canvas.renderTimelinePathVisuals.mock.calls[0]![0];
        expect(args.previousPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[1], PAGES[0]),
        );
        expect(args.nextPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[2], PAGES[1]),
        );
        expect(canvas.removeTimelinePathways).not.toHaveBeenCalled();
    });

    it("redraws when the resolver's version changes", () => {
        ready();
        const canvas = stubCanvas();
        renderHook(() => useTimelinePathRender(props(canvas, true)));
        act(() => useTimelineResolverStore.setState({ version: 2 }));
        expect(canvas.renderTimelinePathVisuals).toHaveBeenCalledTimes(2);
    });

    it("removes the curved paths and draws nothing when disabled", () => {
        ready();
        const canvas = stubCanvas();
        const { rerender } = renderHook(
            ({ enabled }) => useTimelinePathRender(props(canvas, enabled)),
            { initialProps: { enabled: true } },
        );
        rerender({ enabled: false });
        expect(canvas.removeTimelinePathways).toHaveBeenCalledTimes(1);
        expect(canvas.renderTimelinePathVisuals).toHaveBeenCalledTimes(1);
    });

    it("neither samples nor draws while playing, and draws once playback stops", () => {
        const r = ready();
        const spy = vi.spyOn(r, "positionAt");
        const canvas = stubCanvas();
        const { rerender } = renderHook(
            ({ isPlaying }) =>
                useTimelinePathRender(props(canvas, true, { isPlaying })),
            { initialProps: { isPlaying: true } },
        );
        act(() => useTimelineResolverStore.setState({ version: 2 }));
        expect(spy).not.toHaveBeenCalled();
        expect(canvas.renderTimelinePathVisuals).not.toHaveBeenCalled();
        expect(canvas.removeTimelinePathways).not.toHaveBeenCalled();

        rerender({ isPlaying: false });
        expect(canvas.renderTimelinePathVisuals).toHaveBeenCalledTimes(1);
    });

    it("doesn't sample a side that can't show", () => {
        const r = ready();
        const canvas = stubCanvas();
        // Previous paths off (never forced); next paths off and warnings off (nothing forces them)
        renderHook(() =>
            useTimelinePathRender(
                props(canvas, true, {
                    previousPathsEnabled: false,
                    nextPathsEnabled: false,
                    stepSizeWarningsEnabled: false,
                }),
            ),
        );
        const args = canvas.renderTimelinePathVisuals.mock.calls[0]![0];
        expect(args.previousPaths.size).toBe(0);
        expect(args.nextPaths.size).toBe(0);

        // With warnings on, the next side may be forced on, so it is sampled
        const forced = stubCanvas();
        renderHook(() =>
            useTimelinePathRender(
                props(forced, true, {
                    previousPathsEnabled: false,
                    nextPathsEnabled: false,
                    stepSizeWarningsEnabled: true,
                }),
            ),
        );
        const forcedArgs = forced.renderTimelinePathVisuals.mock.calls[0]![0];
        expect(forcedArgs.previousPaths.size).toBe(0);
        expect(forcedArgs.nextPaths).toEqual(
            pathsIntoPage(r, [1], PAGES[2], PAGES[1]),
        );
    });

    it("redraws a toggle change without resampling the other side", () => {
        const r = ready();
        const canvas = stubCanvas();
        const { rerender } = renderHook(
            ({ stepSizeWarningsEnabled }) =>
                useTimelinePathRender(
                    props(canvas, true, { stepSizeWarningsEnabled }),
                ),
            { initialProps: { stepSizeWarningsEnabled: true } },
        );
        const spy = vi.spyOn(r, "positionAt");
        rerender({ stepSizeWarningsEnabled: false });
        expect(canvas.renderTimelinePathVisuals).toHaveBeenCalledTimes(2);
        const [first, second] = canvas.renderTimelinePathVisuals.mock.calls;
        expect(second![0].previousPaths).toBe(first![0].previousPaths);
        expect(second![0].nextPaths).toBe(first![0].nextPaths);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("useTimelineStepSizes", () => {
    const stepSizes = (timelineMode: boolean, page = PAGES[1]) =>
        renderHook(() =>
            useTimelineStepSizes({
                timelineMode,
                marcherIds: [1],
                page,
                previousPage: page === PAGES[0] ? null : PAGES[0],
                fieldProperties,
            }),
        ).result.current;

    it("is inactive with the flag off, so page mode keeps its own", () => {
        ready();
        expect(stepSizes(false)).toEqual({
            active: false,
            stepSize: undefined,
            minMax: undefined,
        });
    });

    it("is inactive until the resolver is ready, so the page-mode values stand in", () => {
        useTimelineResolverStore.setState({
            status: "loading",
            resolver: null,
            version: 0,
        });
        expect(stepSizes(true).active).toBe(false);
        // A resolver left over from an earlier build doesn't count while the store isn't ready
        useTimelineResolverStore.setState({
            status: "error",
            resolver: resolver(),
        });
        expect(stepSizes(true).active).toBe(false);
    });

    it("gives one marcher's step size from the resolver", () => {
        ready();
        const result = stepSizes(true);
        expect(result.active).toBe(true);
        expect(result.stepSize?.marcher_id).toBe(1);
        expect(Number.isFinite(result.stepSize!.stepsPerFiveYards)).toBe(true);
        expect(result.minMax).toBeUndefined();
    });

    it("has nothing on the first page", () => {
        ready();
        const result = stepSizes(true, PAGES[0]);
        expect(result.active).toBe(true);
        expect(result.stepSize).toBeUndefined();
    });
});
