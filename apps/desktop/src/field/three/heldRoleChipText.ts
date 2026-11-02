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
    keepDirection: "field.gestureChip.keepDirection",
};

const SNAP_OFF_I18N = "field.gestureChip.snapOff";
/** A held role's segment: its key as a keycap (the `<keys>` tag), then its word */
export const WITH_KEY_I18N = "field.gestureChip.withKey";

/**
 * Every word the chip reads, so a test can check each locale has them. `WITH_KEY_I18N` only
 * orders a key and its word, so it isn't here: until a locale has it, English's order shows.
 */
export const GESTURE_CHIP_KEYS: readonly string[] = [
    ...Object.values(WORD_I18N),
    SNAP_OFF_I18N,
];

/** One chip segment: a held role's word with the key that holds it, or a word on its own */
export interface ChipSegment {
    /** The key as a keycap label ("Shift", "⇧"), or null for a word without a key */
    readonly key: string | null;
    readonly word: string;
}

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
): ChipSegment[] {
    const segments: ChipSegment[] = [];
    for (const role of HELD_ROLES) {
        const word = honored[role];
        if (!roles[role] || word === undefined) continue;
        const key = keyFor(role, honored.context, map);
        segments.push({
            key: key ? keyLabel(key, isMac) : null,
            word: t(WORD_I18N[word]),
        });
    }
    if (honored.snaps && !snapOn)
        segments.push({ key: null, word: t(SNAP_OFF_I18N) });
    return segments;
}
