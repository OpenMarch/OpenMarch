import { createResolver, type Resolver } from "@openmarch/core";
import { getBeats } from "@/db-functions/beat";
import type { DbConnection } from "@/db-functions/types";
import { calculateTimestamps, fromDatabaseBeat } from "@/global/classes/Beat";
import { beatAtTime, type BeatTiming } from "./timeMap";
import type { PositionSource } from "./positionBuffer";
import { readTimelineTablesSnapshot } from "./timelineRows";
import {
    buildKeyframes,
    keyframesToJson,
    DEFAULT_KEYFRAME_TOLERANCE,
    type KeyframeExportOptions,
} from "./timelineKeyframes";

/**
 * What the exports need from the timeline (docs/timeline/phases/07-page-parity.md P7.8, P7.9):
 * a resolver, the show's beats, and a frame sampler over them.
 */

/**
 * The resolver for an export: always a separate one, cold-built from the tables the way the store
 * builds its own. The store's resolver is updated in place by every committed batch, so an edit
 * during a long export would change later frames and stop matching the beats read at the start.
 * The private resolver is not subscribed to changes, so an export reads one moment. (The live
 * preview may use the store's resolver.) The tables are read as one snapshot, which needs no write
 * lock, so the 3D View window (another renderer) builds its resolver this way too (#224).
 */
export async function acquireExportResolver(
    db: DbConnection,
): Promise<Resolver> {
    const { snapshot } = await readTimelineTablesSnapshot(db);
    return createResolver(snapshot);
}

/** The show's beats with cumulative timestamps, as the tempo map (`timeMap.ts`) reads them. */
export async function readExportBeats(db: DbConnection): Promise<BeatTiming[]> {
    const rows = await getBeats({ db });
    return calculateTimestamps(rows.map((row, i) => fromDatabaseBeat(row, i)));
}

/**
 * Where every marcher is at a show time, for the video export: seconds become a beat through
 * `beatAtTime`, and `source` answers the resolver's positions at that beat. The export's
 * off-screen field (`offscreenField.tsx`) samples `source` as the on-screen field samples the
 * store's resolver.
 */
export class ResolverFrameSampler {
    readonly source: PositionSource;

    constructor(
        resolver: Pick<Resolver, "marcherIds" | "positionsAt">,
        private readonly beats: readonly BeatTiming[],
    ) {
        this.source = {
            marcherIds: () => resolver.marcherIds(),
            positionsAt: (beat, out) => {
                resolver.positionsAt(beat, out);
                return true;
            },
        };
    }

    /** The beat a show time maps to. */
    beatAt(timeSeconds: number): number {
        return beatAtTime(this.beats, timeSeconds);
    }
}

/**
 * Builds the keyframe export for the open file and returns it as JSON text. A dev and console
 * export only (`window.openmarchTimeline.exportKeyframes()`); no UI, and nothing reads it back.
 */
export async function exportTimelineKeyframesJson(
    db: DbConnection,
    options: KeyframeExportOptions = {},
): Promise<string> {
    const [resolver, beats] = await Promise.all([
        acquireExportResolver(db),
        readExportBeats(db),
    ]);
    return keyframesToJson(
        buildKeyframes(resolver, beats, options),
        options.tolerance ?? DEFAULT_KEYFRAME_TOLERANCE,
    );
}
