import { describe, expect, it } from "vitest";
import { initialPalmGuardState, palmGuardShouldBlock } from "../penPalmGuard";
import { paddingForMinimumBox } from "../touchSelectionHandles";
import { describeRotation, describeStepDelta } from "../dragStepReadout";
import { choosePillPosition, pillCandidates } from "../pillPlacement";
import { nextFieldDragMode, parseFieldDragMode } from "../fieldDragMode";
import { absoluteBounds } from "../touchHitTest";

describe("palmGuardShouldBlock", () => {
    const ev = (type: string, pointerType?: string, pointerId?: number) => ({
        type,
        pointerType,
        pointerId,
    });

    it("leaves fingers alone when no pen is down", () => {
        const s = initialPalmGuardState();
        expect(palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 0)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 1), 10)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("click", "touch", 1), 11)).toBe(
            false,
        );
    });

    it("swallows a finger press that starts while the pen is down, and its click", () => {
        const s = initialPalmGuardState();
        expect(palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 0)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 10)).toBe(
            true,
        );
        expect(palmGuardShouldBlock(s, ev("pointermove", "touch", 1), 20)).toBe(
            true,
        );
        // The pen's own events pass
        expect(palmGuardShouldBlock(s, ev("pointermove", "pen", 9), 25)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("pointerup", "pen", 9), 30)).toBe(
            false,
        );
        // The palm lifts after the pen: still swallowed, and the click it makes
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 1), 100)).toBe(
            true,
        );
        expect(palmGuardShouldBlock(s, ev("mousedown"), 110)).toBe(true);
        expect(palmGuardShouldBlock(s, ev("click", "touch", 1), 120)).toBe(
            true,
        );
        // Much later, clicks are normal again
        expect(palmGuardShouldBlock(s, ev("click", "touch", 2), 2000)).toBe(
            false,
        );
    });

    it("swallows the rest of a palm that was resting before the pen came down", () => {
        const s = initialPalmGuardState();
        expect(palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 0)).toBe(
            false,
        );
        palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 10);
        expect(palmGuardShouldBlock(s, ev("pointermove", "touch", 1), 15)).toBe(
            true,
        );
        palmGuardShouldBlock(s, ev("pointerup", "pen", 9), 20);
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 1), 100)).toBe(
            true,
        );
        expect(palmGuardShouldBlock(s, ev("click", "touch", 1), 110)).toBe(
            true,
        );
    });

    it("swallows a palm-sized contact even without a pen", () => {
        const s = initialPalmGuardState();
        const palm = {
            ...ev("pointerdown", "touch", 3),
            width: 84,
            height: 60,
        };
        expect(palmGuardShouldBlock(s, palm, 0)).toBe(true);
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 3), 50)).toBe(
            true,
        );
        expect(palmGuardShouldBlock(s, ev("click", "touch", 3), 60)).toBe(true);
        const finger = {
            ...ev("pointerdown", "touch", 4),
            width: 22,
            height: 22,
        };
        expect(palmGuardShouldBlock(s, finger, 2000)).toBe(false);
    });

    it("never blocks the pen's own click", () => {
        const s = initialPalmGuardState();
        palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 0);
        palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 5);
        expect(palmGuardShouldBlock(s, ev("click", "pen", 9), 50)).toBe(false);
    });
});

describe("paddingForMinimumBox", () => {
    it("pads a thin box up to the minimum on its short side", () => {
        expect(paddingForMinimumBox(300, 10, 48)).toBe(19);
    });
    it("leaves a big box alone", () => {
        expect(paddingForMinimumBox(300, 120, 48)).toBe(0);
    });
    it("handles bad sizes", () => {
        expect(paddingForMinimumBox(NaN, 10, 48)).toBe(0);
    });
});

describe("describeStepDelta", () => {
    const sides = { terseLeft: "S1", terseRight: "S2" };
    it("says how far, which side and front or back", () => {
        expect(describeStepDelta(4, -2, sides)).toBe(
            "4 steps to S2 · 2 steps toward the back",
        );
        expect(describeStepDelta(-1, 1, sides)).toBe(
            "1 step to S1 · 1 step toward the front",
        );
    });
    it("says 0 for no movement, and rounds to quarter steps", () => {
        expect(describeStepDelta(0.04, 2.49, sides)).toBe(
            "0 steps side to side · 2.5 steps toward the front",
        );
        expect(describeStepDelta(1.26, 0, sides)).toBe(
            "1.25 steps to S2 · 0 steps front to back",
        );
    });
});

describe("absoluteBounds", () => {
    const obj = (group: unknown) => ({
        group: group as any,
        getBoundingRect: () => ({ left: 1, top: 2, width: 3, height: 4 }),
        getCenterPoint: () => ({ x: -10, y: 5 }),
        getScaledWidth: () => 6,
        getScaledHeight: () => 4,
    });
    it("uses Fabric's bounds for an object on its own", () => {
        expect(absoluteBounds(obj(null))).toEqual({
            left: 1,
            top: 2,
            width: 3,
            height: 4,
        });
    });
    it("moves an object in a group out by the group's transform", () => {
        const group = { calcTransformMatrix: () => [1, 0, 0, 1, 100, 200] };
        expect(absoluteBounds(obj(group))).toEqual({
            left: 87,
            top: 203,
            width: 6,
            height: 4,
        });
    });
});

describe("describeRotation", () => {
    it("says the turn in whole degrees, the short way round", () => {
        expect(describeRotation(0, 15)).toBe("15°");
        expect(describeRotation(10, -20)).toBe("-30°");
        expect(describeRotation(350, 10)).toBe("20°");
        expect(describeRotation(10, 350)).toBe("-20°");
        expect(describeRotation(0, 0.3)).toBe("0°");
    });
});

describe("field drag mode", () => {
    it("reads a stored mode, defaulting to the box", () => {
        expect(parseFieldDragMode("lasso")).toBe("lasso");
        expect(parseFieldDragMode("pan")).toBe("pan");
        expect(parseFieldDragMode(null)).toBe("box");
        expect(parseFieldDragMode("nonsense")).toBe("box");
    });
    it("cycles box, lasso, pan", () => {
        expect(nextFieldDragMode("box")).toBe("lasso");
        expect(nextFieldDragMode("lasso")).toBe("pan");
        expect(nextFieldDragMode("pan")).toBe("box");
    });
});

describe("choosePillPosition", () => {
    const container = { width: 1000, height: 700 };
    const pill = { width: 300, height: 48 };

    it("prefers bottom-right, above the zoom buttons, when nothing is there", () => {
        const first = pillCandidates(container, pill)[0];
        expect(choosePillPosition(container, pill, null, [])).toEqual({
            left: first.left,
            bottom: first.bottom,
        });
    });

    it("moves away from marchers in the bottom-right", () => {
        const first = pillCandidates(container, pill)[0];
        const under = {
            x: first.left + 100,
            y: container.height - first.bottom - 20,
        };
        const chosen = choosePillPosition(container, pill, null, [under]);
        expect(chosen).not.toEqual({ left: first.left, bottom: first.bottom });
    });

    it("stays at the bottom even when the field fills it, if no marchers are there", () => {
        // The field covers the whole bottom; the top is free of field but far from thumbs
        const field = { left: 0, top: 200, width: 1000, height: 500 };
        const chosen = choosePillPosition(container, pill, field, []);
        expect(chosen.bottom).toBeLessThan(container.height / 2);
    });

    it("goes to the top only when every bottom spot covers marchers", () => {
        const marchers = pillCandidates(container, pill)
            .filter((c) => c.bottom < container.height / 2)
            .map((c) => ({
                x: c.left + 20,
                y: container.height - c.bottom - 20,
            }));
        const chosen = choosePillPosition(container, pill, null, marchers);
        expect(chosen.bottom).toBeGreaterThan(container.height / 2);
    });

    it("prefers a spot off the field drawing when the field leaves margin", () => {
        // The field fills the top 600 px; only the bottom strip is free
        const field = { left: 0, top: 0, width: 1000, height: 600 };
        const chosen = choosePillPosition(container, pill, field, []);
        const top = container.height - chosen.bottom - pill.height;
        expect(top).toBeGreaterThanOrEqual(600);
    });
});
