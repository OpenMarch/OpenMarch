/**
 * The 3D window's Horn/Equipment channel (performer-behavior.md section 3,
 * Horn / Equipment): every carrier starts on the default hold and follows the
 * compiled cues. Pure: no three.js.
 */
import type { CueSegment } from "@openmarch/core";
import type { HoldState } from "@/view3d/core/instruments/holds";
import {
    planHornChannel,
    type HornEvent,
    type HornPlanOptions,
} from "@/view3d/core/marchers/hornChannel";

/** The hold before any Horn/Equipment cue, and the hold a look carries its instrument in. */
export const DEFAULT_HOLD: HoldState = "up";

/** What one carrier's Horn/Equipment channel plays over the show, from the default hold. */
export function windowHornEvents(
    segments: readonly CueSegment[],
    options: Omit<HornPlanOptions, "defaultState">,
): HornEvent[] {
    return planHornChannel(segments, {
        ...options,
        defaultState: DEFAULT_HOLD,
    });
}
