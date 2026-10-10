import { describe, expect, it } from "vitest";
import { TRANSPORT_SHORTCUTS } from "../TimelinePrimitives";
import {
    RegisteredActionsEnum,
    RegisteredActionsObjects,
} from "@/utilities/RegisteredActionsHandler";
import {
    HELP_MENU_ACTIONS,
    PLAYBACK_MENU_ACTIONS,
    isMenuAction,
} from "@/global/menuActions";
import { shortcutGroups } from "@/components/ShortcutsDialog";

/**
 * The transport tooltips show the same shortcuts as the registered actions (UI-17).
 * `TimelinePrimitives` doesn't import the action registry; this test is the link.
 */
describe("transport shortcuts (UI-17)", () => {
    it("matches the registered playback and page shortcuts", () => {
        expect(TRANSPORT_SHORTCUTS).toEqual({
            previousPage: "Q",
            nextPage: "E",
            play: "Space",
            playPage: "Shift + Space",
        });
        expect(TRANSPORT_SHORTCUTS.playPage).toBe(
            RegisteredActionsObjects.playPage.keyboardShortcut!.toString(),
        );
        expect(TRANSPORT_SHORTCUTS.play).toBe(
            RegisteredActionsObjects.playPause.keyboardShortcut!.toString(),
        );
        expect(TRANSPORT_SHORTCUTS.previousPage).toBe(
            RegisteredActionsObjects.previousPage.keyboardShortcut!.toString(),
        );
        expect(TRANSPORT_SHORTCUTS.nextPage).toBe(
            RegisteredActionsObjects.nextPage.keyboardShortcut!.toString(),
        );
    });
});

describe("app menu actions (docs/adr/0003-menu-actions-ipc.md)", () => {
    const items = [...PLAYBACK_MENU_ACTIONS, ...HELP_MENU_ACTIONS];

    it("lists Play, Play Page Once and Loop, plus the shortcuts list (UI-17)", () => {
        expect(PLAYBACK_MENU_ACTIONS).toEqual([
            { action: "playPause", label: "Play / Stop", accelerator: "Space" },
            {
                action: "playPage",
                label: "Play Page Once",
                accelerator: "Shift+Space",
            },
            {
                action: "toggleLoop",
                label: "Loop On / Off",
                accelerator: "C",
            },
        ]);
        expect(HELP_MENU_ACTIONS).toEqual([
            {
                action: "showShortcuts",
                label: "Keyboard Shortcuts",
                accelerator: "Shift+/",
            },
        ]);
    });

    it("names registered actions and shows their registered shortcuts", () => {
        for (const item of items) {
            const action =
                RegisteredActionsObjects[
                    item.action as keyof typeof RegisteredActionsObjects
                ];
            expect(action, item.action).toBeDefined();
            expect(Object.values(RegisteredActionsEnum)).toContain(item.action);
            // Electron's "Shift+/" is the registry's "?"
            const shown =
                item.accelerator === "Shift+/"
                    ? "?"
                    : item.accelerator.replace(/\+/g, " + ");
            expect(shown, item.action).toBe(
                action.keyboardShortcut!.toString(),
            );
        }
    });

    it("lets the renderer run only those", () => {
        for (const item of items) expect(isMenuAction(item.action)).toBe(true);
        expect(isMenuAction("deleteAllMarchers")).toBe(false);
        expect(isMenuAction(undefined)).toBe(false);
    });
});

describe("the shortcuts list (UI-17 follow-up)", () => {
    it("groups every shortcut, playback first, with the timeline's own keys", () => {
        const groups = shortcutGroups((key) => key);
        expect(groups[0]?.title).toBe("Playback");
        const playback = groups[0]!.rows.map((row) => row.keys);
        expect(playback).toEqual(["Space", "Shift + Space", "C", "Ctrl + M"]);
        const timeline = groups.find((g) => g.title === "Timeline");
        expect(timeline?.rows.map((row) => row.keys)).toContain("G");
        // K keeps the selection on this page, or lets it follow again (UI-18)
        expect(timeline?.rows).toContainEqual({
            label: "actions.timeline.toggleKeepOnPage",
            keys: "K",
        });
        const view = groups.find((g) => g.title === "View");
        expect(view?.rows.map((row) => row.keys)).toContain("?");
        // Nothing without a key, such as the nudge's own actions
        for (const group of groups)
            for (const row of group.rows) expect(row.keys).not.toBe("");
    });
});
