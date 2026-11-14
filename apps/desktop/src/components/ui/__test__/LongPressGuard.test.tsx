import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInputModeStore } from "@/stores/InputModeStore";
import { resetKeyboardSeen } from "@/stores/KeyboardSeenStore";
import LongPressGuard from "../LongPressGuard";
import { Tip } from "../Tip";

/** jsdom has no PointerEvent, so give a mouse event a pointerType. */
const pointer = (type: string, el: Element, pointerType = "touch") => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    Object.defineProperty(event, "pointerId", { value: 1 });
    fireEvent(el, event);
};

const longPress = (el: Element, pointerType = "touch") => {
    pointer("pointerdown", el, pointerType);
    act(() => {
        vi.advanceTimersByTime(600);
    });
    pointer("pointerup", el, pointerType);
    fireEvent.click(el);
};

const setMode = (preference: "touch" | "mouse") =>
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });

describe("LongPressGuard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetKeyboardSeen();
        setMode("touch");
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        localStorage.clear();
    });

    it("a long press names the button and doesn't press it; a tap does", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <button aria-label="Undo" onClick={onClick} />
            </>,
        );
        const undo = screen.getByRole("button", { name: "Undo" });
        longPress(undo);
        expect(onClick).not.toHaveBeenCalled();
        expect(screen.getByTestId("long-press-bubble")).toHaveTextContent(
            "Undo",
        );

        pointer("pointerdown", undo);
        pointer("pointerup", undo);
        fireEvent.click(undo);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("leaves mouse presses, moved presses and opted-out buttons alone", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <button onClick={onClick}>Zoom in</button>
                <div data-own-long-press>
                    <button onClick={onClick}>Shift</button>
                </div>
            </>,
        );
        longPress(screen.getByText("Zoom in"), "mouse");
        longPress(screen.getByText("Shift"));
        expect(onClick).toHaveBeenCalledTimes(2);
        expect(screen.queryByTestId("long-press-bubble")).toBeNull();
    });

    it("drops shortcut keycaps on a tablet until a keyboard is used", () => {
        render(
            <>
                <LongPressGuard />
                <button title="Lock X movement [Y]" />
            </>,
        );
        const lock = screen.getByRole("button");
        longPress(lock);
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "Lock X movement",
        );

        fireEvent.keyDown(document.body, { key: "y" });
        pointer("pointerdown", document.body);
        longPress(lock);
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "Lock X movement [Y]",
        );
    });

    it("joins text with spaces and leaves menus alone", () => {
        const onSelect = vi.fn();
        render(
            <>
                <LongPressGuard />
                <button>
                    <span>In Place</span>
                    <span>Delete this page</span>
                </button>
                <div role="menu">
                    <button onClick={onSelect}>Subset</button>
                </div>
            </>,
        );
        longPress(screen.getByText("In Place").closest("button")!);
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "In Place Delete this page",
        );
        pointer("pointerdown", document.body);
        longPress(screen.getByText("Subset"));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("after a hint that ends in pointercancel, a keyboard click goes through", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <button aria-label="Undo" onClick={onClick} />
            </>,
        );
        const undo = screen.getByRole("button", { name: "Undo" });
        pointer("pointerdown", undo);
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(screen.getByTestId("long-press-bubble")).toBeInTheDocument();
        pointer("pointercancel", undo);
        // Enter on a hardware keyboard: a click with no pointerdown before it
        fireEvent.click(undo);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("stops swallowing shortly after the release even if no click came", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <button aria-label="Redo" onClick={onClick} />
            </>,
        );
        const redo = screen.getByRole("button", { name: "Redo" });
        pointer("pointerdown", redo);
        act(() => {
            vi.advanceTimersByTime(600);
        });
        pointer("pointerup", redo);
        act(() => {
            vi.advanceTimersByTime(800);
        });
        fireEvent.click(redo);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("shows a Tip's label and hint line, as its tooltip does with a mouse", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <Tip label="Spacing" hint="The whole of a long description">
                    <button onClick={onClick}>2</button>
                </Tip>
            </>,
        );
        longPress(screen.getByText("2"));
        expect(onClick).not.toHaveBeenCalled();
        const bubble = screen.getByTestId("long-press-bubble");
        expect(bubble).toHaveTextContent("Spacing");
        expect(screen.getByTestId("long-press-hint-line").textContent).toBe(
            "The whole of a long description",
        );
    });

    it("shows a Tip's keycaps only once a keyboard has been seen", () => {
        render(
            <>
                <LongPressGuard />
                <Tip label="Play" shortcut="Space">
                    <button>Go</button>
                </Tip>
            </>,
        );
        const go = screen.getByText("Go");
        longPress(go);
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "Play",
        );

        fireEvent.keyDown(document.body, { key: "a" });
        pointer("pointerdown", document.body);
        longPress(go);
        expect(screen.getByTestId("long-press-bubble").textContent).toMatch(
            /^Play.*Space/,
        );
    });

    it("explains a disabled control by the reason its wrapper's Tip gives", () => {
        render(
            <>
                <LongPressGuard />
                <Tip label="Circle: Select marchers first">
                    <span data-testid="wrapper">
                        <button disabled aria-label="Circle" />
                    </span>
                </Tip>
                <button disabled aria-label="No reason" />
            </>,
        );
        // With pointer-events off the press lands on the wrapper; otherwise on the button
        longPress(screen.getByTestId("wrapper"));
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "Circle: Select marchers first",
        );
        pointer("pointerdown", document.body);
        longPress(screen.getByRole("button", { name: "Circle" }));
        expect(screen.getByTestId("long-press-bubble").textContent).toBe(
            "Circle: Select marchers first",
        );

        pointer("pointerdown", document.body);
        longPress(screen.getByRole("button", { name: "No reason" }));
        expect(screen.queryByTestId("long-press-bubble")).toBeNull();
    });

    it("an enabled control's wrapper Tip with no disabled control in it says nothing", () => {
        render(
            <>
                <LongPressGuard />
                <Tip label="Two things">
                    <span data-testid="wrapper">
                        <button>One</button>
                        <button>Two</button>
                    </span>
                </Tip>
            </>,
        );
        longPress(screen.getByTestId("wrapper"));
        expect(screen.queryByTestId("long-press-bubble")).toBeNull();
        // A button in a Tip around more than it reads its own name
        longPress(screen.getByText("One"));
        expect(screen.getByTestId("long-press-bubble").textContent).toBe("One");
    });
    it("explains an unavailable menu entry by the reason in its Tip label (#928), and doesn't pick it", () => {
        const onClick = vi.fn();
        render(
            <>
                <LongPressGuard />
                <div role="menu">
                    <div
                        role="menuitem"
                        aria-disabled="true"
                        data-tip-label="Nothing moves on this page yet"
                        onClick={onClick}
                    >
                        <span>Split selected into new move</span>
                    </div>
                    <div
                        role="menuitem"
                        data-tip-label="Not a reason"
                        onClick={onClick}
                    >
                        Delete page
                    </div>
                </div>
            </>,
        );
        longPress(screen.getByText("Split selected into new move"));
        expect(screen.getByTestId("long-press-bubble")).toHaveTextContent(
            "Nothing moves on this page yet",
        );
        expect(onClick).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        cleanup();
    });

    it("an available menu entry keeps the menu's own long press: no bubble", () => {
        render(
            <>
                <LongPressGuard />
                <div role="menu">
                    <div role="menuitem" data-tip-label="Not a reason">
                        Delete page
                    </div>
                </div>
            </>,
        );
        longPress(screen.getByText("Delete page"));
        expect(screen.queryByTestId("long-press-bubble")).toBeNull();
    });
});
