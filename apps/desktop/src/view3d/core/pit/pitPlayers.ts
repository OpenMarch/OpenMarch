/**
 * Who plays which pit instrument in the 3D View (docs/3d/instruments.md §6, "Players are
 * marchers"). Nothing stores who plays what: a performer whose dot is on a played instrument's
 * playing spot (`playingSpot.ts`, within about a foot) plays it, snapping onto the spot exactly
 * and facing the way the instrument faces, and holds still there while the dot stays on it.
 *
 * - Only items whose model is a played pit instrument have a spot (`isPlayedPitModel`): not the
 *   speakers, the mixer or the podiums.
 * - An instrument has one player: of several dots on one spot, the nearest plays and the others
 *   are left where the drill has them.
 * - The snap is drawn only: nothing here changes a stored position.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`. Spots are in world meters, the
 * field plan's y being the world's z (+Z toward the audience).
 */
import { itemGeometryAt, type GeometryChange } from "@openmarch/core";
import {
    isOnPlayingSpot,
    playingSpotOf,
    type PlayingSpot,
} from "./playingSpot";

/** A played pit instrument, by its marchers row id, with its model and Outline changes. */
export interface PlayedInstrumentInput {
    id: number;
    model: string;
    /** Its Outline changes, by beat ordinal */
    changes: readonly GeometryChange[];
}

/**
 * The Feet clip a player holds while playing, by its base name (before the height class suffix).
 * om-pose has no playing clip yet, so players stand at attention; when one lands, name it here and
 * the 3D View loads, bakes and plays it for every player from this name alone.
 */
export const PLAYING_CLIP = "attention";

/** No player: an entry of {@link assignPlayers}' output. */
export const NOT_PLAYING = -1;

/**
 * The playing spot of every instrument drawn at `beat`, in world meters, in the order given. An
 * instrument the timeline has nowhere at `beat`, or whose model nobody plays, has none.
 *
 * @param beat a beat ordinal, fractional between beats
 * @param positionOf where the timeline has an item at `beat` (world meters), or null
 */
export function playingSpotsAt(
    instruments: readonly PlayedInstrumentInput[],
    beat: number,
    positionOf: (id: number) => { x: number; z: number } | null,
): PlayingSpot[] {
    const out: PlayingSpot[] = [];
    for (const input of instruments) {
        const geometry = itemGeometryAt(input.changes, beat);
        if (!geometry) continue;
        const center = positionOf(input.id);
        if (!center) continue;
        const spot = playingSpotOf(input.model, {
            center: { x: center.x, y: center.z },
            depth: geometry.depth,
            rotation: geometry.rotation,
        });
        if (spot) out.push(spot);
    }
    return out;
}

/**
 * The heading (radians about +Y, 0 facing +Z, the renderer's) of a player on `spot`: the way the
 * instrument faces, across it from the spot. The item's turn takes its front (+Z) to
 * (-sin, cos), as `writePitModelMatrix` turns the model, and a heading h faces (sin h, cos h),
 * so the heading is the turn negated: an unturned instrument's player faces the audience, and one
 * turned 180° behind the back sideline faces away from the field, the spot on its field side.
 */
export const playingHeading = (spot: PlayingSpot): number =>
    (-spot.facing * Math.PI) / 180 || 0;

/**
 * Writes into `out`, per performer placed at `xz`, the index in `spots` of the instrument they
 * play, or {@link NOT_PLAYING}. Each spot is played by the nearest placed dot on it (of two the
 * same distance away, the earlier); a dot on two overlapping spots plays the nearer. Allocates
 * nothing.
 *
 * @returns how many performers play
 */
export function assignPlayers(
    spots: readonly PlayingSpot[],
    xz: Float32Array,
    placed: Uint8Array,
    out: Int32Array,
): number {
    out.fill(NOT_PLAYING);
    if (spots.length === 0) return 0;
    const dot = { x: 0, y: 0 };
    let players = 0;
    for (let s = 0; s < spots.length; s++) {
        const spot = spots[s];
        let best = NOT_PLAYING;
        let bestDistance = Infinity;
        for (let i = 0; i < out.length; i++) {
            if (!placed[i]) continue;
            dot.x = xz[i * 2];
            dot.y = xz[i * 2 + 1];
            if (!isOnPlayingSpot(dot, spot)) continue;
            const d = Math.hypot(dot.x - spot.x, dot.y - spot.y);
            if (d < bestDistance) {
                best = i;
                bestDistance = d;
            }
        }
        if (best === NOT_PLAYING) continue;
        const had = out[best];
        if (had !== NOT_PLAYING) {
            const other = spots[had];
            const d = Math.hypot(
                xz[best * 2] - other.x,
                xz[best * 2 + 1] - other.y,
            );
            if (d <= bestDistance) continue;
        } else players++;
        out[best] = s;
    }
    return players;
}

/**
 * Snaps each player in `players` (from {@link assignPlayers}) onto their spot in `xz` and turns
 * them to face the instrument in `headings`. Everyone else keeps their place and heading.
 */
export function writePlayers(
    spots: readonly PlayingSpot[],
    players: Int32Array,
    xz: Float32Array,
    headings?: Float32Array,
): void {
    for (let i = 0; i < players.length; i++) {
        const s = players[i];
        if (s === NOT_PLAYING) continue;
        const spot = spots[s];
        xz[i * 2] = spot.x;
        xz[i * 2 + 1] = spot.y;
        if (headings) headings[i] = playingHeading(spot);
    }
}
