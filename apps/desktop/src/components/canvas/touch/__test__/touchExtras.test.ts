import { describe, expect, it } from "vitest";
import { initialPalmGuardState, palmGuardShouldBlock } from "../penPalmGuard";
import { choosePillPosition, pillCandidates } from "../pillPlacement";
import {
    fieldDragAction,
    migrateFieldDragMode,
    nextFieldDragMode,
    parseFieldDragMode,
} from "../fieldDragMode";
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

    it("lets the pen's own mouse events and click through while a resting palm's are dropped", () => {
        const s = initialPalmGuardState();
        // The palm lands first, then the pen presses a button
        palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 0);
        expect(palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 100)).toBe(
            false,
        );
        // The pen's mousedown (no pointer type on a MouseEvent) right after
        expect(palmGuardShouldBlock(s, ev("mousedown"), 101)).toBe(false);
        expect(palmGuardShouldBlock(s, ev("pointerup", "pen", 9), 200)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("mouseup"), 201)).toBe(false);
        expect(palmGuardShouldBlock(s, ev("click"), 202)).toBe(false);
        // A second pen press, palm still resting: same again
        palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 400);
        expect(palmGuardShouldBlock(s, ev("mousedown"), 400)).toBe(false);
        palmGuardShouldBlock(s, ev("pointerup", "pen", 9), 450);
        expect(palmGuardShouldBlock(s, ev("mouseup"), 451)).toBe(false);
        expect(palmGuardShouldBlock(s, ev("click"), 452)).toBe(false);
        // The palm lifts: its own mouse events and click are dropped
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 1), 900)).toBe(
            true,
        );
        expect(palmGuardShouldBlock(s, ev("mousedown"), 905)).toBe(true);
        expect(palmGuardShouldBlock(s, ev("mouseup"), 906)).toBe(true);
        expect(palmGuardShouldBlock(s, ev("click"), 907)).toBe(true);
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

    it("lets a finger through whatever size the browser reports for it", () => {
        // Safari on a real iPad reports a fingertip as 40-50 px wide
        const s = initialPalmGuardState();
        const finger = {
            ...ev("pointerdown", "touch", 3),
            width: 48,
            height: 48,
        };
        expect(palmGuardShouldBlock(s, finger, 0)).toBe(false);
        expect(palmGuardShouldBlock(s, ev("pointerup", "touch", 3), 50)).toBe(
            false,
        );
        expect(palmGuardShouldBlock(s, ev("click", "touch", 3), 60)).toBe(
            false,
        );
    });

    it("never blocks the pen's own click", () => {
        const s = initialPalmGuardState();
        palmGuardShouldBlock(s, ev("pointerdown", "pen", 9), 0);
        palmGuardShouldBlock(s, ev("pointerdown", "touch", 1), 5);
        expect(palmGuardShouldBlock(s, ev("click", "pen", 9), 50)).toBe(false);
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

describe("field drag mode", () => {
    it("reads a stored mode, defaulting to Auto", () => {
        expect(parseFieldDragMode("lasso")).toBe("lasso");
        expect(parseFieldDragMode("pan")).toBe("pan");
        expect(parseFieldDragMode(null)).toBe("auto");
        expect(parseFieldDragMode("nonsense")).toBe("auto");
    });
    it("reads the old default (Box) as Auto, once", () => {
        expect(migrateFieldDragMode("box", false)).toBe("auto");
        expect(migrateFieldDragMode("pan", false)).toBe("pan");
        expect(migrateFieldDragMode(null, false)).toBe("auto");
        // Chosen after the change: kept
        expect(migrateFieldDragMode("box", true)).toBe("box");
    });
    it("cycles auto, box, lasso, pan", () => {
        expect(nextFieldDragMode("auto")).toBe("box");
        expect(nextFieldDragMode("box")).toBe("lasso");
        expect(nextFieldDragMode("lasso")).toBe("pan");
        expect(nextFieldDragMode("pan")).toBe("auto");
    });
    it("Auto: a finger moves the view, a pen selects; overrides apply to both", () => {
        expect(fieldDragAction("auto", "touch")).toBe("pan");
        expect(fieldDragAction("auto", "pen")).toBe("box");
        for (const mode of ["box", "lasso", "pan"] as const) {
            expect(fieldDragAction(mode, "touch")).toBe(mode);
            expect(fieldDragAction(mode, "pen")).toBe(mode);
        }
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

describe("choosePillPosition and the zoom controls (tablet 1.7)", () => {
    const container = { width: 600, height: 400 };
    const pill = { width: 450, height: 48 };
    // The touch zoom controls: 6 px in from the bottom right, 170 × 99
    const zoom = {
        left: 600 - 6 - 170,
        top: 400 - 6 - 99,
        width: 170,
        height: 99,
    };

    it("never takes a spot over the zoom controls while one is clear of them", () => {
        const chosen = choosePillPosition(container, pill, null, [], [zoom]);
        const rect = {
            left: chosen.left,
            top: container.height - chosen.bottom - pill.height,
        };
        const clear =
            rect.left + pill.width <= zoom.left ||
            rect.top + pill.height <= zoom.top;
        expect(clear).toBe(true);
    });

    it("keeps off the controls even when every spot covers a marcher", () => {
        // Every spot clear of the controls covers a marcher; the pill still keeps off the controls
        const marchers = pillCandidates(container, pill).map((c) => ({
            x: c.left + 20,
            y: container.height - c.bottom - 20,
        }));
        const chosen = choosePillPosition(container, pill, null, marchers, [
            zoom,
        ]);
        const top = container.height - chosen.bottom - pill.height;
        expect(
            chosen.left + pill.width <= zoom.left ||
                top + pill.height <= zoom.top,
        ).toBe(true);
    });
});
