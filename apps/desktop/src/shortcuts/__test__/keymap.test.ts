import { describe, expect, it } from "vitest";
import {
    ACTIONS,
    NUDGE_ACTION_IDS,
    type ActionDefinition,
    type ActionId,
} from "../definitions";
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
    it("flags a canvas action and a global one on the same key", () => {
        const conflicts = findConflicts({}, fixture);
        expect(conflicts).toEqual([{ binding: "E", actionIds: ["a", "d"] }]);
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

    it("prefers the canvas action over a global one", () => {
        const e = entries.filter((x) => x.binding === "E");
        expect(pickAction(e, canvas, always)?.id).toBe("a");
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

    it("normalizeOverrides moves a saved Previous paths binding to start flag positions", () => {
        // Previous paths' action became start flag positions (fork #331)
        expect(
            normalizeOverrides({ togglePreviousPagePaths: ["Shift+N"] }),
        ).toEqual({ toggleStartFlagPositions: ["Shift+N"] });
        expect(normalizeOverrides({ togglePreviousPagePaths: [] })).toEqual({
            toggleStartFlagPositions: [],
        });
        // A binding saved for the new action wins
        expect(
            normalizeOverrides({
                togglePreviousPagePaths: ["Shift+N"],
                toggleStartFlagPositions: ["J"],
            }),
        ).toEqual({ toggleStartFlagPositions: ["J"] });
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

    it.each([
        ["KeyA", "a", "selectAllMarchers"],
        ["KeyS", "s", "swapMarchers"],
    ])(
        "resolves Control+%s to its own action and not a nudge off macOS",
        (code, key, expected) => {
            const compiled = compileKeymap(buildKeymap({}, ACTIONS, false));
            const event = new KeyboardEvent("keydown", {
                key,
                code,
                ctrlKey: true,
            });
            const resolved = resolveKeyEvent(event, compiled, canvas, always);
            expect(resolved?.id).toBe(expected);
            expect(NUDGE_ACTION_IDS).not.toContain(resolved?.id);
        },
    );

    it("requires exact modifiers", () => {
        const compiled = compileKeymap(buildKeymap());
        const shiftE = new KeyboardEvent("keydown", {
            key: "E",
            code: "KeyE",
            shiftKey: true,
        });
        expect(resolveKeyEvent(shiftE, compiled, canvas, always)?.id).toBe(
            "nextBeat",
        );
    });
});

describe("page navigation shortcuts", () => {
    const press = (code: string, key: string) =>
        new KeyboardEvent("keydown", { key, code });
    const resolve = (event: KeyboardEvent, context: ShortcutContext) =>
        resolveKeyEvent(
            event,
            compileKeymap(buildKeymap({}, ACTIONS, false)),
            context,
            always,
        )?.id;

    it.each([
        ["KeyE", "e", "nextPage"],
        ["KeyQ", "q", "previousPage"],
    ])("%s resolves to %s", (code, key, id) => {
        expect(resolve(press(code, key), canvas)).toBe(id);
    });

    it("Shift steps a beat, and Alt or Home and End go to the start or end", () => {
        const withMods = (code: string, key: string, mods: KeyboardEventInit) =>
            new KeyboardEvent("keydown", { key, code, ...mods });
        expect(resolve(withMods("KeyE", "E", { shiftKey: true }), canvas)).toBe(
            "nextBeat",
        );
        expect(resolve(withMods("KeyQ", "Q", { shiftKey: true }), canvas)).toBe(
            "previousBeat",
        );
        // macOS types "œ" and "´" with Option; the binding matches the key's position
        expect(resolve(withMods("KeyQ", "œ", { altKey: true }), canvas)).toBe(
            "firstPage",
        );
        expect(resolve(withMods("KeyE", "´", { altKey: true }), canvas)).toBe(
            "lastPage",
        );
        expect(resolve(press("Home", "Home"), canvas)).toBe("firstPage");
        expect(resolve(press("End", "End"), canvas)).toBe("lastPage");
        // Alt wins over Shift, as on the transport's buttons
        const altShift = { altKey: true, shiftKey: true };
        expect(resolve(withMods("KeyQ", "Œ", altShift), canvas)).toBe(
            "firstPage",
        );
        expect(resolve(withMods("KeyE", "E", altShift), canvas)).toBe(
            "lastPage",
        );
    });

    it("arrow keys nudge marchers", () => {
        for (const key of ["ArrowRight", "ArrowLeft"]) {
            const id = resolve(press(key, key), canvas);
            expect(NUDGE_ACTION_IDS).toContain(id);
        }
    });

    it("default bindings have no conflicts", () => {
        expect(findConflicts()).toEqual([]);
    });
});
