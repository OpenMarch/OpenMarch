import { afterEach, describe, expect, it } from "vitest";
import {
    isNudgeKey,
    isTimelineOwnKey,
    skipsAppNudge,
    spaceStaysPlay,
} from "../timelineHotkeys";

/**
 * UI-14 round-2 review: on the timeline's move controls Enter and the arrows are theirs, never the
 * app's shortcuts; Space always plays, without pressing the focused control.
 */

afterEach(() => {
    document.body.innerHTML = "";
});

/** A key press; letters are pressed where QWERTY has them unless `code` says otherwise */
const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
    key: k,
    code: /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
});

describe("isTimelineOwnKey", () => {
    it("takes Enter, the arrows and WASD inside a move control, and nothing else", () => {
        document.body.innerHTML = `<section data-timeline-own-keys="true"><button id="in">Delete move</button></section><button id="out">Other</button>`;
        const inside = document.getElementById("in");
        const outside = document.getElementById("out");
        for (const k of ["Enter", "ArrowUp", "ArrowLeft", "w", "D"])
            expect(isTimelineOwnKey(key(k), inside)).toBe(true);
        // Space plays, and the app's other shortcuts still work there
        for (const k of [" ", "g", "Delete", "z"])
            expect(isTimelineOwnKey(key(k), inside)).toBe(false);
        // Ctrl+S, Cmd+A: their shortcuts run (the app skips the nudge, skipsAppNudge)
        expect(isTimelineOwnKey(key("s", { ctrlKey: true }), inside)).toBe(
            false,
        );
        expect(isTimelineOwnKey(key("a", { metaKey: true }), inside)).toBe(
            false,
        );
        // Alt+WASD is a nudge without snapping
        expect(isTimelineOwnKey(key("w", { altKey: true }), inside)).toBe(true);
        // Elsewhere, the app keeps all of them
        expect(isTimelineOwnKey(key("Enter"), outside)).toBe(false);
        expect(isTimelineOwnKey(key("Enter"), null)).toBe(false);
    });
});

describe("isTimelineOwnKey on a button Space presses (pre-merge review)", () => {
    it("takes Enter and Space on a with-space button; Space still plays on other move controls", () => {
        document.body.innerHTML = `<button id="keep" data-timeline-own-keys="with-space">Keep here</button><section data-timeline-own-keys="true"><button id="clip">Move 1</button></section>`;
        const keep = document.getElementById("keep");
        const clip = document.getElementById("clip");
        expect(isTimelineOwnKey(key("Enter"), keep)).toBe(true);
        expect(isTimelineOwnKey(key(" "), keep)).toBe(true);
        // Ctrl+Space, and Space on the move controls, are still the app's
        expect(isTimelineOwnKey(key(" ", { ctrlKey: true }), keep)).toBe(false);
        expect(isTimelineOwnKey(key(" "), clip)).toBe(false);
        // K, G and the rest still reach the app
        expect(isTimelineOwnKey(key("k"), keep)).toBe(false);
    });
});

describe("isTimelineOwnKey on other keyboard layouts", () => {
    it("matches WASD by physical key, as the app's nudge does", () => {
        document.body.innerHTML = `<section data-timeline-own-keys="true"><button id="in">Move 1</button></section>`;
        const inside = document.getElementById("in");
        // A French layout: the key where QWERTY has A types "q", and the app nudges left by its code
        expect(isTimelineOwnKey(key("q", { code: "KeyA" }), inside)).toBe(true);
        expect(isTimelineOwnKey(key("z", { code: "KeyW" }), inside)).toBe(true);
        // On a French layout, "a" sits on KeyQ, which nudges nothing
        expect(isTimelineOwnKey(key("a", { code: "KeyQ" }), inside)).toBe(
            false,
        );
        // Numpad arrows with Num Lock off
        expect(
            isTimelineOwnKey(key("ArrowUp", { code: "Numpad8" }), inside),
        ).toBe(true);
    });
});

describe("Ctrl+WASD on a move control (code review)", () => {
    it("is a nudge, as the app's nudge matches it, and only Cmd makes WASD something else", () => {
        expect(isNudgeKey(key("s", { ctrlKey: true }))).toBe(true);
        expect(isNudgeKey(key("a", { ctrlKey: true }))).toBe(true);
        expect(isNudgeKey(key("w", { altKey: true }))).toBe(true);
        expect(isNudgeKey(key("s", { metaKey: true }))).toBe(false);
        expect(isNudgeKey(key("ArrowUp", { metaKey: true }))).toBe(true);
        expect(isNudgeKey(key("g", { ctrlKey: true }))).toBe(false);
    });

    it("on a move control the app's nudge skips it, while Ctrl+S and Ctrl+A still reach their shortcuts", () => {
        document.body.innerHTML = `<section data-timeline-own-keys="true"><button id="in">Move 1</button></section><button id="out">Other</button>`;
        const inside = document.getElementById("in");
        const outside = document.getElementById("out");
        for (const mods of [{ ctrlKey: true }, {}]) {
            for (const k of ["s", "a", "w", "d"])
                expect(skipsAppNudge(key(k, mods), inside)).toBe(true);
        }
        // The control doesn't take Ctrl+S or Ctrl+A for itself: save and select all still run
        expect(isTimelineOwnKey(key("s", { ctrlKey: true }), inside)).toBe(
            false,
        );
        expect(isTimelineOwnKey(key("a", { ctrlKey: true }), inside)).toBe(
            false,
        );
        // Elsewhere the nudge works as before
        expect(skipsAppNudge(key("s", { ctrlKey: true }), outside)).toBe(false);
        expect(skipsAppNudge(key("ArrowUp"), outside)).toBe(false);
        expect(skipsAppNudge(key("ArrowUp"), null)).toBe(false);
    });
});

describe("spaceStaysPlay", () => {
    it("cancels Space's click on a control, but not typing in a field", () => {
        document.body.innerHTML = `<button id="b">x</button><input id="i" />`;
        const event = (target: Element, k = " ") => {
            let prevented = false;
            spaceStaysPlay({
                key: k,
                target,
                preventDefault: () => {
                    prevented = true;
                },
            });
            return prevented;
        };
        expect(event(document.getElementById("b")!)).toBe(true);
        expect(event(document.getElementById("i")!)).toBe(false);
        expect(event(document.getElementById("b")!, "Enter")).toBe(false);
    });
});
