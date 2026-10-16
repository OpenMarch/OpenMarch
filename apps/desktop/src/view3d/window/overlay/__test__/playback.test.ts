import { describe, expect, it } from "vitest";
import { playbackActionForKey } from "../playback";

const key = (code: string, mods: Partial<Record<string, boolean>> = {}) => ({
    code,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
});

describe("speed keys", () => {
    it("] and [ hold double and half speed; with Shift they're nothing", () => {
        expect(playbackActionForKey(key("BracketRight"))).toBe(
            "holdFasterPlayback",
        );
        expect(playbackActionForKey(key("BracketLeft"))).toBe(
            "holdSlowerPlayback",
        );
        expect(
            playbackActionForKey(key("BracketRight", { shiftKey: true })),
        ).toBeNull();
    });
});

describe("playbackActionForKey", () => {
    it("uses the editor's shortcuts", () => {
        expect(playbackActionForKey(key("Space"))).toBe("playPause");
        expect(playbackActionForKey(key("KeyQ"))).toBe("previousPage");
        expect(playbackActionForKey(key("KeyE"))).toBe("nextPage");
        expect(playbackActionForKey(key("KeyQ", { shiftKey: true }))).toBe(
            "previousBeat",
        );
        expect(playbackActionForKey(key("KeyE", { shiftKey: true }))).toBe(
            "nextBeat",
        );
        expect(playbackActionForKey(key("KeyQ", { altKey: true }))).toBe(
            "firstPage",
        );
        expect(playbackActionForKey(key("KeyE", { altKey: true }))).toBe(
            "lastPage",
        );
        expect(playbackActionForKey(key("Home"))).toBe("firstPage");
        expect(playbackActionForKey(key("End"))).toBe("lastPage");
    });

    it("ignores other keys and modified presses", () => {
        expect(playbackActionForKey(key("KeyF"))).toBeNull();
        expect(playbackActionForKey(key("KeyE", { ctrlKey: true }))).toBeNull();
        expect(playbackActionForKey(key("KeyQ", { metaKey: true }))).toBeNull();
        expect(playbackActionForKey(key("Space", { altKey: true }))).toBeNull();
    });

    it("Shift+Space plays from the playhead, as in the editor", () => {
        expect(playbackActionForKey(key("Space", { shiftKey: true }))).toBe(
            "playPage",
        );
    });
});
