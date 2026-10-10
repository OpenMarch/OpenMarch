import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spaceStaysPlay } from "@/components/timeline/timelineHotkeys";
import ShortcutDispatcher from "../ShortcutDispatcher";
import { registerActionHandler, runAction } from "../registry";
import { useActionHandler } from "../useActionHandler";
import { useTimelineActionEffects } from "../handlers/useTimelineActionEffects";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";

/**
 * The timeline's rules in the shortcut dispatcher (UI-14 round-2 review, UI-17): on a move
 * control Space still plays, while Enter and the nudge keys are the control's own.
 */

const offs: Array<() => void> = [];
function handle(id: Parameters<typeof registerActionHandler>[0]) {
    const run = vi.fn();
    offs.push(registerActionHandler(id, { run, isEnabled: () => true }));
    return run;
}

afterEach(() => {
    offs.splice(0).forEach((off) => off());
    document.body.innerHTML = "";
});

/** A focused move control, as a clip or the Move card: Space only plays */
function MoveControl() {
    return (
        <div data-timeline-own-keys="">
            <button
                type="button"
                data-testid="clip"
                onKeyDown={spaceStaysPlay}
                onKeyUp={spaceStaysPlay}
            >
                Clip
            </button>
        </div>
    );
}

const renderOnMoveControl = () => {
    const view = render(
        <>
            <ShortcutDispatcher />
            <MoveControl />
        </>,
    );
    const clip = view.getByTestId("clip");
    clip.focus();
    return clip;
};

describe("ShortcutDispatcher on a timeline move control", () => {
    it("still plays on Space, without pressing the control", () => {
        const play = handle("playPause");
        const clip = renderOnMoveControl();
        const notCancelled = fireEvent.keyDown(clip, {
            key: " ",
            code: "Space",
        });
        expect(notCancelled).toBe(false);
        expect(play).toHaveBeenCalledTimes(1);
    });

    it("leaves Enter and the plain nudge keys to the control", () => {
        const create = handle("createMarcherShape");
        const up = handle("moveSelectedMarchersUp");
        const clip = renderOnMoveControl();
        expect(fireEvent.keyDown(clip, { key: "Enter", code: "Enter" })).toBe(
            true,
        );
        expect(
            fireEvent.keyDown(clip, { key: "ArrowUp", code: "ArrowUp" }),
        ).toBe(true);
        expect(fireEvent.keyDown(clip, { key: "w", code: "KeyW" })).toBe(true);
        expect(create).not.toHaveBeenCalled();
        expect(up).not.toHaveBeenCalled();
    });

    it("doesn't nudge on a modified nudge key either", () => {
        const fine = handle("moveSelectedMarchersUpFine");
        const clip = renderOnMoveControl();
        fireEvent.keyDown(clip, {
            key: "ArrowUp",
            code: "ArrowUp",
            shiftKey: true,
        });
        expect(fine).not.toHaveBeenCalled();
    });

    it("skips a key press another listener cancelled", () => {
        const next = handle("nextPage");
        render(<ShortcutDispatcher />);
        const event = new KeyboardEvent("keydown", {
            key: "e",
            code: "KeyE",
            cancelable: true,
            bubbles: true,
        });
        event.preventDefault();
        window.dispatchEvent(event);
        expect(next).not.toHaveBeenCalled();
    });

    it("nudges off a move control", () => {
        const up = handle("moveSelectedMarchersUp");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "ArrowUp", code: "ArrowUp" });
        expect(up).toHaveBeenCalledTimes(1);
    });
});

describe("UI-17 shortcuts", () => {
    it("binds Shift+Space, C and ?", () => {
        const playPage = handle("playPage");
        const loop = handle("toggleLoop");
        const shortcuts = handle("showShortcuts");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: " ", code: "Space", shiftKey: true });
        fireEvent.keyDown(window, { key: "c", code: "KeyC" });
        fireEvent.keyDown(window, { key: "?", code: "Slash", shiftKey: true });
        expect(playPage).toHaveBeenCalledTimes(1);
        expect(loop).toHaveBeenCalledTimes(1);
        expect(shortcuts).toHaveBeenCalledTimes(1);
    });
});

describe("UI-18 keep", () => {
    it("binds K, and a held K toggles once", () => {
        const keep = handle("toggleKeepOnPage");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "k", code: "KeyK" });
        fireEvent.keyDown(window, { key: "k", code: "KeyK", repeat: true });
        fireEvent.keyDown(window, { key: "k", code: "KeyK", repeat: true });
        expect(keep).toHaveBeenCalledTimes(1);
    });
});

describe("a held preview frame (UI-11)", () => {
    function Effects() {
        useTimelineActionEffects();
        useActionHandler("lockX", () => {});
        useActionHandler("playPage", () => {});
        return null;
    }

    it("goes back to the playhead for an edit, not for the transport", () => {
        const clearCursor = vi.fn();
        const original = useTimelineSelectionStore.getState();
        useTimelineSelectionStore.setState({ playback: null, clearCursor });
        try {
            render(<Effects />);
            runAction("playPage");
            expect(clearCursor).not.toHaveBeenCalled();
            runAction("lockX");
            expect(clearCursor).toHaveBeenCalledTimes(1);
        } finally {
            useTimelineSelectionStore.setState({
                playback: original.playback,
                clearCursor: original.clearCursor,
            });
        }
    });
});
