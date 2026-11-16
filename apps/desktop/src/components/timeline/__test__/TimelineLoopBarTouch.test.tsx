import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineLoopBar } from "../TimelineLoopBar";

const press = (
    target: Element,
    type: string,
    clientX: number,
    pointerType = "mouse",
) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
    Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    fireEvent(target, event);
};

const show = () => {
    const onChange = vi.fn();
    render(
        <div style={{ position: "relative" }}>
            <TimelineLoopBar
                loop={{ startBeatIndex: 4, endBeatIndex: 12 }}
                beatCount={32}
                pixelsPerBeat={10}
                onChange={onChange}
            />
        </div>,
    );
    return { onChange, end: screen.getByTestId("timeline-loop-end") };
};

describe("loop ends on a tablet (3.3)", () => {
    afterEach(cleanup);

    it("each end has a touch hit area", () => {
        show();
        for (const edge of ["start", "end"])
            expect(
                screen
                    .getByTestId(`timeline-loop-${edge}`)
                    .querySelector("[data-touch-hit]"),
            ).not.toBeNull();
    });

    it("a finger's wobble under 12px moves nothing", () => {
        const { onChange, end } = show();
        press(end, "pointerdown", 120, "touch");
        press(end, "pointermove", 129, "touch");
        press(end, "pointerup", 129, "touch");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("a finger drags an end by how far it moved, from where it grabbed it", () => {
        const { onChange, end } = show();
        // 18px right of the end at 120px, then 40px further
        press(end, "pointerdown", 138, "touch");
        press(end, "pointermove", 178, "touch");
        press(end, "pointerup", 178, "touch");
        expect(onChange).toHaveBeenCalledWith({
            startBeatIndex: 4,
            endBeatIndex: 16,
        });
    });

    it("a second finger's cancel puts the loop back", () => {
        const { onChange, end } = show();
        press(end, "pointerdown", 120, "touch");
        press(end, "pointermove", 160, "touch");
        press(end, "pointercancel", 160, "touch");
        press(end, "pointerup", 160, "touch");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("a mouse still drags from the first pixel, to the pointer", () => {
        const { onChange, end } = show();
        press(end, "pointerdown", 121);
        press(end, "pointermove", 131);
        press(end, "pointerup", 131);
        expect(onChange).toHaveBeenCalledWith({
            startBeatIndex: 4,
            endBeatIndex: 13,
        });
    });
});
