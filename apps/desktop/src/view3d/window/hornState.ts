/**
 * The window's horn state (docs/3d/instruments.md §5): always `up` for
 * the show today; the settings panel can switch it to see the other
 * holds. Not saved anywhere: it is a test control until per-page horn
 * states exist.
 */
import { HOLD_STATES, type HoldState } from "@/view3d/core/instruments/holds";

export { HOLD_STATES, type HoldState };

export function parseHornState(value: unknown): HoldState {
    return HOLD_STATES.includes(value as HoldState)
        ? (value as HoldState)
        : "up";
}
