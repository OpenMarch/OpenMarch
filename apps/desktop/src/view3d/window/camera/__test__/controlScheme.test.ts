// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    CONTROL_SCHEME_STORAGE_KEY,
    dragAction,
    loadControlScheme,
    parseControlScheme,
    SCHEME_GESTURES,
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

    it("keeps an earlier choice of orbit", () => {
        const storage = memoryStorage();
        saveControlScheme("orbit", storage);
        expect(loadControlScheme(storage)).toBe("orbit");
    });

    it("falls back to map for a value it doesn't know", () => {
        expect(parseControlScheme("standard")).toBe("map");
    });
});

describe("dragging in orbit", () => {
    it("orbits on a plain drag", () => {
        expect(dragAction("orbit", press())).toBe("orbit");
    });

    it("pans with the right button or Shift", () => {
        expect(dragAction("orbit", press({ buttons: 2 }))).toBe("pan");
        expect(dragAction("orbit", press({ shiftKey: true }))).toBe("pan");
    });

    it("orbits with Ctrl, even when a Mac reports Ctrl-click as the right button", () => {
        expect(dragAction("orbit", press({ ctrlKey: true, buttons: 2 }))).toBe(
            "orbit",
        );
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
        "orbit with %s in every scheme",
        (pointerType) => {
            expect(dragAction("orbit", press({ pointerType }))).toBe("orbit");
            expect(dragAction("map", press({ pointerType }))).toBe("orbit");
            expect(dragAction("trackpad", press({ pointerType }))).toBe(
                "orbit",
            );
        },
    );
});

describe("scrolling", () => {
    it("zooms in orbit and map, and orbits in trackpad", () => {
        expect(wheelAction("orbit", wheel())).toBe("zoom");
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

// Checks each card's camera moves, not its input names: a browser can't tell a
// mouse wheel from a two-finger scroll, so "scroll" and "swipe" are the same event.
describe("the gestures the Controls picker shows", () => {
    const mouse = { drag: 1, rightDrag: 2 } as const;
    const wheels = {
        scroll: wheel(),
        swipe: wheel(),
        pinch: wheel({ ctrlKey: true }),
    } as const;
    const does = { pinch: "zoom", zoom: "zoom", orbit: "orbit", pan: "pan" };

    it.each(["orbit", "map", "trackpad"] as const)(
        "match what %s does",
        (scheme) => {
            for (const { input, move } of SCHEME_GESTURES[scheme]) {
                const got =
                    input === "drag" || input === "rightDrag"
                        ? dragAction(scheme, press({ buttons: mouse[input] }))
                        : does[wheelAction(scheme, wheels[input])];
                expect(got, `${scheme} ${input}`).toBe(move);
            }
            expect(SCHEME_GESTURES[scheme].map((g) => g.move).sort()).toEqual([
                "orbit",
                "pan",
                "zoom",
            ]);
        },
    );
});
