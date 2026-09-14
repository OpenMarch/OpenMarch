import { describe, expect, it } from "vitest";
import type { ActionDefinition, ActionId } from "../definitions";
import {
    buildKeymap,
    compileKeymap,
    findConflicts,
    getEffectiveBindings,
    pickAction,
    resolveKeyEvent,
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
        const e = entries.filter((x) => x.binding === "$mod+Z");
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

describe("resolveKeyEvent", () => {
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
