import type {
    ConstrainWord,
    FineWord,
    HonoredRoles,
} from "@/input/gestureChipStore";
import {
    HELD_ROLES,
    keyFor,
    keyLabel,
    VERSION_A,
    type RoleMap,
    type Roles,
} from "@/input/modifierRoles";

const WORD_I18N: Record<ConstrainWord | FineWord | "fromCenter", string> = {
    fine: "field.gestureChip.fine",
    wholeDegrees: "field.gestureChip.wholeDegrees",
    fromCenter: "field.gestureChip.fromCenter",
    oneAxis: "field.gestureChip.oneAxis",
    equalSpacings: "field.gestureChip.equalSpacings",
    freeRatio: "field.gestureChip.freeRatio",
    keepRatio: "field.gestureChip.keepRatio",
};

const SNAP_OFF_I18N = "field.gestureChip.snapOff";

/** Every key the chip reads, so a test can check each locale has them */
export const GESTURE_CHIP_KEYS: readonly string[] = [
    ...Object.values(WORD_I18N),
    SNAP_OFF_I18N,
];

/**
 * One chip segment per held role the drag honors, in its own word, plus Snap off when the drag
 * snaps and snapping is off. Empty: the chip has nothing to say.
 */
export function gestureChipSegments(
    honored: HonoredRoles,
    roles: Roles,
    snapOn: boolean,
    isMac: boolean,
    t: (key: string) => string,
    map: RoleMap = VERSION_A,
): string[] {
    const segments: string[] = [];
    for (const role of HELD_ROLES) {
        const word = honored[role];
        if (!roles[role] || word === undefined) continue;
        const key = keyFor(role, honored.context, map);
        const symbol = key ? keyLabel(key, isMac) : "";
        segments.push(`${symbol} ${t(WORD_I18N[word])}`.trim());
    }
    if (honored.snaps && !snapOn) segments.push(t(SNAP_OFF_I18N));
    return segments;
}
