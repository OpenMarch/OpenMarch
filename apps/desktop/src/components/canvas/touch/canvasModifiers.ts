import { isAltHeld, isShiftHeld } from "@/stores/TouchModifierStore";

type ModifierEvent = { shiftKey?: boolean; altKey?: boolean } | undefined;

/**
 * Whether snapping to steps (coordinate rounding, line snapping, 15° rotation
 * steps) is off for this move. Shift turns it off, as it always has with a
 * keyboard; on a tablet the on-screen Shift or the on-screen "No snap" (Alt)
 * button does.
 *
 * The keyboard Alt key is not read here: with a mouse it pans the field.
 */
export const isSnapOff = (event?: ModifierEvent): boolean =>
    isShiftHeld(event) || isAltHeld(undefined);
