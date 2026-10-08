import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelinePausedAppearance } from "../useTimelineAppearance";

const initial = useTimelineSelectionStore.getState();

/** Only `requestRenderAll` is used by the hook */
const fakeCanvas = () =>
    ({ requestRenderAll: vi.fn() }) as unknown as OpenMarchCanvas & {
        requestRenderAll: ReturnType<typeof vi.fn>;
    };

describe("useTimelinePausedAppearance", () => {
    afterEach(() => useTimelineSelectionStore.setState(initial, true));

    it("styles at the displayed beat, and follows it through the store without a re-render", () => {
        useTimelineSelectionStore.setState({
            playheadBeat: 4,
            cursorBeat: null,
        });
        const canvas = fakeCanvas();
        const applyAt = vi.fn((beat: number) => (beat >= 8 ? 3 : 0));
        let renders = 0;
        renderHook(() => {
            renders++;
            useTimelinePausedAppearance({ canvas, isPlaying: false, applyAt });
        });
        expect(applyAt).toHaveBeenLastCalledWith(4);
        expect(canvas.requestRenderAll).not.toHaveBeenCalled();

        act(() => {
            useTimelineSelectionStore.setState({ playheadBeat: 9 });
        });
        expect(applyAt).toHaveBeenLastCalledWith(9);
        expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);

        // A held preview frame wins over the playhead
        act(() => {
            useTimelineSelectionStore.setState({ cursorBeat: 2 });
        });
        expect(applyAt).toHaveBeenLastCalledWith(2);

        // An unrelated store write doesn't restyle
        const calls = applyAt.mock.calls.length;
        act(() => {
            useTimelineSelectionStore.setState({ scrubbing: true });
        });
        expect(applyAt.mock.calls.length).toBe(calls);
        expect(renders).toBe(1);
    });

    it("does nothing while playing (playback styles marchers per frame)", () => {
        const canvas = fakeCanvas();
        const applyAt = vi.fn(() => 1);
        renderHook(() =>
            useTimelinePausedAppearance({ canvas, isPlaying: true, applyAt }),
        );
        act(() => {
            useTimelineSelectionStore.setState({ playheadBeat: 12 });
        });
        expect(applyAt).not.toHaveBeenCalled();
    });

    it("a failed restyle doesn't stop the store's other listeners", () => {
        const canvas = fakeCanvas();
        const applyAt = vi.fn((beat: number) => {
            if (beat === 7) throw new Error("bad appearance");
            return 0;
        });
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        renderHook(() =>
            useTimelinePausedAppearance({ canvas, isPlaying: false, applyAt }),
        );
        const later = vi.fn();
        const unsubscribe = useTimelineSelectionStore.subscribe(later);
        try {
            expect(() =>
                act(() => {
                    useTimelineSelectionStore.setState({
                        playheadBeat: 7,
                        cursorBeat: null,
                    });
                }),
            ).not.toThrow();
            expect(applyAt).toHaveBeenLastCalledWith(7);
            expect(later).toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        } finally {
            unsubscribe();
            error.mockRestore();
        }
    });
});
