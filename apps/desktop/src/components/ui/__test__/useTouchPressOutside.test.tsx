import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { LongPressBubble } from "@openmarch/ui";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    MENU_PART_ATTRIBUTE,
    useTouchPressOutside,
} from "../useTouchPressOutside";

/**
 * #928: a finger's press outside an open menu only closes it, as a mouse click outside does:
 * nothing under the press hears it, nor the click after it. A mouse and a pen are left to Radix.
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
                onContextMenu={field.menu}
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

/** The menu, with a long-press bubble open beside it */
function WithBubble({ field }: { field: Record<string, () => void> }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [shown, setShown] = useState(true);
    return (
        <>
            <Menu field={field} />
            <span ref={setAnchor} />
            <LongPressBubble
                anchor={anchor}
                open={shown && anchor !== null}
                onClose={() => setShown(false)}
            >
                Nothing moves on this page yet
            </LongPressBubble>
        </>
    );
}

const spies = () => ({
    down: vi.fn(),
    move: vi.fn(),
    up: vi.fn(),
    click: vi.fn(),
    item: vi.fn(),
    menu: vi.fn(),
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

    it("leaves a pen's press alone, as a mouse's (Radix closes the menu on it at once)", () => {
        const field = spies();
        render(<Menu field={field} />);
        tap(screen.getByTestId("field"), "pen");
        expect(screen.getByTestId("menu")).toBeTruthy();
        expect(field.down).toHaveBeenCalledTimes(1);
        expect(field.click).toHaveBeenCalledTimes(1);
    });

    it("a long press outside opens no other menu: the browser's contextmenu is swallowed too", () => {
        const field = spies();
        render(<Menu field={field} />);
        const surface = screen.getByTestId("field");
        pointer("pointerdown", surface);
        const contextMenu = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
        });
        fireEvent(surface, contextMenu);
        expect(contextMenu.defaultPrevented).toBe(true);
        expect(field.menu).not.toHaveBeenCalled();
        pointer("pointerup", surface);
        fireEvent.click(surface);
        expect(field.click).not.toHaveBeenCalled();
        // Afterwards a right-click's menu is the surface's again
        fireEvent.contextMenu(surface);
        expect(field.menu).toHaveBeenCalledTimes(1);
    });

    it("a second finger meanwhile doesn't end it; a new press after the release does", () => {
        const field = spies();
        render(<Menu field={field} />);
        const surface = screen.getByTestId("field");
        pointer("pointerdown", surface, "touch", 1);
        pointer("pointerdown", surface, "touch", 2);
        pointer("pointerup", surface, "touch", 2);
        pointer("pointerup", surface, "touch", 1);
        fireEvent.click(surface);
        expect(field.up).toHaveBeenCalledTimes(1);
        expect(field.click).not.toHaveBeenCalled();
        tap(surface, "touch", 3);
        expect(field.click).toHaveBeenCalledTimes(1);
    });

    it("after a cancelled press or a key, the next click goes through", () => {
        const field = spies();
        const { unmount } = render(<Menu field={field} />);
        const surface = screen.getByTestId("field");
        pointer("pointerdown", surface);
        pointer("pointercancel", surface);
        fireEvent.click(surface);
        expect(field.click).toHaveBeenCalledTimes(1);
        unmount();
        render(<Menu field={field} />);
        const again = screen.getByTestId("field");
        pointer("pointerdown", again, "touch", 4);
        pointer("pointerup", again, "touch", 4);
        fireEvent.keyDown(window, { key: "Enter" });
        fireEvent.click(again);
        expect(field.click).toHaveBeenCalledTimes(2);
    });

    it("the press still closes an open long-press bubble (its own window listener hears it)", () => {
        vi.useFakeTimers();
        try {
            const field = spies();
            render(<WithBubble field={field} />);
            // The bubble listens once the press that opened it has finished
            act(() => {
                vi.advanceTimersByTime(10);
            });
            expect(screen.getByTestId("long-press-bubble")).toBeTruthy();
            tap(screen.getByTestId("field"));
            expect(screen.queryByTestId("menu")).toBeNull();
            expect(screen.queryByTestId("long-press-bubble")).toBeNull();
            expect(field.down).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
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
