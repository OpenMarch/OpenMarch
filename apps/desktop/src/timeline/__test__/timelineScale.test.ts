import { expect } from "vitest";
import os from "node:os";
import v8 from "node:v8";
import vm from "node:vm";
import { writeFileSync } from "node:fs";
import {
    createResolver,
    type ChangeBatch,
    type ShapeRow,
    type XY,
} from "@openmarch/core";
import { describeDbTests } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import { subscribeTimelineChanges } from "@/db-functions/timelineChanges";
import { updateTimelineShapesInTransaction } from "@/db-functions/timelineShapes";
import { loadTimelineFixture } from "../fixtures/loadTimelineFixture";
import { sc11 } from "../fixtures/scenarioFixtures";
import { applyBatchToMirror, createTimelineHost } from "../timelineHost";
import { readTimelineTables } from "../timelineRows";
import { startIdleWarming, transitionBoundaries } from "../timelineWarm";

/**
 * QA-SC-11 at full scale on a real database, measuring the QA-PF budgets (spec §12.9,
 * docs/timeline/phases/05-rendering.md P5.8). Missing a budget is a finding, not a failure: the
 * test asserts only that the numbers exist and that the resolver stays correct. Set
 * `TIMELINE_PF_OUT` to a file path to get the numbers as JSON.
 */

const SEED = 1;

const now = () => performance.now();
const round = (ms: number) => Math.round(ms * 1000) / 1000;
const percentile = (xs: number[], p: number) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
};
const median = (xs: number[]) => percentile(xs, 0.5);

/** A forced garbage collection, for the heap measurements. */
const collectGarbage = (): (() => void) => {
    v8.setFlagsFromString("--expose-gc");
    return vm.runInNewContext("gc") as () => void;
};

/** `shape` moved by (dx, dy), whatever its kind. */
const translated = (shape: ShapeRow, dx: number, dy: number): ShapeRow => {
    const move = ([x, y]: XY): XY => [x + dx, y + dy];
    switch (shape.kind) {
        case "line":
        case "freehand":
            return {
                kind: shape.kind,
                geometry: { points: shape.geometry.points.map(move) },
            };
        case "box":
        case "block":
            return {
                ...shape,
                geometry: {
                    ...shape.geometry,
                    origin: move(shape.geometry.origin),
                },
            } as ShapeRow;
        case "circle":
            return {
                kind: "circle",
                geometry: {
                    ...shape.geometry,
                    center: move(shape.geometry.center),
                },
            };
    }
};

describeDbTests("QA-SC-11 scale and the QA-PF budgets", (it) => {
    // eslint-disable-next-line max-lines-per-function
    it("measures QA-PF-01 to QA-PF-04 on a loaded SC-11 show", async ({
        db,
    }) => {
        const fixture = sc11(SEED);
        const { show } = fixture;

        let t = now();
        const loaded = await loadTimelineFixture(db, fixture);
        const loadMs = now() - t;

        // Cold build, as the store does it: read the tables, build the host
        t = now();
        const tables = await readTimelineTables(db);
        const readMs = now() - t;
        t = now();
        const host = createTimelineHost(tables);
        const createMs = now() - t;
        const { resolver } = host;
        const ids = resolver.marcherIds();
        expect(ids).toHaveLength(250);

        // QA-PF-02: cold warmAll, on fresh resolvers over the same rows
        const warmAllRuns: number[] = [];
        for (let i = 0; i < 7; i++) {
            const fresh = createResolver(tables.snapshot);
            t = now();
            fresh.warmAll();
            warmAllRuns.push(now() - t);
        }

        // Idle warming (P5.6) on a fresh resolver, with every slice run back to back: the total,
        // and the longest single query (the first, which compiles the most)
        const idleFresh = createResolver(tables.snapshot);
        const boundaries = transitionBoundaries(tables.snapshot.transitions);
        const queryTimes: number[] = [];
        const timedResolver = {
            ...idleFresh,
            marcherIds: () => idleFresh.marcherIds(),
            positionsAt: (beat: number, out: Float64Array) => {
                const start = now();
                idleFresh.positionsAt(beat, out);
                queryTimes.push(now() - start);
            },
        };
        const slices: Array<(timeRemaining: () => number) => void> = [];
        const pass = startIdleWarming({
            resolver: timedResolver,
            beats: boundaries,
            scheduler: {
                request: (slice) => {
                    slices.push(slice);
                    return () => {};
                },
            },
        });
        let sliceCount = 0;
        while (slices.length > 0) {
            const until = now() + 4;
            slices.shift()!(() => until - now());
            sliceCount++;
        }
        expect(pass.done).toBe(true);
        idleFresh.resetCounters();
        const afterIdle = new Float64Array(2 * ids.length);
        idleFresh.positionsAt(boundaries[0]! + 0.5, afterIdle);
        expect(idleFresh.counters().originsComputed).toBe(0);

        // QA-PF-01: positionsAt for every marcher, warm (resolver only, no drawing)
        resolver.warmAll();
        const showEnd = Math.max(
            ...Object.values(show.transitions).map((tr) => tr.end),
        );
        const out = new Float64Array(2 * ids.length);
        const frames = 3000;
        for (let i = 0; i < 300; i++)
            resolver.positionsAt(1 + ((showEnd - 1) * i) / 300, out);
        const frameTimes: number[] = [];
        for (let i = 0; i < frames; i++) {
            const beat = 1 + ((showEnd - 1) * i) / frames;
            t = now();
            resolver.positionsAt(beat, out);
            frameTimes.push(now() - t);
        }

        // QA-PF-03: the worst-case edit, the first shape of the deepest chain (group 0's first
        // transition, fixture transition 1), committed through the db-functions
        const chain = show.assignments
            .filter((a) => a.marcher === 1 && a.layer === 0)
            .sort((a, b) => a.start - b.start);
        const playBeat = chain[chain.length - 1]!.end - 0.5;
        const firstShape = show.transitions[chain[0]!.transition]!.dest!;
        const shapeId = loaded.shapes.get(firstShape)!;
        let batch: ChangeBatch | null = null;
        const unsubscribe = subscribeTimelineChanges((event) => {
            if (event.kind === "batch") batch = event.batch;
        });
        const moved = translated(show.shapes[firstShape]!, 0, 4);
        await transactionWithHistory(db, "moveFirstShape", (tx) =>
            updateTimelineShapesInTransaction({
                tx,
                modifiedShapes: [
                    { id: shapeId, kind: moved.kind, geometry: moved.geometry },
                ],
            }),
        );
        unsubscribe();
        expect(batch).not.toBeNull();
        t = now();
        applyBatchToMirror(host, batch!);
        const mirrorMs = now() - t;
        t = now();
        const report = resolver.notify(batch!);
        const walkMs = now() - t;
        resolver.resetCounters();
        t = now();
        resolver.positionsAt(playBeat, out);
        const pullMs = now() - t;
        const pulled = resolver.counters();
        t = now();
        resolver.positionsAt(playBeat + 0.25, out);
        const nextFrameMs = now() - t;

        // The edited resolver agrees with a fresh build over the edited tables
        const after = createResolver((await readTimelineTables(db)).snapshot);
        for (const m of ids.filter((_, i) => i % 10 === 0))
            for (const beat of [1, playBeat / 2, playBeat, showEnd]) {
                const [x, y] = resolver.positionAt(m, beat);
                const [ax, ay] = after.positionAt(m, beat);
                expect(Math.abs(x - ax)).toBeLessThan(1e-6);
                expect(Math.abs(y - ay)).toBeLessThan(1e-6);
            }
        expect(resolver.checkCacheClosure()).toBe(true);

        // QA-PF-04: heap held by one resolver over these rows after warmAll (the rows are shared
        // and not counted), median of 3
        const gc = collectGarbage();
        const heapRuns: number[] = [];
        const keep: unknown[] = [];
        for (let i = 0; i < 3; i++) {
            gc();
            const before = process.memoryUsage().heapUsed;
            const r = createResolver(tables.snapshot);
            r.warmAll();
            keep.push(r);
            gc();
            heapRuns.push(process.memoryUsage().heapUsed - before);
        }
        expect(keep).toHaveLength(3);

        const results = {
            seed: SEED,
            machine: {
                cpu: os.cpus()[0]?.model,
                cores: os.cpus().length,
                memoryGb: Math.round(os.totalmem() / 2 ** 30),
                platform: `${os.platform()} ${os.release()} ${os.arch()}`,
                node: process.version,
            },
            show: {
                marchers: show.marchers.length,
                transitions: Object.keys(show.transitions).length,
                shapes: Object.keys(show.shapes).length,
                timelines: fixture.timelines!.length,
                assignments: show.assignments.length,
                stealRows: show.assignments.filter((a) => a.layer === 1).length,
                chainDepth: chain.length,
                showEndBeat: showEnd,
            },
            setup: {
                loadFixtureMs: round(loadMs),
                readTablesMs: round(readMs),
                createHostMs: round(createMs),
            },
            pf01PositionsAtWarmMs: {
                frames,
                p50: round(median(frameTimes)),
                p99: round(percentile(frameTimes, 0.99)),
                max: round(Math.max(...frameTimes)),
            },
            pf02WarmAllColdMs: {
                runs: warmAllRuns.map(round),
                median: round(median(warmAllRuns)),
            },
            idleWarming: {
                beats: boundaries.length,
                slices: sliceCount,
                totalMs: round(queryTimes.reduce((a, b) => a + b, 0)),
                longestQueryMs: round(Math.max(...queryTimes)),
                medianQueryMs: round(median(queryTimes)),
            },
            pf03WorstEdit: {
                playBeat: playBeat,
                mirrorMs: round(mirrorMs),
                walkMs: round(walkMs),
                firstPullMs: round(pullMs),
                nextFrameMs: round(nextFrameMs),
                originsDirtied: report.originsDirtied,
                ftlEntriesDirtied: report.ftlEntriesDirtied,
                originsRecomputedByPull: pulled.originsComputed,
                ftlEntriesRecomputedByPull: pulled.ftlEntriesComputed,
            },
            pf04ResolverHeapMb: {
                runs: heapRuns.map((b) => Math.round(b / 1e4) / 100),
                median: Math.round(median(heapRuns) / 1e4) / 100,
            },
        };
        if (process.env.TIMELINE_PF_OUT)
            writeFileSync(
                process.env.TIMELINE_PF_OUT,
                JSON.stringify(results, null, 2),
            );

        for (const value of [
            results.pf01PositionsAtWarmMs.p99,
            results.pf02WarmAllColdMs.median,
            results.pf03WorstEdit.walkMs,
            results.pf03WorstEdit.firstPullMs,
        ])
            expect(Number.isFinite(value)).toBe(true);
        expect(report.originsDirtied).toBeGreaterThan(0);
    });
});
