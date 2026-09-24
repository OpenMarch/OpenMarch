import { describe, expect, it } from "vitest";
import type { ActionDefinition, ActionId } from "../definitions";
import {
    buildKeymap,
    compileKeymap,
    findBindingOwners,
    findConflicts,
    getDisplayBindings,
    getEffectiveBindings,
    normalizeOverrides,
    pickAction,
    resolveKeyEvent,
    withBinding,
    withoutBinding,
    type ShortcutContext,
} from "../keymap";

const canvas: ShortcutContext = {
    baseScope: "canvas",
    inTextInput: false,
    modalOpen: false,
};
const always = () => true;

const fixture: Record<string, ActionDefinition> = {
    a: {
        labelKey: "x",
        category: "ui",
        scope: "canvas",
        defaultBindings: ["E"],
    },
    b: {
        labelKey: "x",
        category: "ui",
        scope: "timeline",
        defaultBindings: ["E"],
    },
    c: {
        labelKey: "x",
        category: "ui",
        scope: "global",
        defaultBindings: ["$mod+Z"],
    },
    d: {
        labelKey: "x",
        category: "ui",
        scope: "global",
        defaultBindings: ["e"],
    },
};

describe("getEffectiveBindings", () => {
    it("uses overrides when present, including empty", () => {
        expect(getEffectiveBindings("nextPage")).toEqual(["E"]);
        expect(getEffectiveBindings("nextPage", { nextPage: ["K"] })).toEqual([
            "K",
        ]);
        expect(getEffectiveBindings("nextPage", { nextPage: [] })).toEqual([]);
    });
});

describe("findConflicts", () => {
    it("flags same-scope and global overlaps but not canvas vs timeline", () => {
        const conflicts = findConflicts({}, fixture);
        expect(conflicts).toEqual([
            { binding: "E", actionIds: ["a", "b", "d"] },
        ]);
        const withoutGlobal = findConflicts({}, { a: fixture.a, b: fixture.b });
        expect(withoutGlobal).toEqual([]);
    });

    it("shipped defaults have no conflicts", () => {
        expect(findConflicts()).toEqual([]);
    });

    it("every shipped binding compiles", () => {
        expect(() => compileKeymap(buildKeymap())).not.toThrow();
        expect(compileKeymap(buildKeymap()).length).toBe(buildKeymap().length);
    });
});

describe("pickAction", () => {
    const entries = buildKeymap({}, fixture);

    it("prefers the base scope over global", () => {
        const e = entries.filter((x) => x.binding === "E");
        expect(pickAction(e, canvas, always)?.id).toBe("a");
        expect(
            pickAction(e, { ...canvas, baseScope: "timeline" }, always)?.id,
        ).toBe("b");
    });

    it("blocks non-input actions while typing and in modals", () => {
        const e = entries.filter((x) => x.binding === "Control+Z");
        expect(
            pickAction(e, { ...canvas, inTextInput: true }, always),
        ).toBeUndefined();
        expect(
            pickAction(e, { ...canvas, modalOpen: true }, always),
        ).toBeUndefined();
    });

    it("skips actions that are not runnable", () => {
        const e = entries.filter((x) => x.binding === "E");
        expect(
            pickAction(e, canvas, (id: ActionId) => id !== ("a" as ActionId))
                ?.id,
        ).toBe("d");
    });
});

describe("customizing", () => {
    it("normalizeOverrides keeps only real changes", () => {
        expect(
            normalizeOverrides({
                nextPage: ["E"],
                previousPage: ["K", "not+a+++binding"],
                notAnAction: ["X"],
                lockX: "Y",
            }),
        ).toEqual({ previousPage: ["K"] });
    });

    it("adds, removes and reassigns bindings", () => {
        let overrides = withBinding({}, "nextPage", "K", false);
        expect(overrides).toEqual({ nextPage: ["E", "K"] });
        expect(withBinding(overrides, "nextPage", "k", false)).toBe(overrides);

        overrides = withoutBinding(overrides, "nextPage", "K", false);
        expect(overrides).toEqual({});

        expect(findBindingOwners("nextPage", "Q", {}, false)).toEqual([
            "previousPage",
        ]);
        overrides = withBinding({}, "nextPage", "Q", false, ["previousPage"]);
        expect(overrides).toEqual({ nextPage: ["E", "Q"], previousPage: [] });
    });

    it("finds owners across $mod and Control off macOS only", () => {
        expect(
            findBindingOwners("flipHorizontal", "Control+Z", {}, false),
        ).toEqual(["performUndo"]);
        expect(
            findBindingOwners("flipHorizontal", "Control+Z", {}, true),
        ).toEqual(["performUndo"]);
        expect(
            findBindingOwners("flipHorizontal", "Meta+Z", {}, false),
        ).toEqual([]);
    });

    it("ignores bindings in a non-overlapping scope", () => {
        expect(
            findBindingOwners("timelinePlayPause", "Space", {}, false),
        ).toEqual([]);
    });

    it("removing Ctrl+Z off macOS drops both $mod and Control variants", () => {
        expect(withoutBinding({}, "performUndo", "Control+Z", false)).toEqual({
            performUndo: [],
        });
        expect(getDisplayBindings("performUndo", {}, false)).toEqual([
            "$mod+Z",
        ]);
        expect(getDisplayBindings("performUndo", {}, true)).toEqual([
            "$mod+Z",
            "Control+Z",
        ]);
    });
});

describe("platform bindings", () => {
    it("treats $mod and Control as the same key off macOS", () => {
        const conflicts = findConflicts(
            {
                performUndo: ["$mod+Z"],
                flipHorizontal: ["Control+Z"],
            },
            undefined,
            false,
        );
        expect(conflicts).toEqual([
            {
                binding: "Control+Z",
                actionIds: ["performUndo", "flipHorizontal"],
            },
        ]);
        expect(
            findConflicts(
                { performUndo: ["$mod+Z"], flipHorizontal: ["Control+Z"] },
                undefined,
                true,
            ),
        ).toEqual([]);
    });

    it("collapses an action's duplicate bindings", () => {
        const undo = (isMac: boolean) =>
            buildKeymap({}, undefined, isMac)
                .filter((e) => e.id === "performUndo")
                .map((e) => e.binding);
        expect(undo(false)).toEqual(["Control+Z"]);
        expect(undo(true)).toEqual(["Meta+Z", "Control+Z"]);
    });
});

describe("resolveKeyEvent", () => {
    it("matches digits on the top row and the numpad", () => {
        const compiled = compileKeymap(buildKeymap());
        const context = {
            baseScope: "canvas" as const,
            inTextInput: false,
            modalOpen: false,
        };
        for (const code of ["Digit1", "Numpad1"]) {
            const event = new KeyboardEvent("keydown", { key: "1", code });
            expect(
                resolveKeyEvent(event, compiled, context, () => true)?.id,
                code,
            ).toBe("snapToNearestCustomFraction");
        }
    });

    it("matches letters by event.code even when event.key is mangled", () => {
        const compiled = compileKeymap(buildKeymap());
        const event = new KeyboardEvent("keydown", {
            key: "√",
            code: "KeyV",
            altKey: true,
        });
        expect(resolveKeyEvent(event, compiled, canvas, always)?.id).toBe(
            "alignVertically",
        );
    });

    it("requires exact modifiers", () => {
        const compiled = compileKeymap(buildKeymap());
        const shiftE = new KeyboardEvent("keydown", {
            key: "E",
            code: "KeyE",
            shiftKey: true,
        });
        expect(resolveKeyEvent(shiftE, compiled, canvas, always)?.id).toBe(
            "lastPage",
        );
    });
});
