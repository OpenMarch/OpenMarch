import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    isModifierHeld,
    MODIFIER_RELEASE_GRACE_MS,
    resetModifierGrace,
    wasJustReleased,
} from "../modifierGrace";

const key = (type: "keydown" | "keyup", keyName: string) =>
    window.dispatchEvent(new KeyboardEvent(type, { key: keyName }));

describe("modifier release grace", () => {
    let now = 1000;
    beforeEach(() => {
        now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        resetModifierGrace();
    });
    afterEach(() => vi.restoreAllMocks());

    it("counts a key that's down on the event", () => {
        expect(isModifierHeld({ altKey: true }, "alt")).toBe(true);
        expect(isModifierHeld({ altKey: false }, "alt")).toBe(false);
    });

    it("counts a key let go just before, until the grace runs out", () => {
        key("keyup", "Alt");
        now += MODIFIER_RELEASE_GRACE_MS - 1;
        expect(isModifierHeld({ altKey: false }, "alt")).toBe(true);
        now += 1;
        expect(isModifierHeld({ altKey: false }, "alt")).toBe(false);
    });

    it("keeps each key's release apart", () => {
        key("keyup", "Shift");
        expect(wasJustReleased("shift")).toBe(true);
        expect(wasJustReleased("alt")).toBe(false);
        expect(wasJustReleased("meta")).toBe(false);
    });

    it("reads Control and Meta as ctrl and meta", () => {
        key("keyup", "Control");
        key("keyup", "Meta");
        expect(isModifierHeld({ ctrlKey: false }, "ctrl")).toBe(true);
        expect(isModifierHeld({ metaKey: false }, "meta")).toBe(true);
    });

    it("forgets a release when the key goes down again", () => {
        key("keyup", "Shift");
        key("keydown", "Shift");
        expect(wasJustReleased("shift")).toBe(false);
    });

    it("forgets a release at the next press, so it never leaks into a new gesture", () => {
        key("keyup", "Alt");
        window.dispatchEvent(new Event("pointerdown"));
        expect(wasJustReleased("alt")).toBe(false);
    });

    it("forgets every release when the window loses focus", () => {
        key("keyup", "Shift");
        window.dispatchEvent(new Event("blur"));
        expect(wasJustReleased("shift")).toBe(false);
    });

    it("ignores keys that aren't modifiers", () => {
        key("keyup", "a");
        expect(wasJustReleased("shift")).toBe(false);
    });
});
