// cspell:ignore playhead
import type { Resolver, TransitionRow } from "@openmarch/core";

/**
 * Idle warming (docs/timeline/phases/05-rendering.md P5.6, spec §9.4: "in idle time: warm the
 * cache outward from the playhead").
 *
 * After a cold build or a batch, nothing is compiled until something asks (spec §9.4). Warming
 * asks ahead of time, in small slices while the renderer is idle: it queries `positionsAt` at the
 * show's transition boundaries, nearest the focus beat first, then alternating outward. Each query
 * pull-compiles the origins and follow-the-leader entries it needs, recursing into earlier ones, so
 * after one pass every node a frame could need is cached (a node the pass misses is still
 * compiled on its first query). It uses only the public resolver API.
 *
 * One query is the smallest unit of work. A single query can compile a large part of the show on
 * a cold cache, so the first slice may run longer than its budget; the rest are small.
 */

/** How long one slice may keep querying when the scheduler gives no deadline, in ms. */
export const WARM_SLICE_BUDGET_MS = 4;
/** The delay between slices when `requestIdleCallback` is missing, in ms (about one frame). */
export const WARM_TIMEOUT_DELAY_MS = 16;
/** A slice stops starting new queries when less than this much idle time is left, in ms. */
const MIN_REMAINING_MS = 1;

/** Runs `slice` when the renderer is idle. Returns a function that cancels the request. */
export interface WarmScheduler {
    request(slice: (timeRemaining: () => number) => void): () => void;
}

const now = (): number =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

/** `setTimeout` slices with a fixed budget each, for environments without `requestIdleCallback`. */
export const timeoutWarmScheduler: WarmScheduler = {
    request(slice) {
        const handle = setTimeout(() => {
            const until = now() + WARM_SLICE_BUDGET_MS;
            slice(() => until - now());
        }, WARM_TIMEOUT_DELAY_MS);
        return () => clearTimeout(handle);
    },
};

/** `requestIdleCallback` where the environment has it (the Electron renderer), else timeouts. */
export function defaultWarmScheduler(): WarmScheduler {
    const g = globalThis as typeof globalThis & {
        requestIdleCallback?: (
            cb: (deadline: { timeRemaining(): number }) => void,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
    };
    const request = g.requestIdleCallback;
    const cancel = g.cancelIdleCallback;
    if (typeof request !== "function" || typeof cancel !== "function")
        return timeoutWarmScheduler;
    return {
        request(slice) {
            const handle = request.call(g, (deadline) =>
                slice(() => deadline.timeRemaining()),
            );
            return () => cancel.call(g, handle);
        },
    };
}

/** Every transition's start and end beat, ascending and without duplicates. */
export function transitionBoundaries(
    transitions: Readonly<Record<number, Pick<TransitionRow, "start" | "end">>>,
): number[] {
    const beats = new Set<number>();
    for (const t of Object.values(transitions)) {
        beats.add(t.start);
        beats.add(t.end);
    }
    return [...beats].sort((a, b) => a - b);
}

/**
 * The order to warm `beats` (ascending) in: the beat nearest `focus` first, then alternately the
 * next later and the next earlier one, so the cache fills outward from the focus.
 */
export function warmOrder(beats: readonly number[], focus: number): number[] {
    if (beats.length === 0) return [];
    // First index with beats[i] >= focus
    let lo = 0;
    let hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid]! < focus) lo = mid + 1;
        else hi = mid;
    }
    let later = lo;
    let earlier = lo - 1;
    const order: number[] = [];
    // Start from whichever neighbor is nearer the focus (the later one on a tie)
    let takeLater =
        earlier < 0 ||
        (later < beats.length &&
            beats[later]! - focus <= focus - beats[earlier]!);
    while (later < beats.length || earlier >= 0) {
        if ((takeLater && later < beats.length) || earlier < 0)
            order.push(beats[later++]!);
        else order.push(beats[earlier--]!);
        takeLater = !takeLater;
    }
    return order;
}

/** A running warm pass. */
export interface WarmHandle {
    /** Stops the pass; no more queries run. Safe to call more than once. */
    cancel(): void;
    /** Whether every beat was queried, or the pass stopped on an error */
    readonly done: boolean;
    /** How many beats have been queried so far */
    readonly warmed: number;
}

/**
 * Starts warming `resolver` at `beats`, in the order given, one idle slice at a time. The caller
 * cancels the pass before the resolver's inputs change (a batch, a reset, a stop), and starts a
 * new one afterwards.
 */
export function startIdleWarming({
    resolver,
    beats,
    scheduler = defaultWarmScheduler(),
    onDone,
}: {
    resolver: Resolver;
    beats: readonly number[];
    scheduler?: WarmScheduler;
    onDone?: () => void;
}): WarmHandle {
    let next = 0;
    let cancelled = false;
    let done = false;
    let cancelRequest: (() => void) | null = null;
    let out: Float64Array | null = null;

    const finish = () => {
        done = true;
        cancelRequest = null;
        onDone?.();
    };

    const slice = (timeRemaining: () => number) => {
        cancelRequest = null;
        if (cancelled) return;
        try {
            // Allocated on the first slice; a marcher add or delete comes with a batch, which
            // cancels this pass
            out ??= new Float64Array(2 * resolver.marcherIds().length);
            do resolver.positionsAt(beats[next++]!, out);
            while (next < beats.length && timeRemaining() > MIN_REMAINING_MS);
        } catch (error) {
            // Warming is an optimization: the same query on a frame reports the problem
            console.error("Timeline idle warming stopped", error);
            finish();
            return;
        }
        if (next >= beats.length) finish();
        else cancelRequest = scheduler.request(slice);
    };

    if (beats.length === 0) finish();
    else cancelRequest = scheduler.request(slice);

    return {
        cancel() {
            cancelled = true;
            cancelRequest?.();
            cancelRequest = null;
        },
        get done() {
            return done;
        },
        get warmed() {
            return next;
        },
    };
}
