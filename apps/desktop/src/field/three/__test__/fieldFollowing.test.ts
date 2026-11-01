// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FieldDimming } from "../fieldDimming";
import { DIMMED_OPACITY } from "../fieldDimming";
import {
    FieldFollowing,
    FOLLOWING_EASE_MS,
    FOLLOWING_LOOK,
    drawnFollowing,
    followingAmount,
    labelOpacity,
    labelWeight,
    type FadeClock,
} from "../fieldFollowing";

describe("FieldFollowing", () => {
    it("marks the Following marchers, and nobody without a set", () => {
        const following = new FieldFollowing();
        expect(following.isFollowing(1)).toBe(false);
        following.set(new Set([2]));
        expect([1, 2].map((id) => following.isFollowing(id))).toEqual([
            false,
            true,
        ]);
        following.set(null);
        expect(following.isFollowing(2)).toBe(false);
    });

    it("changes nothing, and asks for no frame, when the same marchers follow", () => {
        const following = new FieldFollowing();
        const listener = vi.fn();
        following.subscribe(listener);
        following.set(new Set([1, 2]));
        const version = following.version;
        // The playhead moves to another count with the same Set marchers
        following.set(new Set([2, 1]));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(following.version).toBe(version);
    });
});

/** A clock the test steps by hand: frames run only when `frame` is called. */
function manualClock() {
    let now = 0;
    let pending: (() => void) | null = null;
    const clock: FadeClock = {
        now: () => now,
        requestFrame: (callback) => {
            pending = callback;
            return 1;
        },
        cancelFrame: () => {
            pending = null;
        },
    };
    return {
        clock,
        /** Moves time on by `ms` and runs the frame asked for, if any. */
        frame(ms: number) {
            now += ms;
            const run = pending;
            pending = null;
            run?.();
        },
        get waiting() {
            return pending !== null;
        },
    };
}

/** The look a marcher is drawn with: how far along the dashes, how much lighter its label. */
const look = (
    dimming: FieldDimming,
    following: FieldFollowing,
    id: number,
) => ({
    amount: followingAmount(dimming, following, id),
    label: labelWeight(dimming, following, id),
});

describe("easing into the Following look on Stop", () => {
    it("opens the gaps from solid, quickly at first, and ends at the full look", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const following = new FieldFollowing(time.clock);
        following.set(new Set([1]), { ease: true });
        // Who's Following is known straight away: selecting doesn't wait
        expect(following.isFollowing(1)).toBe(true);
        expect(drawnFollowing(dimming, following, 1)).toBe(true);
        expect(look(dimming, following, 1)).toEqual({ amount: 0, label: 0 });
        time.frame(FOLLOWING_EASE_MS / 2);
        // Ease-out: past halfway at half the time, the label thinning with the dashes
        const middle = look(dimming, following, 1);
        expect(middle.amount).toBeGreaterThan(0.5);
        expect(middle.amount).toBeLessThan(1);
        expect(middle.label).toBeCloseTo(
            FOLLOWING_LOOK.labelThinning * middle.amount,
        );
        // The label stays at full opacity all the way
        expect(labelOpacity(dimming, 1)).toBe(1);
        time.frame(FOLLOWING_EASE_MS / 2);
        expect(look(dimming, following, 1)).toEqual({
            amount: 1,
            label: FOLLOWING_LOOK.labelThinning,
        });
        expect(time.waiting).toBe(false);
    });

    it("redraws the layers on each frame of the ease", () => {
        const time = manualClock();
        const following = new FieldFollowing(time.clock);
        const listener = vi.fn();
        following.subscribe(listener);
        following.set(new Set([1]), { ease: true });
        const version = following.version;
        time.frame(16);
        expect(following.version).toBeGreaterThan(version);
        expect(listener.mock.calls.length).toBeGreaterThan(1);
    });

    it("goes solid at once when playback starts again mid-ease", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const following = new FieldFollowing(time.clock);
        following.set(new Set([1]), { ease: true });
        time.frame(16);
        following.set(null);
        expect(look(dimming, following, 1)).toEqual({ amount: 0, label: 0 });
        expect(time.waiting).toBe(false);
    });

    it("keeps easing when who's Following changes mid-ease, as Stop's jump back does", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const following = new FieldFollowing(time.clock);
        following.set(new Set([1]), { ease: true });
        time.frame(16);
        following.set(new Set([1, 2]));
        expect(followingAmount(dimming, following, 2)).toBeLessThan(1);
        time.frame(FOLLOWING_EASE_MS);
        expect(followingAmount(dimming, following, 2)).toBe(1);
    });

    it("draws the full look straight away without an ease (scrubbing, opening a show)", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const following = new FieldFollowing(time.clock);
        following.set(new Set([1]));
        expect(look(dimming, following, 1)).toEqual({
            amount: 1,
            label: FOLLOWING_LOOK.labelThinning,
        });
        expect(time.waiting).toBe(false);
    });

    it("leaves a dimmed marcher to isolation's dim, never dashed", () => {
        const dimming = new FieldDimming();
        const following = new FieldFollowing();
        dimming.set(new Set([1]));
        following.set(new Set([1, 2]));
        expect(followingAmount(dimming, following, 2)).toBe(0);
        expect(followingAmount(dimming, following, 1)).toBe(1);
    });
});

describe("a marcher's drawn look", () => {
    it("is isolation's dim when dimmed, whether or not it follows", () => {
        const dimming = new FieldDimming();
        const following = new FieldFollowing();
        dimming.set(new Set([1]));
        following.set(new Set([1, 2, 3]));
        expect(drawnFollowing(dimming, following, 1)).toBe(true);
        expect(drawnFollowing(dimming, following, 2)).toBe(false);
    });

    it("is solid when Set", () => {
        const dimming = new FieldDimming();
        const following = new FieldFollowing();
        following.set(new Set([2]));
        expect(drawnFollowing(dimming, following, 1)).toBe(false);
    });

    it("draws a Following label lighter in weight at full opacity; dim wins", () => {
        const dimming = new FieldDimming();
        const following = new FieldFollowing();
        // FieldDimming's set is who stays bright: 4 is outside the isolated move
        dimming.set(new Set([1, 2, 3]));
        following.set(new Set([2, 3, 4]));
        // Set: bold, solid
        expect(labelWeight(dimming, following, 1)).toBe(0);
        expect(labelOpacity(dimming, 1)).toBe(1);
        // Following: lighter, still solid
        expect(labelWeight(dimming, following, 3)).toBe(
            FOLLOWING_LOOK.labelThinning,
        );
        expect(labelOpacity(dimming, 3)).toBe(1);
        // Dimmed and Following: isolation's dim, at the Set weight
        expect(labelWeight(dimming, following, 4)).toBe(0);
        expect(labelOpacity(dimming, 4)).toBe(DIMMED_OPACITY);
        expect(FOLLOWING_LOOK.labelThinning).toBeGreaterThan(0);
    });

    it("dashes the edge at least 2 px wide round a 60% fill, solid corners", () => {
        expect(FOLLOWING_LOOK.fillOpacity).toBe(0.6);
        expect(FOLLOWING_LOOK.edgeWidth).toBeGreaterThanOrEqual(1.5);
        expect(FOLLOWING_LOOK.edgeWidth).toBeLessThanOrEqual(2);
        expect(FOLLOWING_LOOK.minEdgePx).toBe(2);
        expect(FOLLOWING_LOOK.circleDashes).toBe(8);
    });
});
