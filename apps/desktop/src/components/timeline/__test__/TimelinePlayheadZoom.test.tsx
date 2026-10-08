import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

// Animation frames run only when a test says so, like a browser's frames
let queue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 1;
const runFrame = () => {
    const frame = queue;
    queue = [];
    for (const { cb } of frame) cb(performance.now());
};
const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
    queue = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        const id = nextId++;
        queue.push({ id, cb });
        return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
        queue = queue.filter((f) => f.id !== id);
    });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

function Playing({ live = 10.5 }: { live?: number }) {
    const [pixelsPerBeat, setPixelsPerBeat] = useState(16);
    return (
        <ExpandedTimeline
            model={timelineStoryModel}
            positionBeat={10}
            isPlaying
            livePositionBeat={() => live}
            pixelsPerBeat={pixelsPerBeat}
            onPixelsPerBeatChange={setPixelsPerBeat}
            showTransport={false}
        />
    );
}

describe("the playhead while playing", () => {
    it("is at the live position as soon as it starts following", () => {
        render(<Playing />);
        expect(screen.getByTestId("timeline-playhead").style.left).toBe(
            `${10.5 * 16}px`,
        );
    });

    it("is at the live position in a frame that zooms", () => {
        render(<Playing />);
        act(() => runFrame());
        const playhead = screen.getByTestId("timeline-playhead");
        expect(playhead.style.left).toBe(`${10.5 * 16}px`);
        fireEvent.wheel(screen.getByTestId("timeline-viewport"), {
            deltaY: -100,
            ctrlKey: true,
        });
        // One browser frame: the follow loop and the zoom's callback run, then the browser
        // paints. Outside act(), so nothing flushes React work after the frame's callbacks.
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
        runFrame();
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        const surface = screen.getByTestId("timeline-pointer-surface");
        const pixelsPerBeat =
            parseFloat(surface.style.width) / timelineStoryModel.beatCount;
        expect(pixelsPerBeat).toBeGreaterThan(16);
        expect(parseFloat(playhead.style.left)).toBeCloseTo(
            10.5 * pixelsPerBeat,
            0,
        );
    });
});
