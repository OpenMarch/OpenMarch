import { describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { getActionLabel } from "../labels";
import en from "../../../i18n/en.json";
import { canonicalBinding } from "../bindings";
import {
    ACTIONS,
    ACTION_IDS,
    NUDGE_ACTION_IDS,
    type ActionId,
} from "../definitions";

/**
 * The actions with a default shortcut that the command palette leaves out (#411), and why. Every
 * other action with a shortcut is listed (once it has a handler).
 */
const NOT_IN_PALETTE: Partial<Record<ActionId, string>> = {
    holdFasterPlayback: "plays faster only while its key is held",
    holdSlowerPlayback: "plays slower only while its key is held",
    openCommandPalette: "opens the palette itself",
    openCommandBar: "opens the palette itself",
    openFieldMenu:
        "the keyboard's right-click: opens the field's menu at the selection, which the palette would cover",
    shapeBlock: "listed as Shape › Box, which asks the box's numbers",
    shapeCircle: "listed as Shape › Circle, which asks the circle's numbers",
    shapeLine: "listed as Shape › Line, which asks the line's numbers",
    shapeRemoveLastPoint:
        "works only between clicks while drawing a line point by point",
};

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
                def.keywordsKey,
                def.toggleOnKey,
                def.toggleOffKey,
            ]) {
                if (key)
                    expect(typeof lookup(key), `${id}: ${key}`).toBe("string");
            }
        }
    });

    it("preserves legacy defaults", () => {
        expect(ACTIONS.performUndo.defaultBindings).toEqual([
            "$mod+Z",
            "Control+Z",
        ]);
        expect(ACTIONS.performRedo.defaultBindings).toEqual([
            "$mod+Shift+Z",
            "Control+Shift+Z",
        ]);
        expect(ACTIONS.nextPage.defaultBindings).toEqual(["E"]);
        expect(ACTIONS.playPause.defaultBindings).toEqual(["Space"]);
        expect(ACTIONS.flipVertical.defaultBindings).toEqual(["Alt+Shift+F"]);
        // F for flag; Shift for the smaller step, a subset page (UI-9)
        expect(ACTIONS.timelineCreatePageAtPlayhead.defaultBindings).toEqual([
            "F",
        ]);
        expect(ACTIONS.timelineCreateSubsetAtPlayhead.defaultBindings).toEqual([
            "Shift+F",
        ]);
        expect(ACTIONS.moveSelectedMarchersUp.defaultBindings).toEqual([
            "W",
            "ArrowUp",
        ]);
    });

    it("lists every action with a default shortcut in the palette, except those that can't work from it (#411)", () => {
        const hidden = ACTION_IDS.filter(
            (id) =>
                ACTIONS[id].defaultBindings.length > 0 &&
                (ACTIONS[id] as { hiddenFromPalette?: boolean })
                    .hiddenFromPalette,
        );
        expect(hidden.sort()).toEqual(
            (Object.keys(NOT_IN_PALETTE) as ActionId[]).sort(),
        );
    });

    it("registers the hold commands next to Clear this page, named from the hold terms", async () => {
        await tolgee.run();
        const t = (key: string, params?: Record<string, unknown>) =>
            tolgee.t(key, params as never);
        expect(getActionLabel("timelineDefineAsShown", t)).toBe(
            "Define as shown",
        );
        expect(getActionLabel("timelineHoldFromPrevious", t)).toBe(
            "Hold from last keyframe",
        );
        const clear = ACTIONS.setSelectedMarchersToPreviousPage;
        for (const id of [
            "timelineDefineAsShown",
            "timelineHoldFromPrevious",
        ] as const) {
            const def = ACTIONS[id] as {
                category: string;
                scope: string;
                hiddenFromPalette?: boolean;
            };
            expect(def).toMatchObject({
                category: clear.category,
                scope: clear.scope,
            });
            expect(def.hiddenFromPalette).toBeUndefined();
        }
        expect(ACTIONS.timelineHoldFromPrevious.defaultBindings).toEqual([
            "$mod+H",
            "Control+H",
        ]);
        expect(ACTIONS.timelineDefineAsShown.defaultBindings).toEqual([]);
        // ⌘H / Ctrl+H is no other action's key; plain H stays the shape editor's hide-marchers
        const keys = ["$mod+H", "Control+H"].map(canonicalBinding);
        expect(
            ACTION_IDS.filter((id) =>
                ACTIONS[id].defaultBindings.some((b) =>
                    keys.includes(canonicalBinding(b)),
                ),
            ),
        ).toEqual(["timelineHoldFromPrevious"]);
        expect(ACTIONS.shapeHideMarchers.defaultBindings).toEqual(["H"]);
    });

    it("generates 24 nudge actions", () => {
        expect(NUDGE_ACTION_IDS).toHaveLength(24);
        expect(ACTIONS.moveSelectedMarchersLeftFine.args).toEqual({
            direction: "left",
            step: "quarter",
            snap: false,
        });
    });
});
