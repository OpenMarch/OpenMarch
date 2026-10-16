import { beforeEach, describe, expect, it } from "vitest";
import {
    effectivePlaybackSpeed,
    formatPlaybackSpeed,
    nextPlaybackSpeed,
    usePlaybackSpeedStore,
} from "../PlaybackSpeedStore";

beforeEach(() => usePlaybackSpeedStore.setState({ speed: 1, held: [] }));

describe("PlaybackSpeedStore", () => {
    it("a click steps through the common speeds and wraps", () => {
        const seen: number[] = [];
        for (let i = 0; i < 7; i++) {
            usePlaybackSpeedStore.getState().stepSpeed();
            seen.push(usePlaybackSpeedStore.getState().speed);
        }
        expect(seen).toEqual([1.5, 2, 4, 0.25, 0.5, 1, 1.5]);
    });

    it("steps back, and from an off-list speed to the nearest one that way", () => {
        expect(nextPlaybackSpeed(1, true)).toBe(0.5);
        expect(nextPlaybackSpeed(0.25, true)).toBe(4);
        expect(nextPlaybackSpeed(1.2)).toBe(1.5);
        expect(nextPlaybackSpeed(1.2, true)).toBe(1);
    });

    it("a held key doubles or halves the chosen speed, within the limits", () => {
        const { setSpeed, pressHold, releaseHold } =
            usePlaybackSpeedStore.getState();
        pressHold("faster");
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            2,
        );
        setSpeed(0.5);
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            1,
        );
        setSpeed(4);
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            8,
        );
        setSpeed(8);
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            8,
        );
        setSpeed(4);
        releaseHold("faster");
        pressHold("slower");
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            2,
        );
        releaseHold("slower");
        expect(effectivePlaybackSpeed(usePlaybackSpeedStore.getState())).toBe(
            4,
        );
    });

    it("letting go of the last key pressed goes back to the other one still held", () => {
        const { pressHold, releaseHold } = usePlaybackSpeedStore.getState();
        const speed = () =>
            effectivePlaybackSpeed(usePlaybackSpeedStore.getState());
        pressHold("faster");
        pressHold("slower");
        expect(speed()).toBe(0.5);
        releaseHold("slower");
        expect(speed()).toBe(2);
        releaseHold("faster");
        expect(speed()).toBe(1);
        // Released in the order pressed, the later key keeps its hold
        pressHold("faster");
        pressHold("slower");
        releaseHold("faster");
        expect(speed()).toBe(0.5);
    });

    it("clamps and formats", () => {
        usePlaybackSpeedStore.getState().setSpeed(10);
        expect(usePlaybackSpeedStore.getState().speed).toBe(8);
        expect(formatPlaybackSpeed(1)).toBe("1×");
        expect(formatPlaybackSpeed(0.25)).toBe("0.25×");
        expect(formatPlaybackSpeed(1.5)).toBe("1.5×");
    });
});
