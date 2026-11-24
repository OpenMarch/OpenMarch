/**
 * The comet that runs along a line's order: a pulse that starts at the leader and lights each
 * marcher in turn, with a fading tail behind it, then rests and runs again. The dots and their
 * colors never change; the pulse is a ring round each dot it passes. Even a still frame shows the
 * way the order runs: the bright head is ahead, the fading tail points back to the leader.
 */

/** How one line's comet runs */
export interface CometTiming {
    /** How long the head takes from the leader to the last marcher, in ms */
    readonly travelMs: number;
    /** The rest after it leaves the last marcher, before it starts again at the leader, in ms */
    readonly restMs: number;
    /** How many marchers the fading tail covers behind the head */
    readonly tail: number;
}

/** About 30 ms a marcher, so a long line isn't slow to read and a short one isn't a flash */
const MS_PER_MARCHER = 30;
const MIN_TRAVEL_MS = 900;
const MAX_TRAVEL_MS = 2800;
const REST_MS = 900;

export function cometTiming(count: number): CometTiming {
    return {
        travelMs: Math.min(
            MAX_TRAVEL_MS,
            Math.max(MIN_TRAVEL_MS, count * MS_PER_MARCHER),
        ),
        restMs: REST_MS,
        tail: Math.min(9, Math.max(2, Math.round(count * 0.1))),
    };
}

/**
 * Where the head is, in marchers from the leader (0 on the leader, fractional between), `elapsed`
 * ms after the comet started; null while it rests. The head runs on past the last marcher by its
 * tail's length, so the tail leaves the line before the rest.
 */
export function cometHead(
    elapsed: number,
    count: number,
    timing: CometTiming = cometTiming(count),
): number | null {
    if (count < 2) return null;
    const run = timing.travelMs + timing.restMs;
    const t = ((elapsed % run) + run) % run;
    if (t >= timing.travelMs) return null;
    const span = count - 1 + timing.tail;
    return (t / timing.travelMs) * span;
}

/**
 * How lit marcher `index` is (0 to 1) with the head at `head`: full on the head, fading to nothing
 * `tail` marchers behind it, and easing in over the one marcher just ahead of it
 */
export function cometStrength(
    index: number,
    head: number | null,
    tail: number,
): number {
    if (head === null) return 0;
    const behind = head - index;
    if (behind < -1 || behind >= tail) return 0;
    if (behind < 0) return 1 + behind;
    return 1 - behind / tail;
}

/**
 * How a comet ring is drawn round a dot of `dotRadius` on screen, sitting at `radius`: how much it
 * grows when lit, its stroke width, and how far its outer glow reaches from the dot's center
 */
export function cometRingSize(
    radius: number,
    dotRadius: number,
): { grow: number; width: number; reach: number } {
    const grow = Math.max(3, dotRadius * 0.5);
    const width = Math.max(1.6, dotRadius * 0.3);
    // The glow's circle sits 1.6 widths out and is up to 1.6 widths wide
    return { grow, width, reach: radius + 1.5 + grow + width * 2.4 + 1 };
}

/**
 * Whether a line's comet is drawn in light rings: the floor under its marchers (`brightness`, 0
 * dark to 1 light, one per marcher) is dark on the whole
 */
export function cometOnDarkFloor(brightness: readonly number[]): boolean {
    if (brightness.length === 0) return false;
    const mean = brightness.reduce((sum, b) => sum + b, 0) / brightness.length;
    return mean < 0.4;
}
