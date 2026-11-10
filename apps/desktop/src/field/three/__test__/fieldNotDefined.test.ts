// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FieldDimming } from "../fieldDimming";
import { DIMMED_OPACITY } from "../fieldDimming";
import {
    FieldNotDefined,
    NOT_DEFINED_EASE_MS,
    NOT_DEFINED_LOOK,
    drawnLabelBold,
    drawnNotDefined,
    notDefinedAmount,
    labelOpacity,
    labelWeight,
    type FadeClock,
} from "../fieldNotDefined";

/** A look where `ids` are Not defined and off a keyframe, as most tests need. */
const nd = (...ids: number[]) => ({
    notDefined: new Set(ids),
    offKeyframe: new Set(ids),
});

describe("FieldNotDefined", () => {
    it("marks the Not defined marchers, and nobody without a look", () => {
        const look = new FieldNotDefined();
        expect(look.isNotDefined(1)).toBe(false);
        look.set(nd(2));
        expect([1, 2].map((id) => look.isNotDefined(id))).toEqual([
            false,
            true,
        ]);
        look.set(null);
        expect(look.isNotDefined(2)).toBe(false);
    });

    it("changes nothing, and asks for no frame, when the look is the same", () => {
        const look = new FieldNotDefined();
        const listener = vi.fn();
        look.subscribe(listener);
        look.set(nd(1, 2));
        const version = look.version;
        // The playhead moves to another count with the same look
        look.set(nd(2, 1));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(look.version).toBe(version);
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
const drawn = (dimming: FieldDimming, look: FieldNotDefined, id: number) => ({
    amount: notDefinedAmount(dimming, look, id),
    label: labelWeight(dimming, look, id),
});

describe("easing into the look on Stop", () => {
    it("opens the gaps from solid, quickly at first, and ends at the full look", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const look = new FieldNotDefined(time.clock);
        look.set(nd(1), { ease: true });
        // Who's Not defined is known straight away: selecting doesn't wait
        expect(look.isNotDefined(1)).toBe(true);
        expect(drawnNotDefined(dimming, look, 1)).toBe(true);
        expect(drawn(dimming, look, 1)).toEqual({ amount: 0, label: 0 });
        time.frame(NOT_DEFINED_EASE_MS / 2);
        // Ease-out: past halfway at half the time, the label thinning with the dashes
        const middle = drawn(dimming, look, 1);
        expect(middle.amount).toBeGreaterThan(0.5);
        expect(middle.amount).toBeLessThan(1);
        expect(middle.label).toBeCloseTo(
            NOT_DEFINED_LOOK.labelThinning * middle.amount,
        );
        // The label stays at full opacity all the way
        expect(labelOpacity(dimming, 1)).toBe(1);
        time.frame(NOT_DEFINED_EASE_MS / 2);
        expect(drawn(dimming, look, 1)).toEqual({
            amount: 1,
            label: NOT_DEFINED_LOOK.labelThinning,
        });
        expect(time.waiting).toBe(false);
    });

    it("redraws the layers on each frame of the ease", () => {
        const time = manualClock();
        const look = new FieldNotDefined(time.clock);
        const listener = vi.fn();
        look.subscribe(listener);
        look.set(nd(1), { ease: true });
        const version = look.version;
        time.frame(16);
        expect(look.version).toBeGreaterThan(version);
        expect(listener.mock.calls.length).toBeGreaterThan(1);
    });

    it("goes solid at once when playback starts again mid-ease", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const look = new FieldNotDefined(time.clock);
        look.set(nd(1), { ease: true });
        time.frame(16);
        look.set(null);
        expect(drawn(dimming, look, 1)).toEqual({ amount: 0, label: 0 });
        expect(time.waiting).toBe(false);
    });

    it("keeps easing when who's Not defined changes mid-ease, as Stop's jump back does", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const look = new FieldNotDefined(time.clock);
        look.set(nd(1), { ease: true });
        time.frame(16);
        look.set(nd(1, 2));
        expect(notDefinedAmount(dimming, look, 2)).toBeLessThan(1);
        time.frame(NOT_DEFINED_EASE_MS);
        expect(notDefinedAmount(dimming, look, 2)).toBe(1);
    });

    it("draws the full look straight away without an ease (scrubbing, opening a show)", () => {
        const time = manualClock();
        const dimming = new FieldDimming();
        const look = new FieldNotDefined(time.clock);
        look.set(nd(1));
        expect(drawn(dimming, look, 1)).toEqual({
            amount: 1,
            label: NOT_DEFINED_LOOK.labelThinning,
        });
        expect(time.waiting).toBe(false);
    });

    it("leaves a dimmed marcher to isolation's dim, never dashed", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        dimming.set(new Set([1]));
        look.set(nd(1, 2));
        expect(notDefinedAmount(dimming, look, 2)).toBe(0);
        expect(notDefinedAmount(dimming, look, 1)).toBe(1);
    });
});

describe("a marcher's drawn look", () => {
    it("is isolation's dim when dimmed, whether or not it is Not defined", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        dimming.set(new Set([1]));
        look.set(nd(1, 2, 3));
        expect(drawnNotDefined(dimming, look, 1)).toBe(true);
        expect(drawnNotDefined(dimming, look, 2)).toBe(false);
    });

    it("is solid when decided", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        look.set(nd(2));
        expect(drawnNotDefined(dimming, look, 1)).toBe(false);
    });

    it("draws a walking or Held marcher solid, with its label lighter off a keyframe", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        // 1 arrives on this count, 2 walks or is Held, 3 is Not defined
        look.set({ notDefined: new Set([3]), offKeyframe: new Set([2, 3]) });
        expect(
            [1, 2, 3].map((id) => drawnNotDefined(dimming, look, id)),
        ).toEqual([false, false, true]);
        expect(
            [1, 2, 3].map((id) => drawnLabelBold(dimming, look, id)),
        ).toEqual([true, false, false]);
        expect(notDefinedAmount(dimming, look, 2)).toBe(0);
        expect(labelWeight(dimming, look, 2)).toBe(
            NOT_DEFINED_LOOK.labelThinning,
        );
    });

    it("redraws when only who's on a keyframe changes", () => {
        const look = new FieldNotDefined();
        const listener = vi.fn();
        look.subscribe(listener);
        look.set({ notDefined: new Set(), offKeyframe: new Set([1]) });
        look.set({ notDefined: new Set(), offKeyframe: new Set() });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("draws everyone solid and bold with no look (playing, exports)", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        look.set(nd(1));
        look.set(null);
        expect(drawnNotDefined(dimming, look, 1)).toBe(false);
        expect(drawnLabelBold(dimming, look, 1)).toBe(true);
        expect(labelWeight(dimming, look, 1)).toBe(0);
    });

    it("draws a label off a keyframe lighter in weight at full opacity; dim wins", () => {
        const dimming = new FieldDimming();
        const look = new FieldNotDefined();
        // FieldDimming's set is who stays bright: 4 is outside the isolated move
        dimming.set(new Set([1, 2, 3]));
        look.set(nd(2, 3, 4));
        // On a keyframe: bold, solid
        expect(labelWeight(dimming, look, 1)).toBe(0);
        expect(labelOpacity(dimming, 1)).toBe(1);
        // Off a keyframe: lighter, still opaque
        expect(labelWeight(dimming, look, 3)).toBe(
            NOT_DEFINED_LOOK.labelThinning,
        );
        expect(labelOpacity(dimming, 3)).toBe(1);
        // Dimmed and off a keyframe: isolation's dim, at the keyframe weight
        expect(labelWeight(dimming, look, 4)).toBe(0);
        expect(labelOpacity(dimming, 4)).toBe(DIMMED_OPACITY);
        expect(NOT_DEFINED_LOOK.labelThinning).toBeGreaterThan(0);
    });

    it("dashes the edge at least 2 px wide round a 60% fill, solid corners", () => {
        expect(NOT_DEFINED_LOOK.fillOpacity).toBe(0.6);
        expect(NOT_DEFINED_LOOK.edgeWidth).toBeGreaterThanOrEqual(1.5);
        expect(NOT_DEFINED_LOOK.edgeWidth).toBeLessThanOrEqual(2);
        expect(NOT_DEFINED_LOOK.minEdgePx).toBe(2);
        expect(NOT_DEFINED_LOOK.circleDashes).toBe(8);
    });
});
