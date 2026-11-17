import { describe, expect, it } from "vitest";
import { touchPlayVariants } from "../touchPlayMenu";
import { speedTapOpensPopover } from "../PlaybackSpeedButton";

const actions = (input: Parameters<typeof touchPlayVariants>[0]) =>
    touchPlayVariants(input).map((row) => row.action);

describe("touchPlayVariants", () => {
    it("stopped in Expert: Play, Play on and Play from the playhead, in the guide's order", () => {
        expect(
            touchPlayVariants({
                isPlaying: false,
                playsOn: true,
                fromPlayhead: true,
                playOnly: false,
            }),
        ).toEqual([
            { mode: "play", action: "playPause" },
            { mode: "alt", action: "playOn" },
            { mode: "shift", action: "playPage" },
        ]);
    });

    it("stopped in Basic: no Play on, since Basic's Play already plays on", () => {
        expect(
            actions({
                isPlaying: false,
                playsOn: false,
                fromPlayhead: true,
                playOnly: false,
            }),
        ).toEqual(["playPause", "playPage"]);
    });

    it("playing: Stop and go back, and Pause here (Shift+Space); never Play on", () => {
        expect(
            touchPlayVariants({
                isPlaying: true,
                playsOn: true,
                fromPlayhead: true,
                playOnly: false,
            }),
        ).toEqual([
            { mode: "play", action: "playPause" },
            { mode: "shift", action: "playPage" },
        ]);
    });

    it("no menu where a long press would only repeat the tap (Preview) or in tempo mode", () => {
        // Preview: no Shift or Alt variants
        expect(
            actions({
                isPlaying: false,
                playsOn: false,
                fromPlayhead: false,
                playOnly: false,
            }),
        ).toEqual([]);
        expect(
            actions({
                isPlaying: true,
                playsOn: false,
                fromPlayhead: false,
                playOnly: false,
            }),
        ).toEqual([]);
        // Tempo mode: one Play
        expect(
            actions({
                isPlaying: false,
                playsOn: true,
                fromPlayhead: true,
                playOnly: true,
            }),
        ).toEqual([]);
    });
});

describe("speedTapOpensPopover", () => {
    it("opens the speed popover for a finger or a pen; a mouse click still steps", () => {
        expect(speedTapOpensPopover("touch")).toBe(true);
        expect(speedTapOpensPopover("pen")).toBe(true);
        expect(speedTapOpensPopover("mouse")).toBe(false);
        // A keyboard's click has no pointer
        expect(speedTapOpensPopover(undefined)).toBe(false);
    });
});
