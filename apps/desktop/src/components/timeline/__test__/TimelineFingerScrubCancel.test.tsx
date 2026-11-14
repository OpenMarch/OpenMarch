import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

// A finger's scrub cancelled by a second finger (tablet 3.1): the timeline's gesture adapter sends
// the press a `pointercancel`, and a scrub then puts the playhead back where it was before the
// press. A mouse's or pen's cancel still ends where it was (desktop is unchanged).

afterEach(cleanup);

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
    showTransport: false,
};

let nextPointer = 1;

/** Presses with one pointer of `pointerType`: its events carry the same pointer id */
function pointer(pointerType: "touch" | "mouse" | "pen") {
    const pointerId = nextPointer++;
    return (target: Element, type: string, clientX: number) => {
        const event = new MouseEvent(type, {
            bubbles: true,
            button: 0,
            clientX,
        });
        Object.defineProperties(event, {
            pointerId: { value: pointerId },
            pointerType: { value: pointerType },
        });
        fireEvent(target, event);
    };
}

describe("a finger's scrub on the surface (the bare ruler)", () => {
    it("goes back to where the playhead was when cancelled", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const press = pointer("touch");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 7 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "drag" });
        press(surface, "pointercancel", 7 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(11, { gesture: "end" });
    });

    it.each(["mouse", "pen"] as const)(
        "ends where it was on a %s's cancel, as before",
        (kind) => {
            const onSeek = vi.fn();
            render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
            const surface = screen.getByTestId("timeline-pointer-surface");
            const press = pointer(kind);
            press(surface, "pointerdown", 3 * 16);
            press(surface, "pointermove", 7 * 16);
            press(surface, "pointercancel", 7 * 16);
            expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "end" });
        },
    );

    it("while playing, a press that never dragged is cancelled without a jump", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} isPlaying onSeek={onSeek} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const press = pointer("touch");
        press(surface, "pointerdown", 3 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(3, { gesture: "press" });
        press(surface, "pointercancel", 3 * 16);
        // A cancel the owner ends without jumping playback (`seekTimeline`), never an end
        expect(onSeek).toHaveBeenLastCalledWith(3, { gesture: "cancel" });
        expect(onSeek.mock.calls.some(([, o]) => o?.gesture === "end")).toBe(
            false,
        );
    });

    it("while playing, a dragged scrub ends where it was, so playback resumes there", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} isPlaying onSeek={onSeek} />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const press = pointer("touch");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 7 * 16);
        press(surface, "pointercancel", 7 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "end" });
    });
});

describe("a finger's scrub along the page boxes", () => {
    it("goes back to where the playhead was when cancelled", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
        const box = screen.getByRole("button", { name: "Page 2" });
        const press = pointer("touch");
        press(box, "pointerdown", 130);
        // Inside a finger's 12 px slop: no scrub yet
        press(box, "pointermove", 140);
        expect(onSeek).not.toHaveBeenCalled();
        press(box, "pointermove", 200);
        expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "drag" });
        press(box, "pointercancel", 200);
        expect(onSeek).toHaveBeenLastCalledWith(11, { gesture: "end" });
    });

    it.each(["mouse", "pen"] as const)(
        "ends where it was on a %s's cancel, as before",
        (kind) => {
            const onSeek = vi.fn();
            render(<ExpandedTimeline {...commonProps} onSeek={onSeek} />);
            const box = screen.getByRole("button", { name: "Page 2" });
            const press = pointer(kind);
            press(box, "pointerdown", 130);
            // A mouse scrubs after 4 px, as it always has
            press(box, "pointermove", 136);
            expect(onSeek).toHaveBeenCalled();
            press(box, "pointermove", 200);
            press(box, "pointercancel", 200);
            expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });
        },
    );

    it("while playing, a cancelled press that never scrubbed sends nothing", () => {
        const onSeek = vi.fn();
        render(<ExpandedTimeline {...commonProps} isPlaying onSeek={onSeek} />);
        const box = screen.getByRole("button", { name: "Page 2" });
        const press = pointer("touch");
        press(box, "pointerdown", 130);
        press(box, "pointercancel", 130);
        expect(onSeek).not.toHaveBeenCalled();
    });
});
