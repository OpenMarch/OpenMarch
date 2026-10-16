import { create } from "zustand";

/** The speeds a click on the speed button steps through, in order; it wraps from the last */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;
export const MIN_PLAYBACK_SPEED = 0.1;
// Holding ] at 4× doubles to this
export const MAX_PLAYBACK_SPEED = 8;

/** A held speed key: `]` plays at double the speed while held, `[` at half */
export type PlaybackSpeedHold = "faster" | "slower";

interface PlaybackSpeedStore {
    /** The chosen speed, 1 = as written */
    speed: number;
    /** The speed keys held down, the last pressed last; it's the one that counts */
    held: readonly PlaybackSpeedHold[];
    setSpeed: (speed: number) => void;
    /** To the next speed in `PLAYBACK_SPEEDS` (or the previous one with `back`) */
    stepSpeed: (back?: boolean) => void;
    pressHold: (hold: PlaybackSpeedHold) => void;
    /** Letting go of one key goes back to the other if it's still held */
    releaseHold: (hold: PlaybackSpeedHold) => void;
}

export const clampPlaybackSpeed = (speed: number): number =>
    Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed));

/** The speed after `speed` in `PLAYBACK_SPEEDS`, or before it with `back`; an off-list speed goes to the nearest one that way */
export function nextPlaybackSpeed(speed: number, back = false): number {
    const list = PLAYBACK_SPEEDS;
    if (back) {
        const lower = [...list].reverse().find((s) => s < speed - 1e-6);
        return lower ?? list[list.length - 1];
    }
    return list.find((s) => s > speed + 1e-6) ?? list[0];
}

/** The speed playing now: the chosen one, doubled or halved while a speed key is held */
export function effectivePlaybackSpeed(state: {
    speed: number;
    held: readonly PlaybackSpeedHold[];
}): number {
    const hold = state.held[state.held.length - 1];
    if (hold === "faster") return clampPlaybackSpeed(state.speed * 2);
    if (hold === "slower") return clampPlaybackSpeed(state.speed / 2);
    return state.speed;
}

/** "1×", "0.25×", "1.5×" */
export const formatPlaybackSpeed = (speed: number): string =>
    `${Number(speed.toFixed(2))}×`;

/**
 * Playback speed, like a video player's. Not saved: a show opens at 1×. The audio player, the
 * live clock and the 3D window's clock all read `effectivePlaybackSpeed`.
 */
export const usePlaybackSpeedStore = create<PlaybackSpeedStore>((set) => ({
    speed: 1,
    held: [],
    setSpeed: (speed) => set({ speed: clampPlaybackSpeed(speed) }),
    stepSpeed: (back) =>
        set((state) => ({ speed: nextPlaybackSpeed(state.speed, back) })),
    pressHold: (hold) =>
        set((state) => ({
            held: [...state.held.filter((h) => h !== hold), hold],
        })),
    releaseHold: (hold) =>
        set((state) => ({ held: state.held.filter((h) => h !== hold) })),
}));
