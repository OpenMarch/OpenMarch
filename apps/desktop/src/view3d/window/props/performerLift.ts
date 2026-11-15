/**
 * The props at a moment, shared by the 3D View's props and performers (C4.5): `PropBlocks.tsx`
 * stands each block on the platform under it and `Performers.tsx` stands performers on them, both
 * from one layout a frame.
 */
import type { FieldProperties } from "@openmarch/core";
import {
    liftPlatforms,
    writeLifts,
    type LiftPlatform,
} from "@/view3d/core/props/platformLift";
import {
    propsAt,
    type PropInput,
    type PropSolid,
} from "@/view3d/core/props/propLayout";
import { METERS_PER_INCH } from "@/view3d/core/sizes/units";
import type { ShowPositions } from "@/view3d/positions";

/** How far a dot goes in half a count at the show's step size: the width of a step up or down. */
export const stepRamp = (fieldProperties: FieldProperties): number =>
    (fieldProperties.stepSizeInches * METERS_PER_INCH) / 2;

export interface PropsMoment {
    props: readonly PropInput[];
    positions: ShowPositions | null;
    ms: number;
    fieldProperties: FieldProperties;
}

const NO_SOLIDS: PropSolid[] = [];

/** The last layout, so the props and the performers lay them out once a frame. */
let last: {
    props: readonly PropInput[];
    positions: ShowPositions | null;
    fieldProperties: FieldProperties;
    ms: number;
    solids: PropSolid[];
    platforms: LiftPlatform[] | null;
} | null = null;

function layout(moment: PropsMoment) {
    const { props, positions, ms, fieldProperties } = moment;
    if (
        last &&
        last.props === props &&
        last.positions === positions &&
        last.fieldProperties === fieldProperties &&
        last.ms === ms
    )
        return last;
    const solids =
        positions && props.length > 0
            ? propsAt(props, positions.beatAt(ms), (id) =>
                  positions.positionAt(id, ms, fieldProperties),
              )
            : NO_SOLIDS;
    return (last = {
        props,
        positions,
        fieldProperties,
        ms,
        solids,
        platforms: null,
    });
}

/** Every prop drawn at `ms`, standing where it stands. */
export const propSolidsAt = (moment: PropsMoment): readonly PropSolid[] =>
    layout(moment).solids;

/**
 * Writes each performer's lift into `out`, the performers placed at `xz`, standing on the
 * platforms as they are drawn at `ms`. A show with no platforms writes 0 for everyone.
 */
export function writePerformerLifts(
    moment: PropsMoment,
    xz: Float32Array,
    placed: Uint8Array,
    out: Float32Array,
): void {
    if (!moment.props.some((p) => p.surface === "platform")) {
        out.fill(0);
        return;
    }
    const at = layout(moment);
    at.platforms ??= liftPlatforms(at.solids);
    writeLifts(at.platforms, xz, placed, stepRamp(moment.fieldProperties), out);
}
