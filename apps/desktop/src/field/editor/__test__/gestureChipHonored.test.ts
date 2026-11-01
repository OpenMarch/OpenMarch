import { afterEach, describe, expect, it, vi } from "vitest";
import { useGestureChipStore } from "@/input/gestureChipStore";
import { clearGestureChip } from "@/input/gestureChipSync";
import { NO_KEYS } from "@/input/modifierRoles";
import type { FieldGesture, FieldPointer } from "../fieldEditor";
import { fieldKeys } from "../fieldKeys";
import { ItemResizeGesture, ItemRotateGesture } from "../itemTransform";
import { MoveGesture } from "../moveGesture";
import { RotateGesture, ScaleGesture } from "../transformGestures";

/**
 * Each field drag names in the chip only the roles it reads (owner, 2026-10-30): constrain is one
 * axis on a move and a free ratio on a scale corner, a rotate reads no constrain, and none of them
 * reads from center. Snap off only for the drags that snap.
 */

afterEach(() => {
    clearGestureChip();
});

const at = (x: number, y: number): FieldPointer => ({
    field: { x, y },
    screen: { x, y },
    button: 0,
    ...NO_KEYS,
});

const keys = () => fieldKeys(NO_KEYS, { isMac: false });
const marchers = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 10, y: 10 },
];
const box = { left: 0, top: 0, right: 10, bottom: 10 };
const host = { show: vi.fn(), drop: vi.fn(), save: vi.fn(), cancel: vi.fn() };
const frame = { center: { x: 5, y: 5 }, width: 10, depth: 10, rotation: 0 };

const honoredBy = (gesture: FieldGesture) => {
    gesture.move(at(20, 20));
    const { honored } = useGestureChipStore.getState();
    gesture.cancel();
    return honored;
};

describe("what each field drag honors", () => {
    it.each<[string, () => FieldGesture, object]>([
        [
            "a marcher move: fine, one axis, snapping",
            () => new MoveGesture(at(0, 0), marchers, host, undefined, keys()),
            { fine: "fine", constrain: "oneAxis", snaps: true },
        ],
        [
            "a scale corner: fine, a kept ratio, from center, no snapping",
            () =>
                new ScaleGesture(at(10, 10), marchers, host, "se", box, keys()),
            {
                fine: "fine",
                constrain: "keepRatio",
                fromCenter: "fromCenter",
                snaps: false,
            },
        ],
        [
            "a scale corner with the ratio lock on: a free ratio (#545)",
            () =>
                new ScaleGesture(
                    at(10, 10),
                    marchers,
                    host,
                    "se",
                    box,
                    keys(),
                    true,
                ),
            {
                fine: "fine",
                constrain: "freeRatio",
                fromCenter: "fromCenter",
                snaps: false,
            },
        ],
        [
            "a scale side: fine, a kept ratio, from center, no snapping",
            () => new ScaleGesture(at(10, 5), marchers, host, "e", box, keys()),
            {
                fine: "fine",
                constrain: "keepRatio",
                fromCenter: "fromCenter",
                snaps: false,
            },
        ],
        [
            "a scale side with the ratio lock on: a free ratio (#545)",
            () =>
                new ScaleGesture(
                    at(10, 5),
                    marchers,
                    host,
                    "e",
                    box,
                    keys(),
                    true,
                ),
            {
                fine: "fine",
                constrain: "freeRatio",
                fromCenter: "fromCenter",
                snaps: false,
            },
        ],
        [
            "a rotate: whole degrees, snapping",
            () => new RotateGesture(at(5, -5), marchers, host, box, keys()),
            { fine: "wholeDegrees", snaps: true },
        ],
        [
            "a prop's side or corner: fine only",
            () => new ItemResizeGesture(at(10, 10), frame, host, "se", keys()),
            { fine: "fine", snaps: false },
        ],
        [
            "a prop's rotate: whole degrees, snapping",
            () => new ItemRotateGesture(at(5, -5), frame, host, keys()),
            { fine: "wholeDegrees", snaps: true },
        ],
    ])("%s", (_, start, expected) => {
        expect(honoredBy(start())).toEqual({ context: "field", ...expected });
    });
});
