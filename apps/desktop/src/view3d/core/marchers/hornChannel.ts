/**
 * Turns one marcher's compiled Horn/Equipment segments into what the
 * channel plays over the show (performer-behavior.md sections 2.2, 3 and
 * 8.3): a hold, or a transition from one hold to another.
 *
 * Timing, in the show's count clock (the number `c` is count c's click):
 *
 * - a state holds from its click;
 * - a transition of L counts runs from the click of `count - L + 1` to the
 *   click of its count, as the compile gives it;
 * - a snap (a zero-length transition) is keyed in fixed time: it runs for
 *   {@link SNAP_SECONDS} before its click, at the tempo of the count before
 *   the click, and never longer than that count.
 *
 * Values without an animation yet (battery and guard states, tosses, the
 * choreography phrase taking the channel over) keep the hold underneath:
 * their assets are build step 7. Pure: no three.js.
 */
import type { CueSegment, PerformerCarry } from "@openmarch/core";
import type { HoldFamily, HoldState } from "../instruments/holds";

/** What a performer carrying `family` carries, as the cue compile groups it. */
export function performerCarryOf(family: HoldFamily | null): PerformerCarry {
    switch (family) {
        case null:
            return "none";
        case "snare":
        case "tenors":
        case "bass":
        case "cymbals":
            return "battery";
        case "flag":
        case "swingFlag":
        case "doubleSwingFlag":
            return "flag";
        case "rifle":
            return "rifle";
        case "sabre":
            return "sabre";
        default:
            return "winds";
    }
}

/** How long a snap takes, in seconds (glossary: "about 0.2 s"). */
export const SNAP_SECONDS = 0.2;

/** The hold a library value plays, or null when it has no animation yet. */
export function hornHoldOf(value: string | null): HoldState | null {
    switch (value) {
        case "builtin:horn.up":
            return "up";
        case "builtin:horn.down":
            return "carry";
        case "builtin:horn.trail":
            return "trail";
        default:
            return null;
    }
}

export interface HornEvent {
    /** Count clock where this event starts. */
    from: number;
    /** A transition's end (its click); equal to `from` for a hold. */
    to: number;
    /** The hold, or a transition's target. */
    state: HoldState;
    /** A transition's start hold; null for a hold. */
    fromState: HoldState | null;
}

export interface HornPlanOptions {
    /** The hold before any cue: the look's (the window's preview setting). */
    defaultState: HoldState;
    /** Seconds per count of count index `k` (the count clock's tempo). */
    secondsPerCount: (k: number) => number;
    snapSeconds?: number;
}

/**
 * The channel's events in order, each running until the next one's `from`.
 * A transition that would start before the event before it (a cut-short
 * pile-up) starts where that one does.
 */
export function planHornChannel(
    segments: readonly CueSegment[],
    {
        defaultState,
        secondsPerCount,
        snapSeconds = SNAP_SECONDS,
    }: HornPlanOptions,
): HornEvent[] {
    const out: HornEvent[] = [
        { from: 0, to: 0, state: defaultState, fromState: null },
    ];
    /** Appends `e`; an event starting where the last one does replaces it. */
    const push = (e: HornEvent) => {
        const last = out[out.length - 1];
        const from = Math.max(e.from, last.from);
        if (from === last.from) out.pop();
        out.push({ ...e, from, to: Math.max(e.to, from) });
    };
    const hold = (at: number, state: HoldState) =>
        push({ from: at, to: at, state, fromState: null });
    let current = defaultState;
    for (const seg of segments) {
        // the default is the first event; phrases and take-overs keep the
        // hold underneath until they have animations
        if (seg.kind === "default" || seg.kind === "phrase") continue;
        if (seg.takenOverFrom) continue;
        const target = hornHoldOf(seg.value);
        if (target === null || target === current) continue;
        if (seg.kind === "state") {
            hold(seg.from, target);
        } else {
            let from = seg.from;
            if (seg.snap || !(seg.to > seg.from)) {
                const k = Math.max(Math.ceil(seg.to) - 1, 0);
                from = seg.to - Math.min(snapSeconds / secondsPerCount(k), 1);
            }
            push({ from, to: seg.to, state: target, fromState: current });
            hold(seg.to, target);
        }
        current = target;
    }
    return out;
}

/**
 * The event playing at count clock `c`: the last one starting at or
 * before it. `hint`, the last answer, makes a forward scan cheap.
 */
export function hornEventAt(
    events: readonly HornEvent[],
    c: number,
    hint = 0,
): number {
    let i =
        hint >= 0 && hint < events.length && events[hint].from <= c ? hint : 0;
    while (i + 1 < events.length && events[i + 1].from <= c) i++;
    return i;
}
