import { afterEach, describe, expect, it } from "vitest";
import { useGestureChipStore, type HonoredRoles } from "../gestureChipStore";
import { clearGestureChip, syncGestureChip } from "../gestureChipSync";
import { NO_KEYS, rolesOf } from "../modifierRoles";

afterEach(() => {
    clearGestureChip();
});

const MOVE: HonoredRoles = {
    context: "field",
    fine: "fine",
    constrain: "oneAxis",
    snaps: true,
};

describe("gestureChipStore", () => {
    it("the first sync shows the gesture's honored roles, later ones follow its roles and pointer, and clear hides it", () => {
        const fine = rolesOf({ ...NO_KEYS, shift: true }, "field", {
            isMac: false,
        });
        expect(useGestureChipStore.getState().active).toBe(false);

        syncGestureChip(MOVE, fine, { x: 10, y: 20 });
        expect(useGestureChipStore.getState()).toMatchObject({
            active: true,
            honored: MOVE,
            roles: fine,
            screen: { x: 10, y: 20 },
        });

        const constrain = rolesOf({ ...NO_KEYS, ctrl: true }, "field", {
            isMac: false,
        });
        syncGestureChip(MOVE, constrain, { x: 30, y: 40 });
        expect(useGestureChipStore.getState()).toMatchObject({
            active: true,
            honored: MOVE,
            roles: constrain,
            screen: { x: 30, y: 40 },
        });

        clearGestureChip();
        expect(useGestureChipStore.getState().active).toBe(false);
        expect(useGestureChipStore.getState().screen).toBeUndefined();
    });

    it("keeps the same roles object while the roles don't change, so the chip doesn't render again", () => {
        syncGestureChip(
            MOVE,
            { fine: true, constrain: false, fromCenter: false },
            {
                x: 0,
                y: 0,
            },
        );
        const shown = useGestureChipStore.getState().roles;
        syncGestureChip(
            MOVE,
            { fine: true, constrain: false, fromCenter: false },
            {
                x: 5,
                y: 5,
            },
        );
        expect(useGestureChipStore.getState().roles).toBe(shown);
    });

    it("belongs to the gesture that showed it: another gesture's sync shows its own, and only the owner's clear hides it", () => {
        const TURN: HonoredRoles = {
            context: "shape",
            fine: "wholeDegrees",
            snaps: true,
        };
        const roles = { fine: true, constrain: false, fromCenter: false };
        const first = {};
        const second = {};
        syncGestureChip(MOVE, roles, { x: 0, y: 0 }, first);
        // A gesture that starts before the first ends names what it reads, not the first's roles
        syncGestureChip(TURN, roles, { x: 5, y: 5 }, second);
        expect(useGestureChipStore.getState()).toMatchObject({
            active: true,
            honored: TURN,
            screen: { x: 5, y: 5 },
        });
        // The first ending leaves the second's chip up
        clearGestureChip(first);
        expect(useGestureChipStore.getState()).toMatchObject({
            active: true,
            honored: TURN,
        });
        clearGestureChip(second);
        expect(useGestureChipStore.getState().active).toBe(false);
    });
});
