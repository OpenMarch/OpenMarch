import type { FieldProperties } from "@openmarch/core";
import type { UiSettings } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import type { FieldPoint } from "./fieldEditor";
import { followPointer, type MoveTransform } from "./moveGesture";

/**
 * The rules that modify a marcher drag (#197, #189 user stories 36 to 40;
 * rules table: Snapping, Alt, Lock X / Lock Y, Shift). Pure: the move
 * gesture calls them on every pointer event with the settings as they are
 * then, so what's drawn is what's dropped.
 */

/** What the drag rules read from the app's settings and the field. */
export type MoveRules = {
    /** The coordinate-rounding settings (`UiSettings.coordinateRounding`); 0 or none on an axis is off. */
    rounding: UiSettings["coordinateRounding"];
    /** The marchers can't move along X (the toolbar's Lock X). */
    lockX: boolean;
    /** The marchers can't move along Y (the toolbar's Lock Y). */
    lockY: boolean;
    /** The grid rounding is measured on; null (no field yet) turns snapping off. */
    grid: Pick<FieldProperties, "centerFrontPoint" | "pixelsPerStep"> | null;
};

/** Alt moves the selection at this fraction of the pointer's speed. */
export const PRECISION_SPEED = 0.25;

/**
 * The drag rules as a {@link MoveTransform}, reading `rules` on every call:
 *
 * - Lock X / Lock Y keep that axis where the marchers started.
 * - With coordinate rounding on, one marcher snaps onto the rounding grid; a
 *   group moves in whole rounding steps, so each marcher keeps its offset
 *   from the grid.
 * - Shift, or Alt (precision), turns snapping off.
 *
 * Alt's quarter speed is in the delta already ({@link precisionDelta}).
 */
export function ruledMove(rules: () => MoveRules): MoveTransform {
    return (delta, pointer, starts) => {
        const { rounding, lockX, lockY, grid } = rules();
        const locked = { x: lockX ? 0 : delta.x, y: lockY ? 0 : delta.y };
        const snap = grid !== null && !pointer.shift && !pointer.alt;
        if (!snap) return followPointer(locked, pointer, starts);

        if (starts.length === 1) {
            const [start] = starts;
            const rounded = getRoundCoordinates2({
                coordinate: {
                    xPixels: start.x + locked.x,
                    yPixels: start.y + locked.y,
                },
                uiSettings: { coordinateRounding: rounding },
                fieldProperties: grid,
            });
            return [
                {
                    id: start.id,
                    x: lockX ? start.x : rounded.xPixels,
                    y: lockY ? start.y : rounded.yPixels,
                },
            ];
        }

        const stepped = {
            x: wholeSteps(locked.x, rounding?.nearestXSteps, grid),
            y: wholeSteps(locked.y, rounding?.nearestYSteps, grid),
        };
        // As getRoundCoordinates2 does, so float noise never reaches a save
        return followPointer(stepped, pointer, starts).map(({ id, x, y }) => ({
            id,
            x: thousandths(x),
            y: thousandths(y),
        }));
    };
}

/** `value` to three decimal places, the precision rounding saves. */
const thousandths = (value: number) => Math.round(value * 1000) / 1000;

/** `distance` rounded to whole multiples of `steps` steps; unchanged when `steps` is off. */
function wholeSteps(
    distance: number,
    steps: number | undefined,
    grid: Pick<FieldProperties, "pixelsPerStep">,
): number {
    if (!steps) return distance;
    const size = Math.abs(steps) * grid.pixelsPerStep;
    return Math.round(distance / size) * size;
}

/**
 * How far a drag has moved the marchers, with Alt at {@link PRECISION_SPEED}.
 * `lag` is how far they've fallen behind the pointer, in field units.
 */
export type PrecisionTrack = {
    /** The pointer's delta from the press at the last event. */
    pointer: FieldPoint;
    /** How far the marchers trail the pointer's delta. */
    lag: FieldPoint;
};

export const PRECISION_START: PrecisionTrack = {
    pointer: { x: 0, y: 0 },
    lag: { x: 0, y: 0 },
};

/**
 * The marchers' delta for a pointer at `pointer` (its delta from the press),
 * after `track`. The distance the pointer moved since the last event counts
 * at a quarter while Alt is down, in full otherwise. So pressing or releasing
 * Alt mid-drag doesn't jump: the marchers carry on from where they are, at
 * the new speed (the drag re-anchors on every event). Without Alt the
 * marchers keep their lag; with none they follow the pointer exactly.
 */
export function precisionDelta(
    track: PrecisionTrack,
    pointer: FieldPoint,
    alt: boolean,
): { delta: FieldPoint; track: PrecisionTrack } {
    const slowed = alt ? 1 - PRECISION_SPEED : 0;
    const lag = {
        x: track.lag.x + (pointer.x - track.pointer.x) * slowed,
        y: track.lag.y + (pointer.y - track.pointer.y) * slowed,
    };
    return {
        delta: { x: pointer.x - lag.x, y: pointer.y - lag.y },
        track: { pointer, lag },
    };
}

/**
 * `track` re-anchored so the marchers' delta is `drawn`, where they're drawn
 * now. The move gesture calls it when Alt is pressed: a drag snapped to the
 * grid goes on slowly from the grid point, not from the unsnapped pointer.
 */
export function anchorAt(
    track: PrecisionTrack,
    drawn: FieldPoint,
): PrecisionTrack {
    return {
        pointer: track.pointer,
        lag: { x: track.pointer.x - drawn.x, y: track.pointer.y - drawn.y },
    };
}
