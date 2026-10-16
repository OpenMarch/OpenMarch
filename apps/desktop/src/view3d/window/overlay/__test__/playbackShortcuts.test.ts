import { describe, expect, it } from "vitest";
import { ACTION_IDS, getActionDefinition } from "@/shortcuts/definitions";
import { parseBinding } from "@/shortcuts/bindings";
import { VIEW3D_PLAYBACK_ACTIONS } from "@/view3d/sync/protocol";
import { playbackActionForKey } from "../playback";

/** The `code` the window's key handler sees for a binding's key. */
const codeForKey = (key: string) =>
    key.length === 1 ? `Key${key.toUpperCase()}` : key;

// The speed steps are buttons only, in the editor too
const WITH_KEYS = VIEW3D_PLAYBACK_ACTIONS.filter(
    (action) => getActionDefinition(action).defaultBindings.length > 0,
);

describe("3D View playback shortcuts", () => {
    it.each(VIEW3D_PLAYBACK_ACTIONS)("%s is an editor action", (action) => {
        expect(ACTION_IDS).toContain(action);
    });

    it.each(WITH_KEYS)("%s has the editor's default shortcut", (action) => {
        const [binding] = getActionDefinition(action).defaultBindings;
        const { modifiers, key } = parseBinding(binding);
        expect(modifiers.filter((m) => m !== "Shift" && m !== "Alt")).toEqual(
            [],
        );
        expect(
            playbackActionForKey({
                code: codeForKey(key),
                shiftKey: modifiers.includes("Shift"),
                ctrlKey: false,
                metaKey: false,
                altKey: modifiers.includes("Alt"),
            }),
        ).toBe(action);
    });
});
