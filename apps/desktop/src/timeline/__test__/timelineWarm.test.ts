import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createResolver,
    type Resolver,
    type TimelineSnapshot,
} from "@openmarch/core";
import {
    defaultWarmScheduler,
    startIdleWarming,
    timeoutWarmScheduler,
    transitionBoundaries,
    WARM_SLICE_BUDGET_MS,
    WARM_TIMEOUT_DELAY_MS,
    warmOrder,
    type WarmScheduler,
} from "../timelineWarm";

/**
 * Idle warming (docs/timeline/phases/05-rendering.md P5.6): the order, the time slicing and the
 * cancellation, against a real resolver.
 */

/** Two marchers through `n` chained direct moves of 4 beats each, starting at beat 1. */
const chainShow = (n: number): TimelineSnapshot => {
    const shapes: TimelineSnapshot["shapes"] = {};
    const transitions: TimelineSnapshot["transitions"] = {};
    const assignments: TimelineSnapshot["assignments"] = [];
    let rowId = 1;
    for (let t = 1; t <= n; t++) {
        shapes[t] = {
            kind: "line",
            geometry: {
                points: [
                    [t, t],
                    [t + 2, t],
                ],
            },
        };
        const start = 1 + 4 * (t - 1);
        transitions[t] = {
            id: t,
            start,
            end: start + 4,
            dest: t,
            slots: 2,
            style: "direct",
            order: "inherit",
            params: null,
        };
        for (const [slot, marcher] of [1, 2].entries())
            assignments.push({
                id: rowId++,
                marcher,
                transition: t,
                slot,
                start,
                end: start + 4,
                layer: 0,
            });
    }
    return {
        marchers: [
            { id: 1, home: [0, 0] },
            { id: 2, home: [2, 0] },
        ],
        shapes,
        transitions,
        assignments,
    };
};

/** A scheduler that runs slices only when the test says so, with the idle time it chooses. */
const manualScheduler = () => {
    const queue: Array<(timeRemaining: () => number) => void> = [];
    const scheduler: WarmScheduler = {
        request(slice) {
            queue.push(slice);
            return () => {
                const i = queue.indexOf(slice);
                if (i >= 0) queue.splice(i, 1);
            };
        },
    };
    return {
        scheduler,
        pending: () => queue.length,
        /** Runs the next slice, which may start this many queries before its time runs out */
        runSlice(queries: number) {
            const slice = queue.shift();
            if (!slice) throw new Error("no slice is scheduled");
            // The first query always runs; then enough idle time for `queries - 1` more
            let checks = 0;
            slice(() => (++checks < queries ? 2 : 0));
        },
    };
};

/** Records the beats a resolver is asked for through `positionsAt`. */
const recordQueries = (resolver: Resolver) => {
    const beats: number[] = [];
    const original = resolver.positionsAt.bind(resolver);
    resolver.positionsAt = (beat, out) => {
        beats.push(beat);
        original(beat, out);
    };
    return beats;
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("transitionBoundaries", () => {
    it("lists every start and end beat once, ascending", () => {
        expect(
            transitionBoundaries({
                3: { start: 9, end: 17 },
                1: { start: 1, end: 9 },
                2: { start: 5, end: 9 },
            }),
        ).toEqual([1, 5, 9, 17]);
        expect(transitionBoundaries({})).toEqual([]);
    });
});

describe("warmOrder", () => {
    it("starts at the beat nearest the focus and alternates outward", () => {
        expect(warmOrder([1, 5, 9, 13, 17, 21], 10)).toEqual([
            9, 13, 5, 17, 1, 21,
        ]);
        // On a boundary, that beat comes first
        expect(warmOrder([1, 5, 9, 13], 9)).toEqual([9, 5, 13, 1]);
    });

    it("prefers the later neighbor on a tie", () => {
        expect(warmOrder([4, 8], 6)).toEqual([8, 4]);
    });

    it("continues on one side once the other runs out", () => {
        expect(warmOrder([1, 5, 9, 13, 17], 2)).toEqual([1, 5, 9, 13, 17]);
        expect(warmOrder([1, 5, 9, 13, 17], 16)).toEqual([17, 13, 9, 5, 1]);
        expect(warmOrder([1, 5, 9], -10)).toEqual([1, 5, 9]);
        expect(warmOrder([1, 5, 9], 100)).toEqual([9, 5, 1]);
    });

    it("visits every beat exactly once", () => {
        const beats = Array.from({ length: 50 }, (_, i) => i * 3 + 1);
        for (const focus of [-1, 0, 1, 37.5, 75, 148, 500]) {
            const order = warmOrder(beats, focus);
            expect([...order].sort((a, b) => a - b)).toEqual(beats);
        }
        expect(warmOrder([], 4)).toEqual([]);
    });
});

describe("startIdleWarming", () => {
    it("queries the beats in order, a few per slice, until done", () => {
        const resolver = createResolver(chainShow(5));
        const queried = recordQueries(resolver);
        const { scheduler, runSlice, pending } = manualScheduler();
        const onDone = vi.fn();
        const beats = warmOrder([1, 5, 9, 13, 17, 21], 10);

        const handle = startIdleWarming({
            resolver,
            beats,
            scheduler,
            onDone,
        });
        // Nothing runs until the renderer is idle
        expect(queried).toEqual([]);
        expect(pending()).toBe(1);

        runSlice(2);
        expect(queried).toEqual([9, 13]);
        expect(handle.warmed).toBe(2);
        expect(handle.done).toBe(false);

        // A slice always makes progress, even with no idle time left
        runSlice(0);
        expect(queried).toEqual([9, 13, 5]);

        runSlice(10);
        expect(queried).toEqual(beats);
        expect(handle.done).toBe(true);
        expect(onDone).toHaveBeenCalledTimes(1);
        expect(pending()).toBe(0);
    });

    it("leaves the resolver fully compiled: a later frame compiles nothing", () => {
        const show = chainShow(8);
        const resolver = createResolver(show);
        const { scheduler, runSlice } = manualScheduler();
        const handle = startIdleWarming({
            resolver,
            beats: warmOrder(transitionBoundaries(show.transitions), 15),
            scheduler,
        });
        while (!handle.done) runSlice(3);

        resolver.resetCounters();
        const out = new Float64Array(4);
        for (const beat of [0, 3, 7.5, 16, 22, 31.9, 40]) {
            resolver.positionsAt(beat, out);
        }
        const counters = resolver.counters();
        expect(counters.originsComputed).toBe(0);
        expect(counters.ftlEntriesComputed).toBe(0);
        expect(resolver.checkCacheClosure()).toBe(true);
    });

    it("stops on cancel and drops the pending slice", () => {
        const resolver = createResolver(chainShow(4));
        const queried = recordQueries(resolver);
        const { scheduler, runSlice, pending } = manualScheduler();
        const onDone = vi.fn();
        const handle = startIdleWarming({
            resolver,
            beats: [1, 5, 9, 13, 17],
            scheduler,
            onDone,
        });
        runSlice(1);
        handle.cancel();
        handle.cancel();
        expect(pending()).toBe(0);
        expect(queried).toEqual([1]);
        expect(handle.done).toBe(false);
        expect(onDone).not.toHaveBeenCalled();
    });

    it("finishes at once with no beats", () => {
        const { scheduler, pending } = manualScheduler();
        const onDone = vi.fn();
        const handle = startIdleWarming({
            resolver: createResolver(chainShow(1)),
            beats: [],
            scheduler,
            onDone,
        });
        expect(handle.done).toBe(true);
        expect(pending()).toBe(0);
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("stops quietly when a query throws", () => {
        const resolver = createResolver(chainShow(2));
        resolver.positionsAt = () => {
            throw new Error("broken show");
        };
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const { scheduler, runSlice, pending } = manualScheduler();
        const handle = startIdleWarming({
            resolver,
            beats: [1, 5, 9],
            scheduler,
        });
        runSlice(5);
        expect(handle.done).toBe(true);
        expect(pending()).toBe(0);
        expect(error).toHaveBeenCalledTimes(1);
    });
});

describe("schedulers", () => {
    it("timeouts: one slice per delay, each within its budget", () => {
        vi.useFakeTimers();
        let clock = 0;
        vi.spyOn(performance, "now").mockImplementation(() => clock);
        const resolver = createResolver(chainShow(10));
        const queried = recordQueries(resolver);
        const original = resolver.positionsAt;
        // Each query takes 1.5 ms of the slice's budget
        resolver.positionsAt = (beat, out) => {
            clock += 1.5;
            original(beat, out);
        };
        const beats = transitionBoundaries(chainShow(10).transitions);
        const handle = startIdleWarming({
            resolver,
            beats,
            scheduler: timeoutWarmScheduler,
        });

        vi.advanceTimersByTime(WARM_TIMEOUT_DELAY_MS - 1);
        expect(queried).toEqual([]);
        vi.advanceTimersByTime(1);
        // A 4 ms budget at 1.5 ms per query: queries start at 0 and 1.5 ms; at 3 ms only 1 ms
        // is left, which is too little to start another
        const perSlice = Math.ceil((WARM_SLICE_BUDGET_MS - 1) / 1.5);
        expect(perSlice).toBe(2);
        expect(queried).toHaveLength(perSlice);

        vi.advanceTimersByTime(WARM_TIMEOUT_DELAY_MS);
        expect(queried).toHaveLength(2 * perSlice);

        handle.cancel();
        vi.advanceTimersByTime(10 * WARM_TIMEOUT_DELAY_MS);
        expect(queried).toHaveLength(2 * perSlice);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("uses requestIdleCallback and its deadline when the environment has it", () => {
        const callbacks = new Map<
            number,
            (deadline: { timeRemaining(): number }) => void
        >();
        let nextHandle = 1;
        vi.stubGlobal(
            "requestIdleCallback",
            (cb: (deadline: { timeRemaining(): number }) => void) => {
                callbacks.set(nextHandle, cb);
                return nextHandle++;
            },
        );
        vi.stubGlobal("cancelIdleCallback", (handle: number) =>
            callbacks.delete(handle),
        );
        try {
            const scheduler = defaultWarmScheduler();
            expect(scheduler).not.toBe(timeoutWarmScheduler);
            const remaining: number[] = [];
            scheduler.request((timeRemaining) =>
                remaining.push(timeRemaining()),
            );
            expect(callbacks.size).toBe(1);
            callbacks.get(1)!({ timeRemaining: () => 7 });
            expect(remaining).toEqual([7]);

            const cancel = scheduler.request(() => {});
            expect(callbacks.has(2)).toBe(true);
            cancel();
            expect(callbacks.has(2)).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("falls back to timeouts without requestIdleCallback", () => {
        vi.stubGlobal("requestIdleCallback", undefined);
        try {
            expect(defaultWarmScheduler()).toBe(timeoutWarmScheduler);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
