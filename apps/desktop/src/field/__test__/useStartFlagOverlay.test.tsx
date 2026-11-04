import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createResolver, type Resolver } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import {
    resolverSpans,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { marcherSetBeats } from "@/timeline/timelineSetFollowing";
import {
    DEFAULT_START_FLAG_POSITIONS,
    type StartFlagPositionsSettings,
} from "@/timeline/startFlagLevels";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useStartFlagKeyStore } from "@/stores/StartFlagKeyStore";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { planStartFlagOverlay } from "../startFlagOverlay";
import { useStartFlagOverlay } from "../three/useStartFlagOverlay";

/**
 * Start flag positions on the field (fork #331, #336): the plans for the edit window [S, P), at
 * the levels in effect, hidden where the spec hides them, and sampled no more than needed.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;

/** G6: four marchers on a line at beat 4, following the leader to beat 12 */
const g6 = (): Resolver =>
    createResolver(GOLDEN_FIXTURES.find((g) => g.name === "G6")!.build().show);
const MARCHERS = [1, 2, 3, 4];

/** The resolver, counting how often it is asked where a marcher is */
function counted(resolver: Resolver) {
    const calls = { count: 0 };
    const proxy = new Proxy(resolver, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
                calls.count++;
                return (value as (...a: unknown[]) => unknown).apply(
                    target,
                    args,
                );
            };
        },
    });
    return { resolver: proxy, calls };
}

function ready(resolver: Resolver = g6(), version = 1) {
    useTimelineResolverStore.setState({ status: "ready", resolver, version });
    return resolver;
}

const setWindow = (start: number, end: number) =>
    useTimelineSelectionStore.setState({
        selection: { kind: "range", start, end },
        startBeat: start,
        playheadBeat: end,
        isolation: null,
        cursorBeat: null,
        scrubbing: false,
        lineDrag: null,
    });

const setLevels = (settings: StartFlagPositionsSettings) =>
    useUiSettingsStore.getState().setStartFlagPositions(settings);

type Props = Parameters<typeof useStartFlagOverlay>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
    enabled: true,
    isPlaying: false,
    marcherIds: MARCHERS,
    selectedIds: [],
    fieldProperties,
    ...overrides,
});

const expected = (
    resolver: Resolver,
    levels: StartFlagPositionsSettings["always"],
    selectedIds: number[] = [],
    stepSizeWarnings = false,
) =>
    planStartFlagOverlay({
        resolver,
        marcherIds: MARCHERS,
        selectedIds: new Set(selectedIds),
        fromBeat: 4,
        toBeat: 12,
        levels,
        stepSizeWarnings,
        fieldProperties,
        setBeatsOf: (id) => marcherSetBeats(resolverSpans(resolver, id)),
    });

beforeEach(() => {
    setWindow(4, 12);
    setLevels({
        always: { dots: "all", paths: "all" },
        hold: { dots: "selected", paths: "off" },
    });
    useUiSettingsStore.getState().setUiSettings({
        ...useUiSettingsStore.getState().uiSettings,
        stepSizeWarnings: false,
    });
    useStartFlagKeyStore.setState({
        held: false,
        latched: false,
        pressedAt: null,
        drawn: false,
    });
    useEditorModeStore.setState({ mode: "expert" });
});

afterEach(() => {
    useTimelineResolverStore.setState({
        status: "off",
        resolver: null,
        version: 0,
        error: null,
    });
    setLevels(DEFAULT_START_FLAG_POSITIONS);
});

describe("useStartFlagOverlay", () => {
    it("draws the window from the start flag to the playhead at the Always levels", () => {
        const r = ready();
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        const plan = result.current!;
        expect(plan).toEqual(expected(r, { dots: "all", paths: "all" }));
        expect(plan.dots.dots).toHaveLength(4);
        expect(plan.paths.strokes.length).toBeGreaterThan(0);
    });

    it("draws the Hold N levels while N is held or latched, for the selected marchers", () => {
        const r = ready();
        const { result, rerender } = renderHook(
            (p: Props) => useStartFlagOverlay(p),
            { initialProps: props({ selectedIds: [2, 3] }) },
        );
        act(() => {
            useStartFlagKeyStore.getState().press();
        });
        expect(result.current).toEqual(
            expected(r, { dots: "selected", paths: "off" }, [2, 3]),
        );
        expect(result.current!.dots.dots).toHaveLength(2);
        expect(result.current!.paths.strokes).toEqual([]);
        // The dots follow the selection
        rerender(props({ selectedIds: [4] }));
        expect(result.current!.dots.dots).toHaveLength(1);
        // Nothing selected: nothing drawn
        rerender(props({ selectedIds: [] }));
        expect(result.current!.dots.dots).toEqual([]);
        act(() => {
            useStartFlagKeyStore.getState().release();
        });
        // A tap latches: still the Hold N levels
        expect(result.current!.paths.strokes).toEqual([]);
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(result.current).toEqual(
            expected(r, { dots: "all", paths: "all" }),
        );
    });

    it("draws nothing when the levels in effect are off, at home, or isolating", () => {
        const { resolver, calls } = counted(g6());
        ready(resolver);
        setLevels({
            always: { dots: "off", paths: "off" },
            hold: { dots: "all", paths: "all" },
        });
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        expect(result.current).toBeNull();
        // Off costs nothing
        expect(calls.count).toBe(0);

        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(result.current!.dots.dots).toHaveLength(4);

        act(() => {
            useTimelineSelectionStore.setState({ selection: { kind: "home" } });
        });
        expect(result.current).toBeNull();
        act(() => {
            setWindow(4, 12);
        });
        expect(result.current).not.toBeNull();

        act(() => {
            useTimelineSelectionStore.setState({
                isolation: {} as never,
            });
        });
        expect(result.current).toBeNull();
        act(() => {
            useTimelineSelectionStore.setState({ isolation: null });
        });
        expect(result.current).not.toBeNull();
    });

    it("follows the start flag and the playhead, and the resolver's edits", () => {
        const r = ready();
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        act(() => {
            setWindow(8, 12);
        });
        expect(result.current).toEqual(
            planStartFlagOverlay({
                resolver: r,
                marcherIds: MARCHERS,
                selectedIds: new Set(),
                fromBeat: 8,
                toBeat: 12,
                levels: { dots: "all", paths: "all" },
                stepSizeWarnings: false,
                fieldProperties,
            }),
        );
        // An edit (a drop) is a new resolver version: the paths are sampled again
        act(() => {
            setWindow(4, 12);
        });
        const before = result.current;
        const { resolver, calls } = counted(r);
        act(() => {
            ready(resolver, 2);
        });
        expect(calls.count).toBeGreaterThan(0);
        expect(result.current).toEqual(before);
    });

    it("ends the window at the beat the canvas shows: the cursor when there is one", () => {
        const r = ready();
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        // A held preview frame or paused cursor at beat 8
        act(() => {
            useTimelineSelectionStore.setState({ cursorBeat: 8 });
        });
        expect(result.current).toEqual(
            planStartFlagOverlay({
                resolver: r,
                marcherIds: MARCHERS,
                selectedIds: new Set(),
                fromBeat: 4,
                toBeat: 8,
                levels: { dots: "all", paths: "all" },
                stepSizeWarnings: false,
                fieldProperties,
            }),
        );
        // A cursor on or before the start flag: nothing drawn
        for (const cursorBeat of [4, 2]) {
            act(() => {
                useTimelineSelectionStore.setState({ cursorBeat });
            });
            expect(result.current).toBeNull();
        }
        act(() => {
            useTimelineSelectionStore.setState({ cursorBeat: null });
        });
        expect(result.current).toEqual(
            expected(r, { dots: "all", paths: "all" }),
        );
    });

    it("draws dots only while the playhead is scrubbed or a line is dragged, and the paths again on release", () => {
        const r = ready();
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        const dotsOnly = (fromBeat: number) =>
            planStartFlagOverlay({
                resolver: r,
                marcherIds: MARCHERS,
                selectedIds: new Set(),
                fromBeat,
                toBeat: 12,
                levels: { dots: "all", paths: "off" },
                stepSizeWarnings: false,
                fieldProperties,
            });
        act(() => {
            useTimelineSelectionStore.setState({ scrubbing: true });
        });
        expect(result.current).toEqual(dotsOnly(4));
        expect(result.current!.dots.dots).toHaveLength(4);
        act(() => {
            useTimelineSelectionStore.setState({ scrubbing: false });
        });
        expect(result.current).toEqual(
            expected(r, { dots: "all", paths: "all" }),
        );

        // The start flag dragged to beat 6: the dots sit where the marchers are there
        act(() => {
            useTimelineSelectionStore.setState({
                lineDrag: {
                    line: "start",
                    startBeat: 4,
                    playheadBeat: 12,
                    beat: 6,
                },
                startBeat: 6,
                selection: { kind: "range", start: 6, end: 12 },
            });
        });
        expect(result.current).toEqual(dotsOnly(6));
        act(() => {
            useTimelineSelectionStore.setState({ lineDrag: null });
        });
        expect(result.current!.paths.strokes.length).toBeGreaterThan(0);
    });

    it("draws the step-size warnings only when they're on", () => {
        const r = ready();
        const { result } = renderHook(() => useStartFlagOverlay(props()));
        act(() => {
            useUiSettingsStore.getState().setUiSettings({
                ...useUiSettingsStore.getState().uiSettings,
                stepSizeWarnings: true,
            });
        });
        expect(result.current).toEqual(
            expected(r, { dots: "all", paths: "all" }, [], true),
        );
    });

    it("publishes whether the field draws anything, which playback and N while playing don't change", () => {
        ready();
        const drawn = () => useStartFlagKeyStore.getState().drawn;
        const { rerender, unmount } = renderHook(
            (p: Props) => useStartFlagOverlay(p),
            { initialProps: props() },
        );
        expect(drawn()).toBe(true);
        // Selected levels with a selection that draws nothing (no marcher in the plan)
        setLevels({
            always: { dots: "selected", paths: "selected" },
            hold: { dots: "all", paths: "all" },
        });
        rerender(props({ selectedIds: [99] }));
        expect(drawn()).toBe(false);
        // Playing keeps what was drawn at Play: N then changes nothing on the field, nor here
        rerender(props({ selectedIds: [99], isPlaying: true }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(drawn()).toBe(false);
        // Stopped, the Hold N state draws everyone
        rerender(props({ selectedIds: [99] }));
        expect(drawn()).toBe(true);
        unmount();
        expect(drawn()).toBe(false);
    });

    it("keeps the plans from before Play while playing, and doesn't sample", () => {
        const { resolver, calls } = counted(g6());
        ready(resolver);
        const { result, rerender } = renderHook(
            (p: Props) => useStartFlagOverlay(p),
            { initialProps: props() },
        );
        const before = result.current;
        calls.count = 0;
        rerender(props({ isPlaying: true }));
        expect(result.current).toBe(before);
        // Play from the start flag puts the cursor there; the plans from before Play stay
        act(() => {
            useTimelineSelectionStore.setState({ cursorBeat: 4 });
        });
        expect(result.current).toBe(before);
        // Selection and the N key change nothing drawn while playing
        rerender(props({ isPlaying: true, selectedIds: [1] }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(result.current).toBe(before);
        expect(calls.count).toBe(0);
        // Stopping where it was needs no sampling either
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        act(() => {
            useTimelineSelectionStore.setState({ cursorBeat: null });
        });
        rerender(props());
        expect(result.current).toEqual(before);
        expect(calls.count).toBe(0);
    });

    it("doesn't sample again for selection or level changes over marchers already sampled", () => {
        const { resolver, calls } = counted(g6());
        ready(resolver);
        const { result, rerender } = renderHook(
            (p: Props) => useStartFlagOverlay(p),
            { initialProps: props() },
        );
        const all = result.current;
        calls.count = 0;
        // Hold N (selected dots) and back to Always (all dots and paths)
        rerender(props({ selectedIds: [1, 2] }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(result.current!.dots.dots).toHaveLength(2);
        rerender(props({ selectedIds: [3] }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        // All dots and paths again, now with squares on the selected marcher's route
        expect(result.current).toEqual(
            expected(resolver, { dots: "all", paths: "all" }, [3]),
        );
        expect(result.current!.paths).toEqual(all!.paths);
        expect(result.current!.dots.dots).toEqual(all!.dots.dots);
        // The same changes again sample nothing: every piece and Set beat list is kept
        calls.count = 0;
        rerender(props({ selectedIds: [1, 2] }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        rerender(props({ selectedIds: [3] }));
        act(() => {
            useStartFlagKeyStore.getState().toggleLatched();
        });
        expect(calls.count).toBe(0);
    });
});
