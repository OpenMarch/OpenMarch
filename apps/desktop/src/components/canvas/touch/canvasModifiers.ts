import {
    heldKeysOf,
    NO_KEYS,
    rolesOf,
    type RoleMap,
} from "@/input/modifierRoles";
import { onScreenRoles } from "@/stores/TouchModifierStore";
import { isSnapOn } from "@/stores/UiSettingsStore";

type ModifierEvent = {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
};

/**
 * Whether snapping to steps (coordinate rounding, line snapping, 15° rotation
 * steps) is off for this move. The Snap toggle turns it off for every drag;
 * Fine turns it off for this one (version A: Shift, by the role map, or the
 * pill's Fine on a tablet).
 */
export const isSnapOff = (
    event?: ModifierEvent,
    options: { map?: RoleMap; isMac?: boolean } = {},
): boolean =>
    !isSnapOn() ||
    rolesOf(event ? heldKeysOf(event) : NO_KEYS, "field", {
        ...options,
        onScreen: onScreenRoles(),
    }).fine;
