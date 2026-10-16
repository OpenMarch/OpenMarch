import { PositionBuffer, type PositionSource } from "./positionBuffer";
import { positionsAt, timelineMarcherIds } from "./timelineStore";

// Moved to a pure module so the converter can load it without renderer modules; kept here so
// callers don't change
export { pageEndBeat } from "./pageEndBeat";
export { playbackBeat, type MarcherWithId } from "./positionBuffer";

/**
 * The resolver's positions in timeline mode (docs/timeline/phases/05-rendering.md P5.4 playback
 * and P5.5 static render), read from the open file's resolver store. Pure pieces.
 */

/** Where the positions come from. The store in the app; a stand-in in tests. */
export type TimelinePositionSource = PositionSource;

/** The open file's resolver store. */
export const timelineStoreSource: TimelinePositionSource = {
    marcherIds: timelineMarcherIds,
    positionsAt,
};

/** A {@link PositionBuffer} over the open file's resolver store by default. */
export class TimelinePositionBuffer extends PositionBuffer {
    constructor(source: TimelinePositionSource = timelineStoreSource) {
        super(source);
    }
}
