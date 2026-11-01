import { afterEach, describe, expect, it, vi } from "vitest";
import { startGestureKeys, type GestureKeys } from "../gestureKeys";
import { NO_KEYS, type HeldKeys } from "../modifierRoles";

const held = (keys: Partial<HeldKeys>): HeldKeys => ({ ...NO_KEYS, ...keys });
const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent(type, init));

describe("startGestureKeys", () => {
    let gesture: GestureKeys | undefined;
    afterEach(() => gesture?.dispose());

    it("reads the held roles at the press", () => {
        gesture = startGestureKeys({
            context: "field",
            press: held({ shift: true, meta: true }),
            isMac: true,
            track: false,
        });
        expect(gesture.roles()).toEqual({
            fine: true,
            constrain: true,
            fromCenter: false,
        });
    });

    it("ignores a key the press used until it's released, then reads it when pressed again", () => {
        gesture = startGestureKeys({
            context: "field",
            press: held({ shift: true }),
            usedByPress: ["Shift"],
            isMac: true,
            track: false,
        });
        expect(gesture.roles().fine).toBe(false);
        expect(gesture.update(held({ shift: true }))).toBe(false);
        expect(gesture.roles().fine).toBe(false);

        expect(gesture.update(NO_KEYS)).toBe(false);
        expect(gesture.update(held({ shift: true }))).toBe(true);
        expect(gesture.roles().fine).toBe(true);
    });

    it("calls back when a key mid-drag changes the roles, without a pointer move", () => {
        const onRolesChange = vi.fn();
        gesture = startGestureKeys({
            context: "shape",
            press: held({ shift: true }),
            usedByPress: ["Shift"],
            onRolesChange,
            isMac: true,
        });
        key("keyup", { key: "Shift" });
        expect(onRolesChange).not.toHaveBeenCalled();

        key("keydown", { key: "Shift", shiftKey: true });
        expect(onRolesChange).toHaveBeenLastCalledWith({
            fine: true,
            constrain: false,
            fromCenter: false,
        });

        key("keydown", { key: "Alt", shiftKey: true, altKey: true });
        expect(onRolesChange).toHaveBeenLastCalledWith({
            fine: true,
            constrain: false,
            fromCenter: true,
        });
        expect(onRolesChange).toHaveBeenCalledTimes(2);
    });

    it("follows a key the pointer saw change before the keyboard did", () => {
        const onRolesChange = vi.fn();
        gesture = startGestureKeys({
            context: "field",
            press: NO_KEYS,
            onRolesChange,
            isMac: false,
        });
        // Ctrl goes down between the press and the drag; a pointer move reports it
        gesture.update(held({ ctrl: true }));
        expect(gesture.roles().constrain).toBe(true);

        key("keyup", { key: "Control" });
        expect(onRolesChange).toHaveBeenLastCalledWith({
            fine: false,
            constrain: false,
            fromCenter: false,
        });
        expect(gesture.roles().constrain).toBe(false);
    });

    it("drops every role on window blur", () => {
        const onRolesChange = vi.fn();
        gesture = startGestureKeys({
            context: "field",
            press: held({ shift: true }),
            onRolesChange,
            isMac: true,
        });
        window.dispatchEvent(new Event("blur"));
        expect(onRolesChange).toHaveBeenLastCalledWith({
            fine: false,
            constrain: false,
            fromCenter: false,
        });
    });

    it("ORs in the on-screen toggles", () => {
        gesture = startGestureKeys({
            context: "field",
            press: NO_KEYS,
            onScreen: () => new Set(["fine"]),
            track: false,
        });
        expect(gesture.roles().fine).toBe(true);
    });

    it("never blocks an on-screen toggle with the press rule: that's only for keys", () => {
        gesture = startGestureKeys({
            context: "field",
            press: held({ shift: true }),
            usedByPress: ["Shift"],
            onScreen: () => new Set(["fine"]),
            track: false,
        });
        expect(gesture.roles().fine).toBe(true);
    });

    it("calls back when an on-screen toggle changes the roles mid-drag, until disposed", () => {
        let on = new Set<"fine">();
        const listeners = new Set<() => void>();
        const toggle = (next: Set<"fine">) => {
            on = next;
            for (const changed of listeners) changed();
        };
        const onRolesChange = vi.fn();
        gesture = startGestureKeys({
            context: "shape",
            press: NO_KEYS,
            onScreen: () => on,
            onScreenChange: (changed) => {
                listeners.add(changed);
                return () => listeners.delete(changed);
            },
            onRolesChange,
            track: false,
        });
        toggle(new Set(["fine"]));
        expect(onRolesChange).toHaveBeenLastCalledWith({
            fine: true,
            constrain: false,
            fromCenter: false,
        });
        // A change that leaves the roles as they were calls nothing
        toggle(new Set(["fine"]));
        expect(onRolesChange).toHaveBeenCalledTimes(1);

        gesture.dispose();
        expect(listeners.size).toBe(0);
        toggle(new Set());
        expect(onRolesChange).toHaveBeenCalledTimes(1);
    });

    it("stops following the keyboard once disposed", () => {
        const onRolesChange = vi.fn();
        startGestureKeys({
            context: "field",
            press: NO_KEYS,
            onRolesChange,
            isMac: true,
        }).dispose();
        key("keydown", { key: "Shift", shiftKey: true });
        expect(onRolesChange).not.toHaveBeenCalled();
    });
});
