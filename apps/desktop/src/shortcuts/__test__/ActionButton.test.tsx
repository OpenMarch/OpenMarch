import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import ActionButton from "../ActionButton";
import { Button } from "@openmarch/ui";
import { getActionLabel, getActionShortcutLabel } from "../labels";
import { notifyRefusedPress, registerActionHandler } from "../registry";
import { useActionHandler } from "../useActionHandler";
import { useInputModeStore } from "@/stores/InputModeStore";

const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key;

/** jsdom has no PointerEvent, so give a mouse event a pointerType. */
const pointer = (type: string, el: Element, pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
};

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

describe("labels", () => {
    it("builds suffix labels", () => {
        expect(getActionLabel("moveSelectedMarchersUpFine", t)).toBe(
            'actions.labelWithVariant:{"label":"actions.movement.moveUp","variant":"actions.movement.variants.fine"}',
        );
    });

    it("writes an action's shortcut as plain text the way each system does", () => {
        expect(getActionShortcutLabel("performUndo", { isMac: true })).toBe(
            "⌘Z",
        );
        expect(getActionShortcutLabel("performRedo", { isMac: false })).toBe(
            "Ctrl+Shift+Z",
        );
        expect(
            getActionShortcutLabel("launchLoadFileDialogue", { isMac: false }),
        ).toBeUndefined();
    });
});

describe("ActionButton", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => cleanup());

    it("greyed out with a reason: stays focusable, says why, and a click does nothing", () => {
        const run = vi.fn();
        const off = registerActionHandler("swapMarchers", {
            run,
            isEnabled: () => false,
            disabledReason: () => "Select 2 marchers to swap them",
        });
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Swap" });
        // Not the native disabled: that can't be hovered or focused to read the reason
        expect(button).not.toBeDisabled();
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toHaveAccessibleDescription(
            "Select 2 marchers to swap them",
        );
        fireEvent.click(button);
        expect(run).not.toHaveBeenCalled();
        // A click shows why, as a press on a menu's entry does
        expect(
            screen.getAllByText("Select 2 marchers to swap them").length,
        ).toBeGreaterThan(1);
        off();
    });

    it("a clicked reason closes on Escape, which goes no further, and when the mouse leaves", () => {
        const off = registerActionHandler("swapMarchers", {
            run: vi.fn(),
            isEnabled: () => false,
            disabledReason: () => "Select 2 marchers to swap them",
        });
        const beyond = vi.fn();
        window.addEventListener("keydown", beyond);
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Swap" });
        const shown = () =>
            screen.queryAllByText("Select 2 marchers to swap them").length;
        const hidden = shown();
        fireEvent.click(button);
        expect(shown()).toBeGreaterThan(hidden);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(shown()).toBe(hidden);
        expect(beyond).not.toHaveBeenCalled();

        fireEvent.click(button);
        expect(shown()).toBeGreaterThan(hidden);
        // React makes its pointer leave from a pointerout to outside the button
        const out = new MouseEvent("pointerout", {
            bubbles: true,
            relatedTarget: document.body,
        });
        Object.defineProperty(out, "pointerType", { value: "mouse" });
        fireEvent(button, out);
        expect(shown()).toBe(hidden);
        window.removeEventListener("keydown", beyond);
        off();
    });

    it("a refused key press lights the button up and shows why, for a moment", () => {
        vi.useFakeTimers();
        const off = registerActionHandler("swapMarchers", {
            run: vi.fn(),
            isEnabled: () => false,
            disabledReason: () => "Select 2 marchers to swap them",
        });
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Swap" });
        const shown = () =>
            screen.queryAllByText("Select 2 marchers to swap them").length;
        const hidden = shown();
        // Another action's refusal isn't this button's
        act(() => {
            notifyRefusedPress("flipHorizontal");
        });
        expect(shown()).toBe(hidden);
        act(() => {
            notifyRefusedPress("swapMarchers");
        });
        expect(shown()).toBeGreaterThan(hidden);
        expect(button.className).toMatch(/ring-2/);
        act(() => {
            vi.advanceTimersByTime(2100);
        });
        expect(shown()).toBe(hidden);
        expect(button.className).not.toMatch(/ring-2/);
        vi.useRealTimers();
        off();
    });

    it("Escape after a refused key closes the reason and still reaches the app", () => {
        const off = registerActionHandler("swapMarchers", {
            run: vi.fn(),
            isEnabled: () => false,
            disabledReason: () => "Select 2 marchers to swap them",
        });
        const beyond = vi.fn();
        window.addEventListener("keydown", beyond);
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        const shown = () =>
            screen.queryAllByText("Select 2 marchers to swap them").length;
        const hidden = shown();
        let showedIt = false;
        act(() => {
            showedIt = notifyRefusedPress("swapMarchers");
        });
        expect(showedIt).toBe(true);
        expect(shown()).toBeGreaterThan(hidden);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(shown()).toBe(hidden);
        expect(beyond).toHaveBeenCalledOnce();
        window.removeEventListener("keydown", beyond);
        off();
    });

    it("a button with no reason to show doesn't light up for a refused key", () => {
        const off = registerActionHandler("swapMarchers", {
            run: vi.fn(),
            isEnabled: () => false,
        });
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        let showedIt = true;
        act(() => {
            showedIt = notifyRefusedPress("swapMarchers");
        });
        expect(showedIt).toBe(false);
        expect(
            screen.getByRole("button", { name: "Swap" }).className,
        ).not.toMatch(/ring-2/);
        off();
    });

    it("greyed out with no reason stays plainly disabled", () => {
        const off = registerActionHandler("swapMarchers", {
            run: vi.fn(),
            isEnabled: () => false,
        });
        render(<ActionButton action="swapMarchers">Swap</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Swap" });
        expect(button).toBeDisabled();
        expect(button).not.toHaveAttribute("aria-disabled");
        off();
    });

    it("runs the action on click", () => {
        const run = vi.fn();
        const off = registerActionHandler("flipHorizontal", {
            run,
            isEnabled: () => true,
        });
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        fireEvent.click(screen.getByRole("button", { name: "Flip" }));
        expect(run).toHaveBeenCalledTimes(1);
        off();
    });

    it("is disabled while the action has no handler", () => {
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        expect(screen.getByRole("button", { name: "Flip" })).toBeDisabled();
    });

    it("follows the handler's enabled state", () => {
        const { rerender, unmount } = renderHook(
            ({ enabled }) =>
                useActionHandler("flipHorizontal", vi.fn(), { enabled }),
            { initialProps: { enabled: false } },
        );
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Flip" });
        expect(button).toBeDisabled();
        act(() => rerender({ enabled: true }));
        expect(button).toBeEnabled();
        unmount();
    });

    it("respects an explicit disabled prop", () => {
        const off = registerActionHandler("flipHorizontal", {
            run: vi.fn(),
            isEnabled: () => true,
        });
        render(
            <ActionButton action="flipHorizontal" disabled>
                Flip
            </ActionButton>,
            { wrapper: Providers },
        );
        expect(screen.getByRole("button", { name: "Flip" })).toBeDisabled();
        off();
    });

    it("names an icon-only button with its action, and has no browser title", () => {
        render(
            <ActionButton action="flipHorizontal">
                <svg />
            </ActionButton>,
            { wrapper: Providers },
        );
        const button = screen.getByRole("button", {
            name: /^Flip horizontally/,
        });
        expect(button).not.toHaveAttribute("title");
    });

    it("keeps a button's own text as its name", () => {
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        expect(
            screen.getByRole("button", { name: "Flip" }),
        ).not.toHaveAttribute("aria-label");
    });

    it("a caption names the button and shows only in touch mode", () => {
        const { rerender } = render(
            <ActionButton action="flipHorizontal" caption="Flip">
                <svg />
            </ActionButton>,
            { wrapper: Providers },
        );
        const button = screen.getByRole("button", {
            name: /^Flip horizontally/,
        });
        expect(button.querySelector("[data-touch-caption]")).toBeNull();

        act(() => {
            useInputModeStore.getState().setPreference("touch");
        });
        rerender(
            <ActionButton action="flipHorizontal" caption="Flip">
                <svg />
            </ActionButton>,
        );
        expect(button.querySelector("[data-touch-caption]")).toHaveTextContent(
            "Flip",
        );
        act(() => {
            useInputModeStore.getState().setPreference("auto");
        });
        localStorage.clear();
    });

    it("a long press with a finger explains the button and doesn't run it", () => {
        vi.useFakeTimers();
        const run = vi.fn();
        const off = registerActionHandler("flipHorizontal", {
            run,
            isEnabled: () => true,
        });
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        const button = screen.getByRole("button", { name: "Flip" });

        pointer("pointerdown", button, "touch");
        act(() => {
            vi.advanceTimersByTime(600);
        });
        pointer("pointerup", button, "touch");
        fireEvent.click(button);
        expect(run).not.toHaveBeenCalled();
        expect(screen.getByTestId("long-press-bubble")).toHaveTextContent(
            "Flip horizontally",
        );

        // A short tap still runs it
        pointer("pointerdown", button, "touch");
        pointer("pointerup", button, "touch");
        fireEvent.click(button);
        expect(run).toHaveBeenCalledTimes(1);

        // A mouse never long-presses
        pointer("pointerdown", button, "mouse");
        act(() => {
            vi.advanceTimersByTime(600);
        });
        fireEvent.click(button);
        expect(run).toHaveBeenCalledTimes(2);
        off();
        vi.useRealTimers();
    });

    it("passes the release and cancel events to the caller's own handlers", () => {
        const onPointerUp = vi.fn((e: React.PointerEvent) => e.pointerType);
        const onPointerCancel = vi.fn((e: React.PointerEvent) => e.type);
        render(
            <>
                <ActionButton
                    action="flipHorizontal"
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                >
                    Flip
                </ActionButton>
                <Button
                    tooltipText="Zoom in"
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                >
                    Zoom
                </Button>
            </>,
            { wrapper: Providers },
        );
        for (const name of ["Flip", "Zoom"]) {
            const el = screen.getByText(name).closest("button")!;
            onPointerUp.mockClear();
            onPointerCancel.mockClear();
            pointer("pointerup", el, "touch");
            pointer("pointercancel", el, "touch");
            expect(onPointerUp).toHaveBeenCalledTimes(1);
            expect(onPointerUp.mock.calls[0][0]).toBeDefined();
            expect(onPointerUp).toHaveReturnedWith("touch");
            expect(onPointerCancel.mock.calls[0][0]).toBeDefined();
            expect(onPointerCancel).toHaveReturnedWith("pointercancel");
        }
    });
});
