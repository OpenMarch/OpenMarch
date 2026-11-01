import { afterEach, describe, expect, it } from "vitest";
import { VERSION_A, type RoleMap } from "@/input/modifierRoles";
import { useTouchModifierStore } from "@/stores/TouchModifierStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { isSnapOff } from "../canvasModifiers";

/**
 * Whether a move snaps, for the touch gestures kept for the port: off with the Snap toggle off,
 * or with Fine on, from its key in the role map or from the pill.
 */

const keys = (held: Partial<Record<"shift" | "alt" | "ctrl", boolean>>) => ({
    shiftKey: held.shift ?? false,
    altKey: held.alt ?? false,
    ctrlKey: held.ctrl ?? false,
    metaKey: false,
});

afterEach(() => {
    useTouchModifierStore.getState().clear();
    useUiSettingsStore.getState().setSnap(true);
});

describe("isSnapOff", () => {
    it("snaps with nothing held and the Snap toggle on", () => {
        expect(isSnapOff()).toBe(false);
        expect(isSnapOff(keys({}))).toBe(false);
    });

    it("is off for every move with the Snap toggle off", () => {
        useUiSettingsStore.getState().setSnap(false);
        expect(isSnapOff()).toBe(true);
        expect(isSnapOff(keys({}))).toBe(true);
    });

    it("is off with Fine on the pill, held or latched", () => {
        useTouchModifierStore.getState().setHeld("fine", true);
        expect(isSnapOff()).toBe(true);
        useTouchModifierStore.getState().setHeld("fine", false);
        useTouchModifierStore.getState().toggleLatched("fine");
        expect(isSnapOff(keys({}))).toBe(true);
    });

    it("is off with Fine's key held (Shift in version A), and not with another role's", () => {
        expect(isSnapOff(keys({ shift: true }), { isMac: false })).toBe(true);
        expect(isSnapOff(keys({ ctrl: true }), { isMac: false })).toBe(false);
        expect(isSnapOff(keys({ alt: true }), { isMac: false })).toBe(false);
    });

    it("follows the role map, not Shift itself", () => {
        const fineOnAlt: RoleMap = {
            ...VERSION_A,
            field: { ...VERSION_A.field, fine: "Alt", fromCenter: "Shift" },
        };
        const opts = { map: fineOnAlt, isMac: false };
        expect(isSnapOff(keys({ shift: true }), opts)).toBe(false);
        expect(isSnapOff(keys({ alt: true }), opts)).toBe(true);
    });

    it("isn't Add: the pill's Add leaves snapping on", () => {
        useTouchModifierStore.getState().toggleLatched("add");
        expect(isSnapOff()).toBe(false);
    });
});
