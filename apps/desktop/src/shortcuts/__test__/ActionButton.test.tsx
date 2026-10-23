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
import { getActionLabel, getActionTooltip } from "../labels";
import { registerActionHandler } from "../registry";
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
    it("builds suffix and param labels", () => {
        expect(getActionLabel("moveSelectedMarchersUpFine", t)).toBe(
            "actions.movement.moveUp (actions.movement.variants.fine)",
        );
        expect(getActionLabel("timelineTapBeats2", t)).toBe(
            'actions.timeline.tapBeats:{"count":2}',
        );
    });

    it("tooltip uses toggle key and platform binding", () => {
        expect(
            getActionTooltip("lockX", t, { toggleState: "on", isMac: false }),
        ).toBe("actions.alignment.lockXOn [Y]");
        expect(getActionTooltip("performUndo", t, { isMac: true })).toBe(
            "actions.edit.undo [⌘Z]",
        );
        expect(
            getActionTooltip("launchLoadFileDialogue", t, { isMac: false }),
        ).toBe("actions.file.loadDialogue");
    });
});

describe("ActionButton", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => cleanup());

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
});
