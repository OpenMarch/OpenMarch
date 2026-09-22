import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
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
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({ ...uiSettings, focussedComponent: "canvas" });
});

describe("readShortcutContext", () => {
    it("detects text inputs but not checkboxes", () => {
        document.body.innerHTML = `<input id="t" /><input id="c" type="checkbox" />`;
        (document.getElementById("t") as HTMLInputElement).focus();
        expect(readShortcutContext("canvas").inTextInput).toBe(true);
        (document.getElementById("c") as HTMLInputElement).focus();
        expect(readShortcutContext("canvas").inTextInput).toBe(false);
    });

    it("detects an open modal layer with body pointer-events", () => {
        document.body.innerHTML = `<div role="dialog" data-state="open"></div>`;
        document.body.style.pointerEvents = "none";
        expect(readShortcutContext("canvas").modalOpen).toBe(true);
    });

    it("ignores pointer-events left behind after a modal unmounts", () => {
        document.body.style.pointerEvents = "none";
        expect(readShortcutContext("canvas").modalOpen).toBe(false);
    });

    it("ignores open non-modal layers", () => {
        document.body.innerHTML = `<div role="dialog" data-state="open"></div>`;
        expect(readShortcutContext("canvas").modalOpen).toBe(false);
    });
});

describe("ShortcutDispatcher", () => {
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

    it("routes Escape by focussed component", () => {
        const cancel = handle("cancelAlignmentUpdates");
        const exit = handle("exitTimelineFocus");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
        expect(cancel).toHaveBeenCalledTimes(1);

        const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, focussedComponent: "timeline" });
        fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
        expect(exit).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("runs legacy Ctrl shortcuts once", () => {
        const undo = handle("performUndo");
        render(<ShortcutDispatcher />);
        fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
        expect(undo).toHaveBeenCalledTimes(1);
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
