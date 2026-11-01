import { afterEach, describe, expect, it, vi } from "vitest";
import { startGestureKeys } from "@/input/gestureKeys";
import {
    useGestureChipStore,
    type HonoredRoles,
} from "@/input/gestureChipStore";
import { clearGestureChip } from "@/input/gestureChipSync";
import { NO_KEYS, type HeldKeys, type Roles } from "@/input/modifierRoles";
import type { FieldPointer } from "../fieldEditor";
import { FieldDrag } from "../fieldKeys";

afterEach(() => {
    clearGestureChip();
});

const MOVE: HonoredRoles = {
    context: "field",
    fine: "fine",
    constrain: "oneAxis",
    snaps: true,
};

const keys = (changed: (roles: Roles) => void) =>
    startGestureKeys({
        context: "field",
        press: NO_KEYS,
        isMac: false,
        onRolesChange: changed,
    });

const pointer = (x: number, held: Partial<HeldKeys> = {}): FieldPointer => ({
    field: { x, y: 0 },
    screen: { x: 50 + x, y: 60 },
    button: 0,
    ...NO_KEYS,
    ...held,
});

const chip = () => useGestureChipStore.getState();

describe("gesture chip in FieldDrag", () => {
    it("shows the gesture's honored roles on a move, follows a role key, and clears on cancel", () => {
        const drag = new FieldDrag(keys, (_at, roles) => roles, vi.fn(), MOVE);
        drag.move(pointer(0));
        expect(chip()).toMatchObject({
            active: true,
            honored: MOVE,
            screen: { x: 50, y: 60 },
        });

        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }),
        );
        expect(chip().roles.fine).toBe(true);

        drag.cancel();
        expect(chip().active).toBe(false);
    });

    it("clears on release", () => {
        const drag = new FieldDrag(keys, (_at, roles) => roles, vi.fn(), MOVE);
        drag.move(pointer(0, { shift: true }));
        expect(chip().active).toBe(true);
        drag.end(pointer(3, { shift: true }));
        expect(chip().active).toBe(false);
    });
});
