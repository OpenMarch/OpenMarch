import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

afterEach(cleanup);

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
    showTransport: false,
};

const press = (target: Element, type: string, clientX: number) =>
    fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, button: 0, clientX }),
    );

describe("a scrub that never gets its release", () => {
    it("ends on the surface when the pointer capture is lost", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 7 * 16 + 3);
        expect(playhead.style.transform).not.toBe("");
        // Alt-tab mid-drag, released outside the window: no pointerup or pointercancel
        fireEvent(
            surface,
            new MouseEvent("lostpointercapture", { bubbles: true }),
        );
        expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "end" });
        expect(playhead.style.transform).toBe("");
        // The next move isn't part of a scrub
        onSeek.mockClear();
        press(surface, "pointermove", 9 * 16);
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("ends on the surface when the timeline unmounts mid-scrub", () => {
        const onSeek = vi.fn();
        const { unmount } = render(
            <ExpandedTimeline {...commonProps} onSeek={onSeek} />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 7 * 16);
        unmount();
        expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "end" });
    });

    it("ends on the page boxes when the pointer capture is lost", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
        const box = screen.getByRole("button", { name: "Page 2" });
        const playhead = screen.getByTestId("timeline-playhead");
        press(box, "pointerdown", 130);
        press(box, "pointermove", 200);
        expect(playhead.style.transform).not.toBe("");
        fireEvent(box, new MouseEvent("lostpointercapture", { bubbles: true }));
        expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });
        expect(playhead.style.transform).toBe("");
    });

    it("ends on the page boxes when the timeline unmounts mid-scrub", () => {
        const onSeek = vi.fn();
        const { unmount } = render(
            <ExpandedTimeline {...commonProps} onSeek={onSeek} />,
        );
        const box = screen.getByRole("button", { name: "Page 2" });
        press(box, "pointerdown", 130);
        press(box, "pointermove", 200);
        unmount();
        expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });
    });

    it("a normal release still ends once, at the release", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 6 * 16);
        press(surface, "pointerup", 8 * 16);
        // The capture is lost after the release
        fireEvent(
            surface,
            new MouseEvent("lostpointercapture", { bubbles: true }),
        );
        const ends = onSeek.mock.calls.filter(
            ([, options]) => options?.gesture === "end",
        );
        expect(ends).toEqual([[8, { gesture: "end" }]]);
    });
});

describe("a read-only timeline (no onSeek)", () => {
    it("doesn't move its line under the pointer", () => {
        render(<ExpandedTimeline {...commonProps} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        press(surface, "pointerdown", 3 * 16);
        expect(playhead.style.transform).toBe("");
        press(surface, "pointermove", 7 * 16 + 3);
        expect(playhead.style.transform).toBe("");
        press(surface, "pointerup", 7 * 16 + 3);
        expect(playhead).toHaveStyle({ left: `${11 * 16}px` });
    });
});
