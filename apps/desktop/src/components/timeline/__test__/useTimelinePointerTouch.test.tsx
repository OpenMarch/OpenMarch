import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimelinePointer } from "../TimelinePrimitives";

/**
 * Tablet 3.4: a finger on the playhead drags it only once it has moved a finger's slop (12 px),
 * so a long press that wobbles never moves it before its menu opens. A mouse drags at once.
 */

afterEach(cleanup);

function Surface({ onSeek }: { onSeek: (beat: number) => void }) {
    const pointer = useTimelinePointer({
        onSeek,
        pixelsPerBeat: 1,
        beatCount: 400,
    });
    return (
        <div data-testid="surface" {...pointer.pointerHandlers}>
            <button type="button" data-testid="playhead" data-timeline-scrub>
                <span data-testid="line" />
            </button>
        </div>
    );
}

const press = (
    target: Element,
    type: string,
    clientX: number,
    pointerType: string,
) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
    Object.defineProperties(event, {
        pointerType: { value: pointerType },
        pointerId: { value: 1 },
    });
    fireEvent(target, event);
};

function setup() {
    const onSeek = vi.fn();
    render(<Surface onSeek={onSeek} />);
    const surface = screen.getByTestId("surface");
    surface.getBoundingClientRect = () => new DOMRect(0, 0, 400, 100);
    return { onSeek, surface, line: screen.getByTestId("line") };
}

describe("the playhead under a finger (tablet 3.4)", () => {
    it("doesn't move for a 9 px wobble, and drags past 12 px", () => {
        const { onSeek, line } = setup();
        press(line, "pointerdown", 100, "touch");
        press(line, "pointermove", 109, "touch");
        press(line, "pointermove", 91, "touch");
        expect(onSeek).not.toHaveBeenCalled();
        press(line, "pointermove", 113, "touch");
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onSeek.mock.calls[0]![0]).toBe(113);
    });

    it("lets a mouse drag it from the first pixel", () => {
        const { onSeek, line } = setup();
        press(line, "pointerdown", 100, "mouse");
        press(line, "pointermove", 103, "mouse");
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onSeek.mock.calls[0]![0]).toBe(103);
    });
});
