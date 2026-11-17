import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { PlaybackSpeedButton } from "../PlaybackSpeedButton";
import { TransportTooltipProvider } from "../ShortcutTooltip";

// Tablet 3.5 (#888): a finger or pen tap opens the speed popover; a mouse click (or a keyboard
// click, which has no pointer) steps the speed as before.

// Radix's popper measures its anchor; jsdom has no ResizeObserver
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

/** jsdom has no PointerEvent, so give a mouse event a pointerType */
const pointer = (type: string, el: Element, pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
};

function renderSpeed() {
    const onStep = vi.fn();
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TransportTooltipProvider>
                <PlaybackSpeedButton
                    speed={1}
                    playing={1}
                    held={false}
                    onStep={onStep}
                    onSetSpeed={() => {}}
                    testId="speed"
                />
            </TransportTooltipProvider>
        </TolgeeProvider>,
    );
    return { onStep, button: screen.getByTestId("speed") };
}

const popover = () => screen.queryByTestId("speed-value");

describe("PlaybackSpeedButton", () => {
    it("a touch press and its click open the popover, without stepping", () => {
        const { onStep, button } = renderSpeed();
        pointer("pointerdown", button, "touch");
        fireEvent.click(button);
        expect(popover()).not.toBeNull();
        expect(onStep).not.toHaveBeenCalled();
    });

    it("a pen tap opens it too, and a second tap closes it", () => {
        const { button } = renderSpeed();
        pointer("pointerdown", button, "pen");
        fireEvent.click(button);
        expect(popover()).not.toBeNull();
        pointer("pointerdown", button, "pen");
        act(() => {
            fireEvent.click(button);
        });
        expect(popover()).toBeNull();
    });

    it("a mouse press and its click step the speed (Shift steps back)", () => {
        const { onStep, button } = renderSpeed();
        pointer("pointerdown", button, "mouse");
        fireEvent.click(button);
        pointer("pointerdown", button, "mouse");
        fireEvent.click(button, { shiftKey: true });
        expect(onStep.mock.calls).toEqual([[false], [true]]);
        expect(popover()).toBeNull();
    });

    it("a click with no pointer (the keyboard) steps", () => {
        const { onStep, button } = renderSpeed();
        fireEvent.click(button);
        expect(onStep).toHaveBeenCalledWith(false);
        expect(popover()).toBeNull();
    });

    it("a touch press that's cancelled doesn't make a later keyboard click open it", () => {
        const { onStep, button } = renderSpeed();
        pointer("pointerdown", button, "touch");
        pointer("pointercancel", button, "touch");
        fireEvent.click(button);
        expect(onStep).toHaveBeenCalledTimes(1);
        expect(popover()).toBeNull();
    });
});
