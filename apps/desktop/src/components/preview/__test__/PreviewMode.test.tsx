import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useBasicModeGuards } from "@/timeline/useBasicModeGuards";
import { navigateTimelinePages } from "@/timeline/timelineTransport";
import { PreviewModeHost } from "../PreviewMode";

vi.mock("@/components/timeline/audio/AudioPlayer", () => ({
    restartLivePlaybackAt: () => {},
}));

const store = () => useTimelineSelectionStore.getState();
const setPreview = (on: boolean) => {
    act(() => {
        usePreviewModeStore.getState().setPreview(on);
    });
};

beforeEach(() => {
    store().reset();
    store().setStartStays(true);
    store().setPageBoxes([
        { start: 0, end: 4 },
        { start: 4, end: 8 },
        { start: 8, end: 16 },
    ]);
    // Expert, editing page 3: the start flag on 8, the playhead on 16
    store().selectRange(8, 16);
});

afterEach(() => usePreviewModeStore.setState({ isPreview: false }));

describe("Preview's start flag", () => {
    it("follows the playhead, so a pause or click before it doesn't swap the two", () => {
        renderHook(() => useBasicModeGuards(true));
        setPreview(true);
        expect(store().startStays).toBe(false);
        act(() => {
            store().seek(2);
        });
        expect(store().playheadBeat).toBe(2);

        setPreview(false);
        expect(store().startStays).toBe(true);
    });
});

describe("entering Preview", () => {
    it("turns a loop or once-window run into playing on", () => {
        render(<PreviewModeHost />);
        store().setPlayback({ kind: "preview", from: 8, to: 16 });
        setPreview(true);
        expect(store().playback).toEqual({ kind: "on" });
    });

    it("doesn't move the loop when paging through, and leaving goes back to it", () => {
        const pages = [
            { id: 0, beats: [{ index: 0 }] },
            { id: 1, beats: [{ index: 3 }] },
            { id: 2, beats: [{ index: 7 }] },
            { id: 3, beats: [{ index: 15 }] },
        ];
        renderHook(() => useBasicModeGuards(true));
        store().selectRange(4, 8);
        store().setLoop({ start: 4, end: 8 });
        setPreview(true);
        expect(navigateTimelinePages(pages, "next-page")).toBe(true);
        expect(store().playheadBeat).toBe(16);
        expect(store().loop).toEqual({ start: 4, end: 8 });

        // Expert's window is the loop
        setPreview(false);
        expect(store().loop).toEqual({ start: 4, end: 8 });
        expect(store().startBeat).toBe(4);
        expect(store().playheadBeat).toBe(8);
    });
});
