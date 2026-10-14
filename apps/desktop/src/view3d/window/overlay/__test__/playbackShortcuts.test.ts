import { describe, expect, it } from "vitest";
import { ACTION_IDS, getActionDefinition } from "@/shortcuts/definitions";
import { parseBinding } from "@/shortcuts/bindings";
import { VIEW3D_PLAYBACK_ACTIONS } from "@/view3d/sync/protocol";
import { playbackActionForKey } from "../playback";

/** The `code` the window's key handler sees for a binding's key. */
const codeForKey = (key: string) =>
    key === "Space" ? "Space" : `Key${key.toUpperCase()}`;

describe("3D View playback shortcuts", () => {
    it.each(VIEW3D_PLAYBACK_ACTIONS)(
        "%s is an editor action with the same default shortcut",
        (action) => {
            expect(ACTION_IDS).toContain(action);
            const [binding] = getActionDefinition(action).defaultBindings;
            const { modifiers, key } = parseBinding(binding);
            expect(
                modifiers.filter((m) => m !== "Shift" && m !== "Alt"),
            ).toEqual([]);
            expect(
                playbackActionForKey({
                    code: codeForKey(key),
                    shiftKey: modifiers.includes("Shift"),
                    ctrlKey: false,
                    metaKey: false,
                    altKey: modifiers.includes("Alt"),
                }),
            ).toBe(action);
        },
    );
});
