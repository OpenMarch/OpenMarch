import { afterEach, describe, expect, it } from "vitest";
import { isActionOffInWorkspace } from "@/shortcuts/workspaceActions";
import { installTempoKeyGuard } from "../tempoShortcuts";
import { useTempoModeStore } from "../tempoModeStore";

afterEach(() => useTempoModeStore.getState().setOn(false));

describe("tempo mode shortcuts", () => {
    it("leaves only navigation, playback, undo and save on", () => {
        useTempoModeStore.getState().setOn(true);
        for (const id of [
            "nextPage",
            "previousBeat",
            "playPause",
            "performUndo",
            "timelineGoTo",
            "launchSaveFileDialogue",
        ] as const)
            expect(isActionOffInWorkspace(id)).toBe(false);
        for (const id of [
            "selectAllMarchers",
            "alignVertically",
            "timelineCreatePageAtPlayhead",
            "openCommandPalette",
            "toggleKeepOnPage",
        ] as const)
            expect(isActionOffInWorkspace(id)).toBe(true);
        useTempoModeStore.getState().setOn(false);
        expect(isActionOffInWorkspace("selectAllMarchers")).toBe(false);
    });

    it("stops other keys before the field's own handlers, and lets navigation and tempo keys through", () => {
        const remove = installTempoKeyGuard();
        const reached: string[] = [];
        const onKey = (e: KeyboardEvent) => reached.push(e.key);
        document.body.addEventListener("keydown", onKey);
        const press = (init: KeyboardEventInit) =>
            document.body.dispatchEvent(
                new KeyboardEvent("keydown", { bubbles: true, ...init }),
            );
        useTempoModeStore.getState().setOn(true);
        press({ key: "Delete", code: "Delete" });
        press({ key: "a", code: "KeyA", ctrlKey: true });
        press({ key: "e", code: "KeyE" });
        press({ key: " ", code: "Space" });
        press({ key: "t", code: "KeyT" });
        useTempoModeStore.getState().setOn(false);
        press({ key: "Delete", code: "Delete" });
        document.body.removeEventListener("keydown", onKey);
        remove();
        expect(reached).toEqual(["e", " ", "t", "Delete"]);
    });
});
