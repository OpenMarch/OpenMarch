import { describe, expect, it } from "vitest";
import { TRANSPORT_SHORTCUTS } from "../TimelinePrimitives";
import { formatBindingKeys } from "@/shortcuts/bindings";
import {
    ACTIONS,
    getActionDefinition,
    type ActionId,
} from "@/shortcuts/definitions";
import {
    HELP_MENU_ACTIONS,
    PLAYBACK_MENU_ACTIONS,
    isMenuAction,
} from "@/global/menuActions";
import { shortcutGroups } from "@/components/ShortcutsDialog";

/** An action's first default binding as the tooltips write it, e.g. "Shift + Space" */
const shown = (id: ActionId) =>
    formatBindingKeys(getActionDefinition(id).defaultBindings[0]!, false).join(
        " + ",
    );

/**
 * The transport tooltips show the same shortcuts as the actions' default bindings (UI-17).
 * `TimelinePrimitives` doesn't import the shortcut registry; this test is the link.
 */
describe("transport shortcuts (UI-17)", () => {
    it("matches the registered playback and page shortcuts", () => {
        expect(TRANSPORT_SHORTCUTS).toEqual({
            previousPage: "Q",
            nextPage: "E",
            play: "Space",
            playPage: "Shift + Space",
            loop: "C",
        });
        expect(TRANSPORT_SHORTCUTS.playPage).toBe(shown("playPage"));
        expect(TRANSPORT_SHORTCUTS.play).toBe(shown("playPause"));
        expect(TRANSPORT_SHORTCUTS.previousPage).toBe(shown("previousPage"));
        expect(TRANSPORT_SHORTCUTS.nextPage).toBe(shown("nextPage"));
        expect(TRANSPORT_SHORTCUTS.loop).toBe(shown("toggleLoop"));
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

    it("names actions and shows their default shortcuts", () => {
        for (const item of items) {
            expect(item.action in ACTIONS, item.action).toBe(true);
            const [binding] = getActionDefinition(
                item.action as ActionId,
            ).defaultBindings;
            // Electron's accelerators name the slash "/"; the bindings name it by key code
            expect(item.accelerator, item.action).toBe(
                binding!.replace("Slash", "/"),
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
        const groups = shortcutGroups((key) => key, {}, false);
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
