/**
 * The props at a moment, shared by the 3D View's props and performers (C4.5): `PropBlocks.tsx`
 * stands each block on the platform under it and `Performers.tsx` stands performers on them, and
 * stands those at a podium on its deck, facing the band, all from one layout a frame. The pit
 * instruments' playing spots at a moment are worked out once a frame the same way, for the
 * performers who play them.
 */
import { fieldFootprint, type FieldProperties } from "@openmarch/core";
import {
    liftPlatforms,
    liftPodiums,
    writeLifts,
    writeOnPodiums,
    writePodiumStands,
    type LiftPlatform,
    type LiftPodium,
} from "@/view3d/core/props/platformLift";
import {
    propsAt,
    type PropInput,
    type PropSolid,
} from "@/view3d/core/props/propLayout";
import { METERS_PER_INCH } from "@/view3d/core/sizes/units";
import {
    assignPlayers,
    playingSpotsAt,
    type PlayedInstrumentInput,
} from "@/view3d/core/pit/pitPlayers";
import type { PlayingSpot } from "@/view3d/core/pit/playingSpot";
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
    podiums: LiftPodium[] | null;
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
        podiums: null,
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

/** The field's front-to-back midpoint, in world meters, by field properties. */
const centers = new WeakMap<FieldProperties, number>();
const fieldCenterZ = (fieldProperties: FieldProperties): number => {
    let z = centers.get(fieldProperties);
    if (z === undefined) {
        const f = fieldFootprint(fieldProperties);
        z = (f.minZ + f.maxZ) / 2;
        centers.set(fieldProperties, z);
    }
    return z;
};

/**
 * Stands the performers at a podium at `ms` on its deck, at its stand point, facing the band
 * across the field (`writePodiumStands`): over their position in `xz`, lift in `lift` and the
 * drill's heading in `headings`. Call it after {@link writePerformerLifts} and before anything is
 * drawn at the feet. A show with no podium changes nothing.
 */
export function writePerformerPodiumStands(
    moment: PropsMoment,
    xz: Float32Array,
    placed: Uint8Array,
    lift: Float32Array,
    headings: Float32Array,
): void {
    if (!moment.props.some((p) => p.facesAcross)) return;
    const at = layout(moment);
    at.podiums ??= liftPodiums(at.solids);
    writePodiumStands(
        at.podiums,
        xz,
        placed,
        fieldCenterZ(moment.fieldProperties),
        lift,
        headings,
    );
}

/**
 * Who stands on a podium at `ms`: writes into `out`, per performer, 1 if their dot in `dots`
 * puts them on one (as {@link writePerformerPodiumStands} stands them) and 0 if not, so they
 * hold the podium's stance (`PODIUM_CLIP`). A show with no podium writes 0 for everyone.
 */
export function findPerformersOnPodiums(
    moment: PropsMoment,
    dots: Float32Array,
    placed: Uint8Array,
    out: Uint8Array,
): void {
    if (!moment.props.some((p) => p.facesAcross)) {
        out.fill(0);
        return;
    }
    const at = layout(moment);
    at.podiums ??= liftPodiums(at.solids);
    writeOnPodiums(at.podiums, dots, placed, out);
}

const NO_SPOTS: PlayingSpot[] = [];

/** The last spots worked out, so a still show works them out once. */
let lastSpots: {
    instruments: readonly PlayedInstrumentInput[];
    positions: ShowPositions | null;
    fieldProperties: FieldProperties;
    ms: number;
    spots: PlayingSpot[];
} | null = null;

/** Every played pit instrument's playing spot at `ms`, in world meters. */
export function playingSpotsNow(
    instruments: readonly PlayedInstrumentInput[],
    moment: Omit<PropsMoment, "props">,
): readonly PlayingSpot[] {
    const { positions, ms, fieldProperties } = moment;
    if (!positions || instruments.length === 0) return NO_SPOTS;
    if (
        lastSpots &&
        lastSpots.instruments === instruments &&
        lastSpots.positions === positions &&
        lastSpots.fieldProperties === fieldProperties &&
        lastSpots.ms === ms
    )
        return lastSpots.spots;
    const spots = playingSpotsAt(instruments, positions.beatAt(ms), (id) =>
        positions.positionAt(id, ms, fieldProperties),
    );
    lastSpots = { instruments, positions, fieldProperties, ms, spots };
    return spots;
}

/**
 * Who plays which pit instrument at `ms` (docs/3d/instruments.md §6): writes into `players`, per
 * performer, the index of the spot they play in the returned spots, or `NOT_PLAYING`, from their
 * dots at `ms` itself (`dots`, `placed`). A show with no played instrument writes nobody.
 */
export function findPerformerPlayers(
    instruments: readonly PlayedInstrumentInput[],
    moment: Omit<PropsMoment, "props">,
    dots: Float32Array,
    placed: Uint8Array,
    players: Int32Array,
): readonly PlayingSpot[] {
    const spots = playingSpotsNow(instruments, moment);
    assignPlayers(spots, dots, placed, players);
    return spots;
}
