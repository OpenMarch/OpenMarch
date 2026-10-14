import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

/**
 * UI-21: the start flag, and the playhead by its line or head, are dragged by themselves. The
 * timeline sends each beat as a seek naming the line, and its owner swaps them when one passes the
 * other (`lineDragPositions`, `seekTimeline`).
 */

afterEach(cleanup);

const pointer = (target: Element, type: string, clientX: number) =>
    fireEvent(
        target,
        // Alt: no snapping, so lines land on the beat under the pointer (16px a beat)
        new MouseEvent(type, {
            bubbles: true,
            button: 0,
            clientX,
            altKey: true,
        }),
    );

/** The window [5, 9), with the owner taking seeks */
const renderWindow = () => {
    const onSeek = vi.fn();
    const onSelectionChange = vi.fn();
    render(
        <ExpandedTimeline
            model={timelineStoryModel}
            positionBeat={9}
            isPlaying={false}
            pixelsPerBeat={16}
            showTransport={false}
            selection={{
                kind: "range",
                range: { startBeatIndex: 5, endBeatIndex: 9 },
            }}
            onSeek={onSeek}
            onSelectionChange={onSelectionChange}
        />,
    );
    return {
        onSeek,
        onSelectionChange,
        start: screen.getByRole("button", { name: /^Start flag/ }),
        playhead: screen.getByTestId("timeline-playhead"),
    };
};

describe("dragging the start flag by itself (UI-21)", () => {
    it("sends each beat it reaches, past the playhead too, and the release", () => {
        const { onSeek, onSelectionChange, start } = renderWindow();
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 112);
        expect(onSeek).toHaveBeenLastCalledWith(7, {
            gesture: "drag",
            line: "start",
        });
        pointer(start, "pointermove", 240);
        expect(onSeek).toHaveBeenLastCalledWith(15, {
            gesture: "drag",
            line: "start",
        });
        pointer(start, "pointerup", 240);
        expect(onSeek).toHaveBeenLastCalledWith(15, {
            gesture: "end",
            line: "start",
        });
        // The owner moves the window; nothing is committed as a selection
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("Escape cancels it back to where it began", () => {
        const { onSeek, start } = renderWindow();
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 240);
        fireEvent.keyDown(start, { key: "Escape" });
        expect(onSeek).toHaveBeenLastCalledWith(5, {
            gesture: "cancel",
            line: "start",
        });
    });

    it("a drag still down when the timeline goes is cancelled", () => {
        const { onSeek, start } = renderWindow();
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 240);
        cleanup();
        expect(onSeek).toHaveBeenLastCalledWith(5, {
            gesture: "cancel",
            line: "start",
        });
    });

    it("an arrow step is a whole drag, onto or past the playhead too", () => {
        const { onSeek, start } = renderWindow();
        fireEvent.keyDown(start, { key: "ArrowRight" });
        expect(onSeek).toHaveBeenLastCalledWith(6, {
            gesture: "end",
            line: "start",
        });
    });
});

describe("dragging the playhead by its line (UI-21)", () => {
    it("names the playhead in each seek of the drag", () => {
        const { onSeek, playhead } = renderWindow();
        pointer(playhead, "pointerdown", 144);
        pointer(playhead, "pointermove", 48);
        expect(onSeek).toHaveBeenLastCalledWith(3, {
            gesture: "drag",
            line: "playhead",
        });
        pointer(playhead, "pointerup", 48);
        expect(onSeek).toHaveBeenLastCalledWith(3, {
            gesture: "end",
            line: "playhead",
        });
    });

    it("a scrub started away from it names no line", () => {
        const { onSeek, playhead } = renderWindow();
        const surface = playhead.parentElement!;
        pointer(surface, "pointerdown", 240);
        pointer(surface, "pointermove", 48);
        expect(onSeek).toHaveBeenLastCalledWith(3, { gesture: "drag" });
        pointer(surface, "pointerup", 48);
        expect(onSeek).toHaveBeenLastCalledWith(3, { gesture: "end" });
    });
});
