import { beatAtTime, type BeatTiming } from "./timeMap";

/**
 * Every marcher's position at one beat, in one reused buffer, for render
 * loops. The field (`src/field/three`) and the 3D View (`view3d/positions.ts`)
 * both sample the resolver through this, so they agree on where a marcher is
 * at a time. Pure: no store, no renderer.
 */

/**
 * Where the positions come from: the open file's resolver store, a window's own resolver, or a
 * stand-in in tests.
 */
export interface PositionSource {
    /** The marcher order of `positionsAt`. Must be ascending: `PositionBuffer.indexOf` binary-searches it */
    marcherIds(): readonly number[];
    /** Fills `out` with x, y pairs; false, leaving `out` untouched, when it can't */
    positionsAt(beat: number, out: Float64Array): boolean;
}

/** The fields of a drawn marcher `forEachMarcher` reads. */
export interface MarcherWithId {
    readonly marcherObj: { readonly id: number };
}

/**
 * A reused `Float64Array` of every marcher's position at one beat, for the render loop. It only
 * reallocates when the resolver's marcher count changes, and keeps the ids its contents belong to.
 */
export class PositionBuffer {
    private positions = new Float64Array(0);
    private ids: readonly number[] = [];

    constructor(private readonly source: PositionSource) {}

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
 * @param timeMilliseconds playback time in milliseconds, as the audio clock gives it
 */
export function playbackBeat(
    beats: readonly BeatTiming[],
    timeMilliseconds: number,
): number {
    return beatAtTime(beats, timeMilliseconds / 1000);
}
