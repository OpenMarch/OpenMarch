import { describe, expect, it } from "vitest";
import {
    clipEdgeHitInside,
    distanceToRect,
    pickTouchTarget,
    TOUCH_HIT_SIZE,
    touchGrabOffset,
    type TouchHitCandidate,
    type TouchRect,
} from "../touchTargets";

/** A target drawn `width` wide at `x` (centered), with a 44px hit area around it */
const target = (
    key: string,
    x: number,
    {
        width = 4,
        selected = false,
        group,
    }: { width?: number; selected?: boolean; group?: string } = {},
): TouchHitCandidate<string> => {
    const drawn: TouchRect = {
        left: x - width / 2,
        right: x + width / 2,
        top: 40,
        bottom: 60,
    };
    return {
        key,
        drawn,
        hit: {
            left: x - TOUCH_HIT_SIZE / 2,
            right: x + TOUCH_HIT_SIZE / 2,
            top: 28,
            bottom: 72,
        },
        selected,
        group,
    };
};

describe("pickTouchTarget", () => {
    it("takes a press inside a target's hit area, off the target as drawn", () => {
        expect(pickTouchTarget(118, 50, [target("flag", 100)])).toBe("flag");
        expect(pickTouchTarget(82, 50, [target("flag", 100)])).toBe("flag");
    });

    it("leaves a press outside every hit area where it landed", () => {
        expect(pickTouchTarget(123, 50, [target("flag", 100)])).toBeNull();
        expect(pickTouchTarget(100, 20, [target("flag", 100)])).toBeNull();
        expect(pickTouchTarget(100, 50, [])).toBeNull();
    });

    it("gives overlapping hit areas' press to the nearest target as drawn", () => {
        const targets = [target("grip", 100), target("loop end", 130)];
        expect(pickTouchTarget(110, 50, targets)).toBe("grip");
        expect(pickTouchTarget(120, 50, targets)).toBe("loop end");
        // Order doesn't decide while one is nearer
        expect(pickTouchTarget(110, 50, [...targets].reverse())).toBe("grip");
    });

    it("gives it to the selected object's target, even when another is nearer", () => {
        const targets = [
            target("grip", 100),
            target("selected grip", 120, { selected: true }),
        ];
        expect(pickTouchTarget(105, 50, targets)).toBe("selected grip");
        // Outside the selected one's hit area, the other takes it
        expect(pickTouchTarget(90, 50, targets)).toBe("grip");
    });

    it("gives a press right on a target to it, over the selected object's hit area (a line on a flag wins)", () => {
        const targets = [
            target("selected grip", 100, { selected: true }),
            target("start flag", 104),
        ];
        // Right on the start flag's line, inside the selected grip's hit area
        expect(pickTouchTarget(104, 50, targets)).toBe("start flag");
        // `on`: inside the target's own button, though off its drawn line
        expect(
            pickTouchTarget(108, 50, [
                targets[0]!,
                { ...target("playhead", 112), on: true },
            ]),
        ).toBe("playhead");
        // Off both, the selected one wins
        expect(pickTouchTarget(109, 50, targets)).toBe("selected grip");
    });

    it("still gives a press off every target to the selected one", () => {
        const targets = [
            target("grip", 100),
            target("selected grip", 120, { selected: true }),
        ];
        // Outside the selected one's hit area, the other takes it
        expect(pickTouchTarget(90, 50, targets)).toBe("grip");
    });

    it("breaks a tie for the one on top (later in paint order)", () => {
        const targets = [target("start flag", 100), target("playhead", 100)];
        expect(pickTouchTarget(110, 50, targets)).toBe("playhead");
    });

    it("leaves a press on a clip's body to that clip, except for its own targets and targets as drawn", () => {
        const targets = [
            target("other clip's edge", 100, {
                selected: true,
                group: "clip:2",
            }),
            target("flag", 112),
        ];
        // On clip 1's body, inside both hit areas but off both targets as drawn
        expect(pickTouchTarget(106, 50, targets, "clip:1")).toBeNull();
        // Right on the flag's line, which crosses the clip
        expect(pickTouchTarget(112, 50, targets, "clip:1")).toBe("flag");
        // On clip 2's own body, its edge reaches in
        expect(pickTouchTarget(106, 50, targets, "clip:2")).toBe(
            "other clip's edge",
        );
    });
});

describe("distanceToRect", () => {
    const rect = { left: 10, right: 20, top: 10, bottom: 20 };
    it("is 0 inside and the straight distance outside", () => {
        expect(distanceToRect(rect, 15, 15)).toBe(0);
        expect(distanceToRect(rect, 25, 15)).toBe(5);
        expect(distanceToRect(rect, 23, 24)).toBe(5);
    });
});

describe("clipEdgeHitInside", () => {
    it("reaches half the hit area into a long clip", () => {
        expect(clipEdgeHitInside(300, 6)).toBe(22);
    });
    it("reaches at most a third into a short clip, so its middle still moves it", () => {
        expect(clipEdgeHitInside(45, 6)).toBe(15);
        expect(clipEdgeHitInside(30, 6)).toBe(10);
    });
    it("never reaches less than the drawn handle", () => {
        expect(clipEdgeHitInside(12, 3)).toBe(4);
        expect(clipEdgeHitInside(8, 2)).toBe(2);
    });
});

describe("touchGrabOffset", () => {
    it("keeps a finger's offset from the target it grabbed", () => {
        expect(touchGrabOffset("touch", 118, 100)).toBe(-18);
        expect(touchGrabOffset("touch", 84, 100)).toBe(16);
    });
    it("keeps a pen's offset in the touch layout, where the hit areas take it too", () => {
        expect(touchGrabOffset("pen", 118, 100, true)).toBe(-18);
    });
    it("is 0 for a mouse, and for a pen in the mouse layout, as before", () => {
        expect(touchGrabOffset("mouse", 104, 100, true)).toBe(0);
        expect(touchGrabOffset("mouse", 104, 100, false)).toBe(0);
        expect(touchGrabOffset("pen", 104, 100, false)).toBe(0);
    });
});
