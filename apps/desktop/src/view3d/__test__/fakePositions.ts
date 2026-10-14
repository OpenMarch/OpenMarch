import { ShowPositions } from "../positions";

/** Where a marcher is, in pixels, at a show time in milliseconds. */
export type Track = (ms: number) => { x: number; y: number };

/** The fake show is one beat this long, after the zero-length beat 0. */
const SHOW_SECONDS = 100;

/**
 * A {@link ShowPositions} over a fake resolver that places each marcher by its
 * track. The fake beats map show time linearly to beats (beat 1 at 0 s, beat
 * 2 at {@link SHOW_SECONDS}), so the resolver hands the track the time back.
 */
export function fakeShowPositions(
    tracks: ReadonlyMap<number, Track>,
): ShowPositions {
    const ids = [...tracks.keys()].sort((a, b) => a - b);
    return new ShowPositions(
        {
            marcherIds: () => ids,
            positionsAt: (beat, out) => {
                const ms = (beat - 1) * SHOW_SECONDS * 1000;
                ids.forEach((id, i) => {
                    const p = tracks.get(id)!(ms);
                    out[i * 2] = p.x;
                    out[i * 2 + 1] = p.y;
                });
            },
        },
        [
            { timestamp: 0, duration: 0 },
            { timestamp: 0, duration: SHOW_SECONDS },
        ],
    );
}

/** A straight move from `from` to `to` between two times, holding outside them. */
export const linearTrack =
    (
        from: { x: number; y: number },
        to: { x: number; y: number },
        startMs = 0,
        endMs = 1000,
    ): Track =>
    (ms) => {
        const t = Math.min(Math.max((ms - startMs) / (endMs - startMs), 0), 1);
        return {
            x: from.x + t * (to.x - from.x),
            y: from.y + t * (to.y - from.y),
        };
    };
