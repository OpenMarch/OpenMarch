import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTempoModeStore } from "@/tempo/tempoModeStore";
import {
    consumeEndRequest,
    playTimelineOn,
    playTimelinePage,
    stopTimelinePlayback,
    toggleTimelineLoop,
    toggleTimelinePlayback,
} from "../timelineTransport";

/**
 * Tempo mode (owner, 2026-10-30): one playhead and one Play. The start flag is hidden
 * and parked; Play loops the selected measures, or plays on from the playhead; Stop stays where
 * playback stopped. Outside tempo mode the editor's rules stand.
 */

vi.mock("@/components/timeline/audio/AudioPlayer", () => ({
    restartLivePlaybackAt: () => {},
}));

const store = () => useTimelineSelectionStore.getState();
const tempo = () => useTempoModeStore.getState();
const transport = () => ({ isPlaying: false, setIsPlaying: vi.fn() });

beforeEach(() => {
    store().reset();
    store().setShowEndBeat(16);
    store().setStartStays(true);
    store().setPageBoxes([
        { start: 0, end: 4 },
        { start: 4, end: 8 },
        { start: 8, end: 16 },
    ]);
    // Page 2 selected: the start flag on 4, the playhead moved to 6
    store().selectRange(4, 8);
    store().seekKeepingStart(6);
});

afterEach(() => {
    tempo().setOn(false);
    store().setLoop(null);
    store().setPlayback(null);
    consumeEndRequest();
});

describe("Play in tempo mode", () => {
    it("plays on from the playhead, not the window from the start flag", () => {
        tempo().setOn(true);
        toggleTimelinePlayback(transport());
        expect(store().cursorBeat).toBe(6);
        expect(store().playback).toEqual({ kind: "on" });
    });

    it("loops the selected measures", () => {
        tempo().setOn(true);
        tempo().setLoop({ from: 8, to: 12, label: "m. 3" });
        toggleTimelinePlayback(transport());
        expect(store().cursorBeat).toBe(8);
        expect(store().playback).toEqual({ kind: "preview", from: 8, to: 12 });
    });

    it("ignores the editor's loop, and C doesn't change it", () => {
        store().setLoop({ start: 4, end: 8 });
        tempo().setOn(true);
        toggleTimelinePlayback(transport());
        expect(store().playback).toEqual({ kind: "on" });
        store().setPlayback(null);
        toggleTimelineLoop();
        expect(store().loop).toEqual({ start: 4, end: 8 });
    });

    it("Shift+Space and Alt+Space play the same way", () => {
        tempo().setOn(true);
        tempo().setLoop({ from: 8, to: 12, label: "m. 3" });
        playTimelinePage(transport());
        expect(store().playback).toEqual({ kind: "preview", from: 8, to: 12 });
        store().setPlayback(null);
        tempo().setLoop(null);
        playTimelineOn(transport());
        expect(store().cursorBeat).toBe(6);
        expect(store().playback).toEqual({ kind: "on" });
    });

    it("stops where it is", () => {
        tempo().setOn(true);
        toggleTimelinePlayback(transport());
        stopTimelinePlayback(vi.fn());
        expect(consumeEndRequest()).toBe("pause");
    });

    it("goes back when the caller asks (a tap pass)", () => {
        tempo().setOn(true);
        toggleTimelinePlayback(transport());
        stopTimelinePlayback(vi.fn(), "stop");
        expect(consumeEndRequest()).toBe("stop");
    });

    it("leaves the editor's rule alone outside tempo mode", () => {
        toggleTimelinePlayback(transport());
        expect(store().cursorBeat).toBe(4);
        expect(store().playback).toMatchObject({ kind: "preview", once: true });
        stopTimelinePlayback(vi.fn());
        expect(consumeEndRequest()).toBe("stop");
    });

    it("leaving tempo mode forgets the selected measures", () => {
        tempo().setOn(true);
        tempo().setLoop({ from: 8, to: 12, label: "m. 3" });
        tempo().setOn(false);
        expect(tempo().loop).toBeNull();
    });
});

describe("the hidden start flag in tempo mode", () => {
    it("a seek behind the start flag moves only the playhead", () => {
        tempo().setOn(true);
        store().seek(2);
        expect(store().playheadBeat).toBe(2);
        expect(store().startBeat).toBe(4);
    });

    it("a scrub moves only the playhead, with no line drag", () => {
        tempo().setOn(true);
        store().beginScrub();
        expect(store().lineDrag).toBeNull();
        store().seek(3);
        store().seek(12);
        store().endScrub();
        expect(store().playheadBeat).toBe(12);
        expect(store().startBeat).toBe(4);
    });

    it("the playhead's line drags past the start flag without swapping", () => {
        tempo().setOn(true);
        store().beginLineDrag("playhead");
        store().dragLine(2);
        store().endLineDrag();
        expect(store().playheadBeat).toBe(2);
        expect(store().startBeat).toBe(4);
    });

    it("the start flag's line can't be dragged", () => {
        tempo().setOn(true);
        store().beginLineDrag("start");
        expect(store().lineDrag).toBeNull();
    });

    it("leaving puts the start flag back where it was", () => {
        tempo().setOn(true);
        store().selectRange(8, 16);
        store().seek(14);
        tempo().setOn(false);
        expect(store().startBeat).toBe(4);
        expect(store().playheadBeat).toBe(14);
        expect(store().selection).toEqual({
            kind: "range",
            start: 4,
            end: 14,
        });
    });

    it("leaving with the playhead before it moves the start flag to the playhead's page", () => {
        tempo().setOn(true);
        store().seek(3);
        tempo().setOn(false);
        expect(store().startBeat).toBe(0);
        expect(store().playheadBeat).toBe(3);
    });

    it("outside tempo mode a seek behind the start flag still swaps (UI-26)", () => {
        store().seek(2);
        expect(store().startBeat).toBe(2);
        expect(store().playheadBeat).toBe(4);
    });
});
