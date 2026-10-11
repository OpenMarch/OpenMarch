import { describe, expect, it } from "vitest";
import { playbackActionForKey, transportState } from "../playback";

const pages = [
    { id: 10, order: 2 },
    { id: 7, order: 1 },
    { id: 3, order: 3 },
];

const key = (code: string, mods: Partial<Record<string, boolean>> = {}) => ({
    code,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
});

describe("transportState", () => {
    it("allows every step from a middle page while paused", () => {
        expect(transportState(pages, 10, false)).toEqual({
            playPause: true,
            previousPage: true,
            firstPage: true,
            nextPage: true,
            lastPage: true,
        });
    });

    it("sorts by order, not by id or array position", () => {
        const first = transportState(pages, 7, false);
        expect(first.previousPage).toBe(false);
        expect(first.nextPage).toBe(true);
        const last = transportState(pages, 3, false);
        expect(last.nextPage).toBe(false);
        expect(last.playPause).toBe(false);
        expect(last.previousPage).toBe(true);
    });

    it("allows only pause while playing", () => {
        expect(transportState(pages, 3, true)).toEqual({
            playPause: true,
            previousPage: false,
            firstPage: false,
            nextPage: false,
            lastPage: false,
        });
    });

    it("allows nothing without a selected page", () => {
        expect(Object.values(transportState(pages, null, false))).toEqual([
            false,
            false,
            false,
            false,
            false,
        ]);
        expect(Object.values(transportState([], 1, false))).not.toContain(true);
    });
});

describe("playbackActionForKey", () => {
    it("uses the editor's shortcuts", () => {
        expect(playbackActionForKey(key("Space"))).toBe("playPause");
        expect(playbackActionForKey(key("KeyQ"))).toBe("previousPage");
        expect(playbackActionForKey(key("KeyE"))).toBe("nextPage");
        expect(playbackActionForKey(key("KeyQ", { shiftKey: true }))).toBe(
            "firstPage",
        );
        expect(playbackActionForKey(key("KeyE", { shiftKey: true }))).toBe(
            "lastPage",
        );
    });

    it("ignores other keys and modified presses", () => {
        expect(playbackActionForKey(key("KeyF"))).toBeNull();
        expect(playbackActionForKey(key("KeyE", { ctrlKey: true }))).toBeNull();
        expect(playbackActionForKey(key("KeyQ", { metaKey: true }))).toBeNull();
        expect(playbackActionForKey(key("Space", { altKey: true }))).toBeNull();
        expect(
            playbackActionForKey(key("Space", { shiftKey: true })),
        ).toBeNull();
    });
});
