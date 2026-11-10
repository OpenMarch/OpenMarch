// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    CONTROL_SCHEME_STORAGE_KEY,
    dragAction,
    loadControlScheme,
    parseControlScheme,
    saveControlScheme,
    wheelAction,
} from "../controlScheme";

const press = (over = {}) => ({
    pointerType: "mouse",
    buttons: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...over,
});
const wheel = (over = {}) => ({
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
});

function memoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
    } as Storage;
}

describe("the saved control scheme", () => {
    it("is map until someone chooses otherwise", () => {
        expect(loadControlScheme(memoryStorage())).toBe("map");
    });

    it("remembers the choice", () => {
        const storage = memoryStorage();
        saveControlScheme("trackpad", storage);
        expect(storage.getItem(CONTROL_SCHEME_STORAGE_KEY)).toBe("trackpad");
        expect(loadControlScheme(storage)).toBe("trackpad");
    });

    it("falls back to map for a value it doesn't know", () => {
        expect(parseControlScheme("standard")).toBe("map");
    });
});

describe("dragging in map", () => {
    it("pans on a plain drag", () => {
        expect(dragAction("map", press())).toBe("pan");
    });

    it.each([
        ["Ctrl", { ctrlKey: true }],
        ["Alt or Option", { altKey: true }],
        ["Cmd", { metaKey: true }],
        ["Shift", { shiftKey: true }],
        ["the right button", { buttons: 2 }],
    ])("orbits with %s", (_name, over) => {
        expect(dragAction("map", press(over))).toBe("orbit");
    });
});

describe("dragging in trackpad", () => {
    it("orbits on a plain drag", () => {
        expect(dragAction("trackpad", press())).toBe("orbit");
    });

    it("pans with Shift or the right button", () => {
        expect(dragAction("trackpad", press({ shiftKey: true }))).toBe("pan");
        expect(dragAction("trackpad", press({ buttons: 2 }))).toBe("pan");
    });

    it("orbits with Ctrl or Option, even when a Mac reports Ctrl-click as the right button", () => {
        expect(dragAction("trackpad", press({ altKey: true }))).toBe("orbit");
        expect(
            dragAction("trackpad", press({ ctrlKey: true, buttons: 2 })),
        ).toBe("orbit");
    });
});

describe("touch and pen", () => {
    it.each(["touch", "pen"])(
        "orbit with %s in either scheme",
        (pointerType) => {
            expect(dragAction("map", press({ pointerType }))).toBe("orbit");
            expect(dragAction("trackpad", press({ pointerType }))).toBe(
                "orbit",
            );
        },
    );
});

describe("scrolling", () => {
    it("zooms in map and orbits in trackpad", () => {
        expect(wheelAction("map", wheel())).toBe("zoom");
        expect(wheelAction("trackpad", wheel())).toBe("orbit");
    });

    it("zooms on a pinch in either scheme", () => {
        expect(wheelAction("map", wheel({ ctrlKey: true }))).toBe("pinch");
        expect(wheelAction("trackpad", wheel({ ctrlKey: true }))).toBe("pinch");
    });

    it("pans with Shift or Option in either scheme", () => {
        expect(wheelAction("map", wheel({ shiftKey: true }))).toBe("pan");
        expect(wheelAction("trackpad", wheel({ altKey: true }))).toBe("pan");
    });
});
