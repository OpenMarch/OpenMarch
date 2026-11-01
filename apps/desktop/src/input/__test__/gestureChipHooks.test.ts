import { afterEach, describe, expect, it, vi } from "vitest";
import { holdGesture } from "@/shapes/field/heldGesture";
import { NO_KEYS } from "../modifierRoles";
import { useGestureChipStore, type HonoredRoles } from "../gestureChipStore";
import { clearGestureChip } from "../gestureChipSync";

afterEach(() => {
    clearGestureChip();
});

const CORNER: HonoredRoles = {
    context: "shape",
    fine: "fine",
    constrain: "equalSpacings",
    snaps: true,
};

describe("gesture chip in holdGesture", () => {
    it("shows once the press is a drag, follows a role change, and clears on end", () => {
        const held = holdGesture(NO_KEYS, vi.fn(), [], false, {
            honored: CORNER,
            screen: () => ({ x: 3, y: 4 }),
        });
        held.move(NO_KEYS, null);
        expect(useGestureChipStore.getState().active).toBe(false);

        held.move({ ...NO_KEYS, shift: true }, { x: 3, y: 4 });
        expect(useGestureChipStore.getState()).toMatchObject({
            active: true,
            honored: CORNER,
            roles: { fine: true, constrain: false, fromCenter: false },
        });

        window.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Control",
                shiftKey: true,
                ctrlKey: true,
            }),
        );
        expect(useGestureChipStore.getState().roles).toEqual({
            fine: true,
            constrain: true,
            fromCenter: false,
        });

        held.end();
        expect(useGestureChipStore.getState().active).toBe(false);
    });
});
