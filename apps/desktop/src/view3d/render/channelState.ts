/**
 * Per-performer channel state (performer-behavior.md section 8.3): what each
 * channel plays, in a small float texture the compose pass reads per
 * performer slot. Written only when a channel's segment changes (and every
 * frame of a Feet crossfade), never per frame otherwise. Pure: no three.js.
 *
 * Eight RGBA texels per slot:
 *
 * | Texel | x            | y             | z               | w        |
 * | ----- | ------------ | ------------- | --------------- | -------- |
 * | 0     | Feet row     | samples       | counts          | phase    |
 * | 1     | Feet rate    | blend row     | blend weight    |          |
 * | 2     | leg yaw from | leg yaw to    | ease start      | ease end |
 * | 3     | Body row     | samples       | counts          | phase    |
 * | 4     | Body rate    | once          |                 |          |
 * | 5     | Horn row     | samples       | counts          | phase    |
 * | 6     | Horn rate    | once          | prop in body    |          |
 * | 7     |              |               |                 |          |
 *
 * A Body or Horn row of -1 means the channel has nothing of its own: its
 * bones follow the channel under it (Horn follows Body, Body follows Feet).
 * A row plays clip time `count × rate + phase`, looping, or clamped to its
 * end when `once` (a transition).
 */

export const STATE_TEXELS = 8;
/** Slots per texture row: 4096 texels wide. */
export const STATE_PER_ROW = 512;

/** The texture's size for `n` slots. */
export function stateSize(n: number): { width: number; height: number } {
    return {
        width: STATE_PER_ROW * STATE_TEXELS,
        height: Math.max(1, Math.ceil(n / STATE_PER_ROW)),
    };
}

/** Floats in the state array for `n` slots. */
export const stateFloats = (n: number) => {
    const { width, height } = stateSize(n);
    return width * height * 4;
};

/** The first float of slot `slot`'s texels. */
export const stateOffset = (slot: number) => slot * STATE_TEXELS * 4;

interface Rows {
    row: number;
    frames: number;
    counts: number;
}

/** What a slot's Feet play: a clip, maybe blended with a second, and the leg turn. */
export interface FeetPlay {
    row: Rows;
    row2?: Rows | null;
    weight?: number;
    /** Phase in counts: clip time is count × rate + phase. */
    phase?: number;
    rate?: number;
    /** Radians, or [from, to, u0, u1] eased over the clip. */
    legYaw?: number | readonly [number, number, number, number];
}

/** What a Body or Horn/Equipment channel plays. */
export interface ChannelPlay {
    row: number;
    frames: number;
    counts: number;
    phase: number;
    rate: number;
    /** Play once and hold the last sample (a transition), instead of looping. */
    once: boolean;
    /** The prop bone follows the row's own path in body space (a toss), not the hand. */
    propInBody?: boolean;
}

export function writeFeetState(
    state: Float32Array,
    slot: number,
    play: FeetPlay,
): void {
    const { row, row2, phase = 0, rate = 1 } = play;
    if (row2 && row2.frames !== row.frames)
        throw new Error(
            `writeFeetState: blended rows differ in length (${row.frames} and ${row2.frames} samples)`,
        );
    const w = row2 ? Math.min(Math.max(play.weight ?? 0, 0), 1) : 0;
    const yaw = play.legYaw ?? 0;
    const [y0, y1 = y0, u0 = 0, u1 = 1] = typeof yaw === "number" ? [yaw] : yaw;
    const o = stateOffset(slot);
    state.set([row.row, row.frames, row.counts, phase], o);
    state.set([rate, row2 ? row2.row : 0, w, 0], o + 4);
    state.set([y0, y1, u0, u1], o + 8);
}

const CHANNEL_TEXEL = { body: 3, horn: 5 } as const;

export function writeChannelState(
    state: Float32Array,
    slot: number,
    channel: "body" | "horn",
    play: ChannelPlay | null,
): void {
    const o = stateOffset(slot) + CHANNEL_TEXEL[channel] * 4;
    if (!play) {
        state.set([-1, 0, 0, 0, 0, 0, 0, 0], o);
        return;
    }
    state.set([play.row, play.frames, play.counts, play.phase], o);
    state.set(
        [play.rate, play.once ? 1 : 0, play.propInBody ? 1 : 0, 0],
        o + 4,
    );
}

/** A fresh state array for `n` slots: every Body and Horn channel off. */
export function emptyState(n: number): Float32Array {
    const state = new Float32Array(stateFloats(n));
    for (let i = 0; i < n; i++) {
        writeChannelState(state, i, "body", null);
        writeChannelState(state, i, "horn", null);
    }
    return state;
}
