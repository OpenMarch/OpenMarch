import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    MENU_PART_ATTRIBUTE,
    useTouchPressOutside,
} from "../useTouchPressOutside";

/**
 * #928: a finger's press outside an open menu only closes it, as a mouse click outside does:
 * nothing under the press hears it, nor the click after it. A mouse is left to Radix.
 */

afterEach(cleanup);

/** jsdom has no PointerEvent, so give a mouse event a pointerType. */
const pointer = (
    type: string,
    el: Element,
    pointerType = "touch",
    pointerId = 1,
) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    fireEvent(el, event);
    return event;
};

const tap = (el: Element, pointerType = "touch", pointerId = 1) => {
    pointer("pointerdown", el, pointerType, pointerId);
    pointer("pointermove", el, pointerType, pointerId);
    pointer("pointerup", el, pointerType, pointerId);
    fireEvent.click(el);
};

function Menu({ field }: { field: Record<string, () => void> }) {
    const [open, setOpen] = useState(true);
    const menu = useRef<HTMLDivElement>(null);
    useTouchPressOutside(open, menu, () => setOpen(false));
    return (
        <>
            <div
                data-testid="field"
                onPointerDown={field.down}
                onPointerMove={field.move}
                onPointerUp={field.up}
                onClick={field.click}
            />
            {open && (
                <div ref={menu} data-testid="menu">
                    <button onClick={field.item}>Delete page</button>
                </div>
            )}
            {open && (
                <div data-testid="reason" {...{ [MENU_PART_ATTRIBUTE]: "" }} />
            )}
        </>
    );
}

const spies = () => ({
    down: vi.fn(),
    move: vi.fn(),
    up: vi.fn(),
    click: vi.fn(),
    item: vi.fn(),
});

describe("useTouchPressOutside", () => {
    it("a finger's tap outside closes the menu, and nothing under it hears the tap", () => {
        const field = spies();
        render(<Menu field={field} />);
        tap(screen.getByTestId("field"));
        expect(screen.queryByTestId("menu")).toBeNull();
        expect(field.down).not.toHaveBeenCalled();
        expect(field.move).not.toHaveBeenCalled();
        expect(field.up).not.toHaveBeenCalled();
        expect(field.click).not.toHaveBeenCalled();
        // The next tap is the field's again
        tap(screen.getByTestId("field"), "touch", 2);
        expect(field.down).toHaveBeenCalledTimes(1);
        expect(field.click).toHaveBeenCalledTimes(1);
    });

    it("a pen's press closes it the same way", () => {
        const field = spies();
        render(<Menu field={field} />);
        tap(screen.getByTestId("field"), "pen");
        expect(screen.queryByTestId("menu")).toBeNull();
        expect(field.down).not.toHaveBeenCalled();
        expect(field.click).not.toHaveBeenCalled();
    });

    it("leaves a mouse's press alone (Radix closes the menu on it, as before)", () => {
        const field = spies();
        render(<Menu field={field} />);
        tap(screen.getByTestId("field"), "mouse");
        expect(screen.getByTestId("menu")).toBeTruthy();
        expect(field.down).toHaveBeenCalledTimes(1);
        expect(field.click).toHaveBeenCalledTimes(1);
    });

    it("a tap inside the menu, or on a popup that's part of it, is the menu's", () => {
        const field = spies();
        render(<Menu field={field} />);
        tap(screen.getByTestId("reason"));
        expect(screen.getByTestId("menu")).toBeTruthy();
        tap(screen.getByRole("button", { name: "Delete page" }));
        expect(field.item).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("menu")).toBeTruthy();
    });
});
