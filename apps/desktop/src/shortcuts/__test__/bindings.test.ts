/* cspell: disable */
import { describe, expect, it } from "vitest";
import {
    canonicalBinding,
    formatBinding,
    parseBinding,
    toTinykeys,
} from "../bindings";

describe("parseBinding", () => {
    it("orders modifiers canonically and upper-cases letters", () => {
        expect(parseBinding("shift+$mod+z")).toEqual({
            modifiers: ["$mod", "Shift"],
            key: "Z",
        });
    });

    it("accepts aliases", () => {
        expect(canonicalBinding("ctrl+option+up")).toBe("Control+Alt+ArrowUp");
        expect(canonicalBinding("cmd+esc")).toBe("Meta+Escape");
        expect(canonicalBinding("space")).toBe("Space");
    });

    it("dedupes modifiers", () => {
        expect(canonicalBinding("Shift+shift+A")).toBe("Shift+A");
    });

    it("throws on empty parts and unknown modifiers", () => {
        expect(() => parseBinding("")).toThrow();
        expect(() => parseBinding("Shift+")).toThrow();
        expect(() => parseBinding("Hyper+A")).toThrow(/Unknown modifier/);
    });
});

describe("toTinykeys", () => {
    it("maps letters and digits to event.code names", () => {
        expect(toTinykeys("Alt+V")).toBe("Alt+KeyV");
        expect(toTinykeys("1")).toBe("(Digit1|Numpad1)");
        expect(toTinykeys("$mod+Shift+Z")).toBe("$mod+Shift+KeyZ");
    });

    it("passes named keys through", () => {
        expect(toTinykeys("Shift+Enter")).toBe("Shift+Enter");
        expect(toTinykeys("Space")).toBe("Space");
        expect(toTinykeys("$mod+ArrowUp")).toBe("$mod+ArrowUp");
    });
});

describe("formatBinding", () => {
    it("uses symbols on macOS", () => {
        expect(formatBinding("$mod+Shift+Z", true)).toBe("⇧⌘Z");
        expect(formatBinding("Control+Alt+ArrowUp", true)).toBe("⌃⌥↑");
        expect(formatBinding("Enter", true)).toBe("↩");
    });

    it("uses words elsewhere", () => {
        expect(formatBinding("$mod+Shift+Z", false)).toBe("Ctrl+Shift+Z");
        expect(formatBinding("Alt+V", false)).toBe("Alt+V");
        expect(formatBinding("Escape", false)).toBe("Esc");
        expect(formatBinding("Space", false)).toBe("Space");
    });
});
/* cspell: enable */
