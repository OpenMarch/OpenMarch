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
});
