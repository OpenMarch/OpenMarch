import { afterEach, describe, expect, it, vi } from "vitest";
import {
    heldKeysOf,
    keyFor,
    keyLabel,
    pressChoiceOf,
    releaseUsedKeys,
    rolesOf,
    TIMELINE_KEYS,
    trackHeldKeys,
    validateRoleMap,
    VERSION_A,
    type HeldKeys,
    type PressChoice,
    type RoleKey,
} from "../modifierRoles";

const NONE: HeldKeys = { shift: false, alt: false, ctrl: false, meta: false };
const held = (keys: Partial<HeldKeys>): HeldKeys => ({ ...NONE, ...keys });
const OFF = { fine: false, constrain: false, fromCenter: false };

describe("heldKeysOf", () => {
    it("reads the four modifier flags of an event", () => {
        expect(
            heldKeysOf({
                shiftKey: true,
                altKey: false,
                ctrlKey: true,
                metaKey: false,
            }),
        ).toEqual({ shift: true, alt: false, ctrl: true, meta: false });
    });
});

describe("platform", () => {
    it.each(["shape", "field"] as const)(
        "%s: $mod is Cmd on a Mac and Ctrl elsewhere",
        (context) => {
            expect(
                rolesOf(held({ meta: true }), context, { isMac: true }),
            ).toEqual({ ...OFF, constrain: true });
            expect(
                rolesOf(held({ ctrl: true }), context, { isMac: false }),
            ).toEqual({ ...OFF, constrain: true });
        },
    );

    it.each(["shape", "field"] as const)(
        "%s: Mac Ctrl and Windows/Linux Meta turn on no role",
        (context) => {
            expect(
                rolesOf(held({ ctrl: true }), context, { isMac: true }),
            ).toEqual(OFF);
            expect(
                rolesOf(held({ meta: true }), context, { isMac: false }),
            ).toEqual(OFF);
        },
    );

    it.each([true, false])(
        "version A: Shift is fine and Alt is from center (isMac %s)",
        (isMac) => {
            expect(rolesOf(held({ shift: true }), "shape", { isMac })).toEqual({
                ...OFF,
                fine: true,
            });
            expect(rolesOf(held({ alt: true }), "field", { isMac })).toEqual({
                ...OFF,
                fromCenter: true,
            });
        },
    );
});

describe("keys add up", () => {
    it("two role keys turn on both roles", () => {
        expect(
            rolesOf(held({ shift: true, ctrl: true }), "shape", {
                isMac: false,
            }),
        ).toEqual({ fine: true, constrain: true, fromCenter: false });
        expect(
            rolesOf(held({ meta: true, alt: true }), "field", { isMac: true }),
        ).toEqual({ fine: false, constrain: true, fromCenter: true });
    });

    it("every combination is just the sum of its keys", () => {
        // Version A, one key at a time (spec section 5)
        const single = { shift: "fine", alt: "fromCenter", meta: "constrain" };
        const names = ["shift", "alt", "meta", "ctrl"] as const;
        for (let mask = 0; mask < 16; mask++) {
            const keys = held(
                Object.fromEntries(
                    names.map((name, i) => [name, Boolean(mask & (1 << i))]),
                ),
            );
            const expected = { ...OFF };
            for (const name of ["shift", "alt", "meta"] as const) {
                if (keys[name])
                    expected[single[name] as keyof typeof OFF] = true;
            }
            for (const context of ["shape", "field"] as const) {
                expect(rolesOf(keys, context, { isMac: true })).toEqual(
                    expected,
                );
            }
        }
    });
});

describe("onScreen toggles", () => {
    it("are OR'd into the roles from keys", () => {
        expect(
            rolesOf(held({ shift: true }), "shape", {
                isMac: false,
                onScreen: new Set(["fromCenter"]),
            }),
        ).toEqual({ fine: true, constrain: false, fromCenter: true });
        expect(
            rolesOf(NONE, "field", {
                isMac: false,
                onScreen: new Set(["fine", "constrain"]),
            }),
        ).toEqual({ fine: true, constrain: true, fromCenter: false });
    });
});

describe("the press rule", () => {
    it("a key the press used doesn't turn on a held role while it stays held", () => {
        // A Shift-press on a marcher adds it and drags at normal speed
        const usedByPress = new Set<RoleKey>(["Shift"]);
        expect(
            rolesOf(held({ shift: true }), "field", {
                isMac: false,
                usedByPress,
            }),
        ).toEqual(OFF);
        // Other keys still count
        expect(
            rolesOf(held({ shift: true, alt: true }), "field", {
                isMac: false,
                usedByPress,
            }),
        ).toEqual({ ...OFF, fromCenter: true });
    });

    it("releasing the key frees it, so pressing it again mid-drag turns the role on", () => {
        let usedByPress: ReadonlySet<RoleKey> = new Set<RoleKey>(["Shift"]);
        const isMac = false;

        usedByPress = releaseUsedKeys(
            usedByPress,
            held({ shift: true }),
            isMac,
        );
        expect(usedByPress).toEqual(new Set(["Shift"]));

        usedByPress = releaseUsedKeys(usedByPress, NONE, isMac);
        expect(usedByPress).toEqual(new Set());

        expect(
            rolesOf(held({ shift: true }), "field", { isMac, usedByPress }),
        ).toEqual({ ...OFF, fine: true });
    });

    it("releaseUsedKeys resolves $mod per platform", () => {
        const usedByPress = new Set<RoleKey>(["$mod"]);
        expect(
            releaseUsedKeys(usedByPress, held({ meta: true }), true),
        ).toEqual(new Set(["$mod"]));
        expect(
            releaseUsedKeys(usedByPress, held({ meta: true }), false),
        ).toEqual(new Set());
        expect(
            releaseUsedKeys(usedByPress, held({ ctrl: true }), false),
        ).toEqual(new Set(["$mod"]));
    });
});

describe("pressChoiceOf", () => {
    const applicable = (...choices: PressChoice[]) => new Set(choices);

    it("version A: Shift adds, Alt subtracts, $mod reaches inside", () => {
        const all = applicable("add", "subtract", "reachInside");
        expect(
            pressChoiceOf(held({ shift: true }), "field", {
                applicable: all,
                isMac: false,
            }),
        ).toEqual({ choice: "add", key: "Shift" });
        expect(
            pressChoiceOf(held({ alt: true }), "field", {
                applicable: all,
                isMac: false,
            }),
        ).toEqual({ choice: "subtract", key: "Alt" });
        expect(
            pressChoiceOf(held({ ctrl: true }), "shape", {
                applicable: all,
                isMac: false,
            }),
        ).toEqual({ choice: "reachInside", key: "$mod" });
        expect(
            pressChoiceOf(held({ meta: true }), "shape", {
                applicable: all,
                isMac: true,
            }),
        ).toEqual({ choice: "reachInside", key: "$mod" });
    });

    it("gives null with no role key held, or only Mac Ctrl / Windows Meta", () => {
        const all = applicable("add", "subtract", "reachInside");
        expect(
            pressChoiceOf(NONE, "field", { applicable: all, isMac: true }),
        ).toBeNull();
        expect(
            pressChoiceOf(held({ ctrl: true }), "field", {
                applicable: all,
                isMac: true,
            }),
        ).toBeNull();
        expect(
            pressChoiceOf(held({ meta: true }), "field", {
                applicable: all,
                isMac: false,
            }),
        ).toBeNull();
    });

    it("uses a key only when its choice applies, so $mod stays free for constrain", () => {
        // A $mod press on a loose marcher (not in a box): reach inside doesn't apply
        const keys = held({ ctrl: true });
        const choice = pressChoiceOf(keys, "field", {
            applicable: applicable("add"),
            isMac: false,
        });
        expect(choice).toBeNull();
        const usedByPress = new Set<RoleKey>(choice ? [choice.key] : []);
        expect(rolesOf(keys, "field", { isMac: false, usedByPress })).toEqual({
            ...OFF,
            constrain: true,
        });
    });

    it("a press that uses a key keeps it from its held role", () => {
        // A $mod press on a marcher inside a placed box reaches inside
        const keys = held({ meta: true });
        const choice = pressChoiceOf(keys, "shape", {
            applicable: applicable("add", "reachInside"),
            isMac: true,
        });
        expect(choice).toEqual({ choice: "reachInside", key: "$mod" });
        expect(
            rolesOf(keys, "shape", {
                isMac: true,
                usedByPress: new Set([choice!.key]),
            }),
        ).toEqual(OFF);
    });

    it("with two applicable choices held, the first of add, subtract, reach inside wins", () => {
        expect(
            pressChoiceOf(held({ shift: true, alt: true }), "field", {
                applicable: applicable("subtract", "add"),
                isMac: false,
            }),
        ).toEqual({ choice: "add", key: "Shift" });
    });
});

describe("validateRoleMap", () => {
    it("version A is valid", () => {
        expect(validateRoleMap(VERSION_A)).toEqual([]);
    });

    it("reports two held roles sharing a key within a context", () => {
        expect(
            validateRoleMap({
                shape: { fine: "Alt", constrain: "Shift", fromCenter: "Alt" },
                field: { fine: "Shift", constrain: "$mod", fromCenter: "Alt" },
            }),
        ).toEqual([
            { context: "shape", key: "Alt", roles: ["fine", "fromCenter"] },
        ]);
    });

    it("lets a press choice share a key with a held role", () => {
        expect(
            validateRoleMap({
                shape: { fine: "Shift", add: "Shift", subtract: "Shift" },
                field: { constrain: "$mod", reachInside: "$mod" },
            }),
        ).toEqual([]);
    });
});

describe("keyFor and keyLabel", () => {
    it("names the version A key for a role or choice in each context", () => {
        for (const context of ["shape", "field"] as const) {
            expect(keyFor("fine", context)).toBe("Shift");
            expect(keyFor("constrain", context)).toBe("$mod");
            expect(keyFor("fromCenter", context)).toBe("Alt");
            expect(keyFor("add", context)).toBe("Shift");
            expect(keyFor("subtract", context)).toBe("Alt");
            expect(keyFor("reachInside", context)).toBe("$mod");
        }
    });

    it("gives null when the map leaves a role out", () => {
        expect(
            keyFor("fromCenter", "field", {
                shape: {},
                field: { fine: "Shift" },
            }),
        ).toBeNull();
    });

    it("labels keys as Mac symbols or names elsewhere", () => {
        expect(keyLabel("Shift", true)).toBe("⇧");
        expect(keyLabel("Alt", true)).toBe("⌥");
        expect(keyLabel("$mod", true)).toBe("⌘");
        expect(keyLabel("Shift", false)).toBe("Shift");
        expect(keyLabel("Alt", false)).toBe("Alt");
        expect(keyLabel("$mod", false)).toBe("Ctrl");
    });
});

describe("timeline keys", () => {
    it("keep their own row: Alt = no snap, $mod = draw a range", () => {
        expect(TIMELINE_KEYS).toEqual({ noSnap: "Alt", range: "$mod" });
    });
});

describe("trackHeldKeys", () => {
    let detach: (() => void) | undefined;
    afterEach(() => detach?.());

    const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
        window.dispatchEvent(new KeyboardEvent(type, init));

    it("calls back with the current keys on keydown and keyup", () => {
        const onChange = vi.fn();
        detach = trackHeldKeys(onChange);

        key("keydown", { key: "Shift", shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(held({ shift: true }));

        key("keydown", { key: "Alt", shiftKey: true, altKey: true });
        expect(onChange).toHaveBeenLastCalledWith(
            held({ shift: true, alt: true }),
        );

        key("keyup", { key: "Shift", altKey: true });
        expect(onChange).toHaveBeenLastCalledWith(held({ alt: true }));
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("doesn't call back again while a held key repeats", () => {
        const onChange = vi.fn();
        detach = trackHeldKeys(onChange);
        key("keydown", { key: "Shift", shiftKey: true });
        key("keydown", { key: "Shift", shiftKey: true, repeat: true });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("sees the release of a key held when tracking started, and its press again", () => {
        const onChange = vi.fn();
        detach = trackHeldKeys(onChange, held({ shift: true }));

        key("keyup", { key: "Shift" });
        expect(onChange).toHaveBeenLastCalledWith(NONE);

        key("keydown", { key: "Shift", shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(held({ shift: true }));
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("doesn't call back on blur when nothing is held", () => {
        const onChange = vi.fn();
        detach = trackHeldKeys(onChange);
        window.dispatchEvent(new Event("blur"));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("clears every key on window blur", () => {
        const onChange = vi.fn();
        detach = trackHeldKeys(onChange);
        key("keydown", { key: "Meta", metaKey: true, shiftKey: true });
        window.dispatchEvent(new Event("blur"));
        expect(onChange).toHaveBeenLastCalledWith(NONE);
    });

    it("stops listening once detached", () => {
        const onChange = vi.fn();
        trackHeldKeys(onChange)();
        key("keydown", { key: "Shift", shiftKey: true });
        window.dispatchEvent(new Event("blur"));
        expect(onChange).not.toHaveBeenCalled();
    });
});
