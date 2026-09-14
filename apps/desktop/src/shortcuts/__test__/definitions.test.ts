import { describe, expect, it } from "vitest";
import en from "../../../i18n/en.json";
import { canonicalBinding } from "../bindings";
import {
    ACTIONS,
    ACTION_IDS,
    NUDGE_ACTION_IDS,
    TAP_BEATS_ACTION_IDS,
} from "../definitions";

function lookup(key: string): unknown {
    return key
        .split(".")
        .reduce<unknown>(
            (node, part) =>
                node && typeof node === "object"
                    ? (node as Record<string, unknown>)[part]
                    : undefined,
            en,
        );
}

describe("ACTIONS", () => {
    it("every binding parses", () => {
        for (const id of ACTION_IDS) {
            for (const binding of ACTIONS[id].defaultBindings) {
                expect(
                    () => canonicalBinding(binding),
                    `${id}: ${binding}`,
                ).not.toThrow();
            }
        }
    });

    it("every label key exists in en.json", () => {
        for (const id of ACTION_IDS) {
            const def = ACTIONS[id];
            for (const key of [
                def.labelKey,
                def.labelSuffixKey,
                def.toggleOnKey,
                def.toggleOffKey,
            ]) {
                if (key)
                    expect(typeof lookup(key), `${id}: ${key}`).toBe("string");
            }
        }
    });

    it("preserves legacy defaults", () => {
        expect(ACTIONS.performUndo.defaultBindings).toEqual(["$mod+Z"]);
        expect(ACTIONS.performRedo.defaultBindings).toEqual(["$mod+Shift+Z"]);
        expect(ACTIONS.nextPage.defaultBindings).toEqual(["E"]);
        expect(ACTIONS.playPause.defaultBindings).toEqual(["Space"]);
        expect(ACTIONS.flipVertical.defaultBindings).toEqual(["Alt+Shift+F"]);
        expect(ACTIONS.moveSelectedMarchersUp.defaultBindings).toEqual([
            "W",
            "ArrowUp",
        ]);
    });

    it("generates 24 nudge actions and 9 tap-beat actions", () => {
        expect(NUDGE_ACTION_IDS).toHaveLength(24);
        expect(TAP_BEATS_ACTION_IDS).toHaveLength(9);
        expect(ACTIONS.moveSelectedMarchersLeftFine.args).toEqual({
            direction: "left",
            step: "quarter",
            snap: false,
        });
        expect(ACTIONS.timelineTapBeats3.args).toEqual({ count: 3 });
    });
});
