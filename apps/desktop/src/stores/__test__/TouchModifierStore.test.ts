import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isShiftHeld,
    onScreenRoles,
    subscribeOnScreen,
    useTouchModifierStore,
} from "../TouchModifierStore";

/**
 * The touch pill's toggles: Fine, Equal (constrain) and From center are held roles, Add is the
 * press choice the Select tab reads as Shift. Each is on while held or once latched.
 */

const store = () => useTouchModifierStore.getState();

afterEach(() => store().clear());

describe("the role toggles", () => {
    it("are off to start with", () => {
        expect([...onScreenRoles()]).toEqual([]);
    });

    it.each(["fine", "constrain", "fromCenter"] as const)(
        "%s is on while held, and off again once let go",
        (role) => {
            store().setHeld(role, true);
            expect([...onScreenRoles()]).toEqual([role]);
            store().setHeld(role, false);
            expect([...onScreenRoles()]).toEqual([]);
        },
    );

    it.each(["fine", "constrain", "fromCenter"] as const)(
        "%s latched stays on until tapped again, held or not",
        (role) => {
            store().toggleLatched(role);
            expect(onScreenRoles().has(role)).toBe(true);
            store().setHeld(role, true);
            store().setHeld(role, false);
            expect(onScreenRoles().has(role)).toBe(true);
            store().toggleLatched(role);
            expect(onScreenRoles().has(role)).toBe(false);
        },
    );

    it("gives every role that's on, and never Add", () => {
        store().toggleLatched("fine");
        store().setHeld("fromCenter", true);
        store().toggleLatched("add");
        expect(new Set(onScreenRoles())).toEqual(
            new Set(["fine", "fromCenter"]),
        );
    });

    it("clear lets go of everything held or latched", () => {
        store().toggleLatched("fine");
        store().setHeld("constrain", true);
        store().toggleLatched("add");
        store().clear();
        expect([...onScreenRoles()]).toEqual([]);
        expect(isShiftHeld()).toBe(false);
    });

    it("tells a subscriber when a toggle changes, until it unsubscribes", () => {
        const changed = vi.fn();
        const stop = subscribeOnScreen(changed);
        store().toggleLatched("fine");
        expect(changed).toHaveBeenCalledTimes(1);
        stop();
        store().toggleLatched("fine");
        expect(changed).toHaveBeenCalledTimes(1);
    });
});

describe("Add, which the Select tab reads as Shift", () => {
    it("is Shift while held or latched, and a keyboard Shift still counts", () => {
        expect(isShiftHeld({ shiftKey: false })).toBe(false);
        expect(isShiftHeld({ shiftKey: true })).toBe(true);
        store().setHeld("add", true);
        expect(isShiftHeld({ shiftKey: false })).toBe(true);
        store().setHeld("add", false);
        store().toggleLatched("add");
        expect(isShiftHeld()).toBe(true);
    });

    it("isn't turned on by a role toggle", () => {
        store().toggleLatched("fine");
        store().toggleLatched("constrain");
        store().toggleLatched("fromCenter");
        expect(isShiftHeld()).toBe(false);
    });
});
