import { beatAtTime, type BeatTiming } from "./timeMap";
import { positionsAt, timelineMarcherIds } from "./timelineStore";

/**
 * Drawing the resolver's positions on the canvas in timeline mode (docs/timeline/phases/
 * 05-rendering.md P5.4 playback and P5.5 static render). Pure pieces; the hooks that call them
 * are `useAnimation` and `useTimelineStaticRender`.
 */

/** Where the positions come from. The store in the app; a stand-in in tests. */
export interface TimelinePositionSource {
    /** The marcher order of `positionsAt`: ids ascending */
    marcherIds(): readonly number[];
    /** Fills `out` with x, y pairs; false, leaving `out` untouched, when it can't */
    positionsAt(beat: number, out: Float64Array): boolean;
}

/** The open file's resolver store. */
export const timelineStoreSource: TimelinePositionSource = {
    marcherIds: timelineMarcherIds,
    positionsAt,
};

/** The fields of a canvas marcher these helpers read. `CanvasMarcher` satisfies this. */
export interface MarcherWithId {
    readonly marcherObj: { readonly id: number };
}

/**
 * A reused `Float64Array` of every marcher's position at one beat, for the render loop. It only
 * reallocates when the resolver's marcher count changes, and keeps the ids its contents belong to.
 */
export class TimelinePositionBuffer {
    private positions = new Float64Array(0);
    private ids: readonly number[] = [];

    constructor(
        private readonly source: TimelinePositionSource = timelineStoreSource,
    ) {}

    /**
     * Fills the buffer with the positions at `beat`, resizing it first if the number of marchers
     * changed (after a marcher is added or deleted).
     *
     * @returns false when the source isn't ready; the buffer then holds nothing to draw, and
     * callers leave the marchers where they are
     */
    fill(beat: number): boolean {
        const ids = this.source.marcherIds();
        if (this.positions.length !== 2 * ids.length)
            this.positions = new Float64Array(2 * ids.length);
        if (!this.source.positionsAt(beat, this.positions)) {
            this.ids = [];
            return false;
        }
        this.ids = ids;
        return true;
    }

    /** The buffer itself, for tests and diagnostics. Its length is `2 * marcherIds.length`. */
    get buffer(): Float64Array {
        return this.positions;
    }

    /** The marcher ids of the last successful `fill`, ascending; empty after a failed one. */
    get marcherIds(): readonly number[] {
        return this.ids;
    }

    /** The index of `marcherId` in `marcherIds`, or -1. Binary search; the ids are sorted. */
    indexOf(marcherId: number): number {
        const ids = this.ids;
        let lo = 0;
        let hi = ids.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const id = ids[mid]!;
            if (id === marcherId) return mid;
            if (id < marcherId) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }

    /**
     * Calls `apply` with the buffered position of each marcher the resolver knows. Marchers it
     * doesn't know are skipped, so they stay where they are.
     */
    forEachMarcher<M extends MarcherWithId>(
        marchers: Iterable<M>,
        apply: (marcher: M, x: number, y: number) => void,
    ): void {
        for (const marcher of marchers) {
            const i = this.indexOf(marcher.marcherObj.id);
            if (i < 0) continue;
            apply(marcher, this.positions[2 * i]!, this.positions[2 * i + 1]!);
        }
    }
}

/**
 * The resolver beat to draw at a playback time.
 *
 * @param beats the show's beats, ascending by position, with cumulative timestamps (seconds)
 * @param timeMilliseconds playback time in milliseconds, as `useAnimation` passes it around
 */
export function playbackBeat(
    beats: readonly BeatTiming[],
    timeMilliseconds: number,
): number {
    return beatAtTime(beats, timeMilliseconds / 1000);
}

/**
 * The resolver beat at which a page's marcher_pages positions sit: the end of the page.
 *
 * A page covers the beats from its start beat up to the next page's start beat (`Page.beats`, from
 * `fromDatabasePages`), and its marcher_pages row is where marchers are when those beats are done
 * (the page-mode keyframe is at `(page.timestamp + page.duration) * 1000`). In resolver beats,
 * page N's move spans `[first.index, last.index + 1)`, so its end beat is `last.index + 1`: the
 * start beat of the next page, or the end of the show for the last page. The first page holds only
 * the fixed zero-length beat 0, so its end beat is 1, which is show time 0. A page with no beats
 * (not produced by `fromDatabasePages`) maps to beat 0.
 */
export function pageEndBeat(page: {
    readonly beats: readonly { readonly index: number }[];
}): number {
    const last = page.beats[page.beats.length - 1];
    return last ? last.index + 1 : 0;
}
