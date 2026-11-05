import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import ShortcutDispatcher from "../ShortcutDispatcher";
import { registerActionHandler } from "../registry";
import { readShortcutContext } from "../context";

const offs: Array<() => void> = [];
function handle(id: Parameters<typeof registerActionHandler>[0]) {
    const run = vi.fn();
    offs.push(registerActionHandler(id, { run, isEnabled: () => true }));
    return run;
}

afterEach(() => {
    offs.splice(0).forEach((off) => off());
    document.body.innerHTML = "";
    document.body.style.pointerEvents = "";
});

describe("readShortcutContext", () => {
    it("detects text inputs but not checkboxes", () => {
        document.body.innerHTML = `<input id="t" /><input id="c" type="checkbox" />`;
        (document.getElementById("t") as HTMLInputElement).focus();
        expect(readShortcutContext().inTextInput).toBe(true);
        (document.getElementById("c") as HTMLInputElement).focus();
        expect(readShortcutContext().inTextInput).toBe(false);
    });

    it("detects an open modal layer with body pointer-events", () => {
        document.body.innerHTML = `<div role="dialog" data-state="open"></div>`;
        document.body.style.pointerEvents = "none";
        expect(readShortcutContext().modalOpen).toBe(true);
    });

    it("ignores pointer-events left behind after a modal unmounts", () => {
        document.body.style.pointerEvents = "none";
        expect(readShortcutContext().modalOpen).toBe(false);
    });

    it("ignores open non-modal layers", () => {
        document.body.innerHTML = `<div role="dialog" data-state="open"></div>`;
        expect(readShortcutContext().modalOpen).toBe(false);
    });
});

describe("ShortcutDispatcher", () => {
    it("lets go of a held action when its key comes up, or the window loses focus", () => {
        const run = vi.fn();
        const release = vi.fn();
        offs.push(
            registerActionHandler("holdFasterPlayback", {
                run,
                release,
                isEnabled: () => true,
            }),
        );
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "]", code: "BracketRight" });
        fireEvent.keyDown(window, {
            key: "]",
            code: "BracketRight",
            repeat: true,
        });
        expect(run).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
        // Another key coming up doesn't
        fireEvent.keyUp(window, { key: "e", code: "KeyE" });
        expect(release).not.toHaveBeenCalled();
        fireEvent.keyUp(window, { key: "]", code: "BracketRight" });
        expect(release).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(window, { key: "]", code: "BracketRight" });
        fireEvent.blur(window);
        expect(release).toHaveBeenCalledTimes(2);
        // Released once only
        fireEvent.keyUp(window, { key: "]", code: "BracketRight" });
        expect(release).toHaveBeenCalledTimes(2);
    });

    it("runs the matched canvas action and prevents default", () => {
        const run = handle("nextPage");
        render(<ShortcutDispatcher />);
        const notCancelled = fireEvent.keyDown(window, {
            key: "e",
            code: "KeyE",
        });
        expect(run).toHaveBeenCalledTimes(1);
        expect(notCancelled).toBe(false);
    });

    it("does nothing while typing", () => {
        const run = handle("nextPage");
        document.body.innerHTML = `<textarea id="t"></textarea>`;
        (document.getElementById("t") as HTMLTextAreaElement).focus();
        render(<ShortcutDispatcher />);
        const notCancelled = fireEvent.keyDown(window, {
            key: "e",
            code: "KeyE",
        });
        expect(run).not.toHaveBeenCalled();
        expect(notCancelled).toBe(true);
    });

    it("leaves an Escape that closes a menu to the menu", () => {
        const cancel = handle("cancelAlignmentUpdates");
        document.body.innerHTML = `<div role="listbox" data-state="open"></div>`;
        // Like Radix: the layer goes as soon as the press reaches the document
        const close = () => (document.body.innerHTML = "");
        document.addEventListener("keydown", close, true);
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
        document.removeEventListener("keydown", close, true);
        expect(cancel).not.toHaveBeenCalled();
        // With nothing open, Escape is the app's again
        fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("runs legacy Ctrl shortcuts once", () => {
        const undo = handle("performUndo");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("uses saved overrides and picks up changes", () => {
        const run = handle("nextPage");
        render(<ShortcutDispatcher />);
        act(() => {
            useShortcutOverridesStore.getState().addBinding("nextPage", "K");
        });
        fireEvent.keyDown(window, { key: "k", code: "KeyK" });
        expect(run).toHaveBeenCalledTimes(1);
        act(() => {
            useShortcutOverridesStore.getState().resetAll();
        });
        fireEvent.keyDown(window, { key: "k", code: "KeyK" });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("honors overrides", () => {
        const run = handle("nextPage");
        render(<ShortcutDispatcher overrides={{ nextPage: ["K"] }} />);
        fireEvent.keyDown(window, { key: "e", code: "KeyE" });
        expect(run).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "k", code: "KeyK" });
        expect(run).toHaveBeenCalledTimes(1);
    });
});

describe("ShortcutDispatcher, the field's menu (#315)", () => {
    it("opens it with the context-menu key or Shift+F10 while the field has focus", () => {
        const run = handle("openFieldMenu");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "ContextMenu", code: "ContextMenu" });
        fireEvent.keyDown(window, { key: "F10", code: "F10", shiftKey: true });
        expect(run).toHaveBeenCalledTimes(2);
        // Plain F10 doesn't
        fireEvent.keyDown(window, { key: "F10", code: "F10" });
        expect(run).toHaveBeenCalledTimes(2);
    });
});
