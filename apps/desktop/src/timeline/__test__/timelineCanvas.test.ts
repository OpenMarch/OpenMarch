import { afterEach, describe, expect, it, vi } from "vitest";
import type { Resolver } from "@openmarch/core";
import Beat, {
    calculateTimestamps,
    fromDatabaseBeat,
} from "@/global/classes/Beat";
import { fromDatabasePages } from "@/global/classes/Page";
import type { DatabaseBeat, DatabasePage } from "@/db-functions";
import {
    pageEndBeat,
    playbackBeat,
    TimelinePositionBuffer,
    type TimelinePositionSource,
} from "../timelineCanvas";
import { beatAtTime } from "../timeMap";
import { useTimelineResolverStore } from "../timelineStore";

/** Beats as `useTimingObjects` builds them: the fixed zero-length beat 0, then `durations`. */
const makeBeats = (durations: number[]): Beat[] =>
    calculateTimestamps(
        [0, ...durations].map((duration, i) =>
            fromDatabaseBeat(
                {
                    id: i,
                    position: i,
                    duration,
                    include_in_measure: true,
                    notes: null,
                } as DatabaseBeat,
                i,
            ),
        ),
    );

/** A source whose position for marcher `id` at `beat` is (id * 100 + beat, -id). */
const fakeSource = (initialIds: number[]) => {
    let ids = initialIds;
    let ready = true;
    const source: TimelinePositionSource & {
        setIds: (next: number[]) => void;
        setReady: (next: boolean) => void;
    } = {
        marcherIds: () => (ready ? ids : []),
        positionsAt: vi.fn((beat: number, out: Float64Array) => {
            if (!ready || out.length !== 2 * ids.length) return false;
            ids.forEach((id, i) => {
                out[2 * i] = id * 100 + beat;
                out[2 * i + 1] = -id;
            });
            return true;
        }),
        setIds: (next) => (ids = next),
        setReady: (next) => (ready = next),
    };
    return source;
};

const marcher = (id: number) => ({
    marcherObj: { id },
    at: null as [number, number] | null,
});

const applyAll = (
    buffer: TimelinePositionBuffer,
    marchers: ReturnType<typeof marcher>[],
) =>
    buffer.forEachMarcher(marchers, (m, x, y) => {
        m.at = [x, y];
    });

describe("playbackBeat", () => {
    const beats = makeBeats([0.5, 0.5, 1, 1]);

    it("maps playback milliseconds to resolver beats, from beat 1 at time 0", () => {
        expect(playbackBeat(beats, 0)).toBe(1);
        expect(playbackBeat(beats, 250)).toBeCloseTo(1.5, 12);
        expect(playbackBeat(beats, 500)).toBe(2);
        expect(playbackBeat(beats, 1000)).toBe(3);
        expect(playbackBeat(beats, 1500)).toBeCloseTo(3.5, 12);
        expect(playbackBeat(beats, 3000)).toBe(5);
        expect(playbackBeat(beats, 10_000)).toBe(5);
    });

    it("agrees with beatAtTime on seconds", () => {
        for (const ms of [0, 1, 333, 999.5, 2718])
            expect(playbackBeat(beats, ms)).toBe(beatAtTime(beats, ms / 1000));
    });
});

describe("TimelinePositionBuffer", () => {
    it("fills positions in marcher id order and applies them by id", () => {
        const source = fakeSource([1, 2, 5]);
        const buffer = new TimelinePositionBuffer(source);
        expect(buffer.fill(3.5)).toBe(true);
        expect([...buffer.buffer]).toEqual([103.5, -1, 203.5, -2, 503.5, -5]);
        expect(buffer.marcherIds).toEqual([1, 2, 5]);

        // Canvas order differs from id order; application is by id
        const marchers = [marcher(5), marcher(1), marcher(2)];
        applyAll(buffer, marchers);
        expect(marchers.map((m) => m.at)).toEqual([
            [503.5, -5],
            [103.5, -1],
            [203.5, -2],
        ]);
    });

    it("reuses its Float64Array while the marcher count is unchanged", () => {
        const source = fakeSource([1, 2]);
        const buffer = new TimelinePositionBuffer(source);
        buffer.fill(1);
        const first = buffer.buffer;
        buffer.fill(2);
        buffer.fill(2.25);
        expect(buffer.buffer).toBe(first);
        expect([...buffer.buffer]).toEqual([102.25, -1, 202.25, -2]);
    });

    it("resizes when marchers are added or deleted", () => {
        const source = fakeSource([1, 2]);
        const buffer = new TimelinePositionBuffer(source);
        buffer.fill(1);
        const first = buffer.buffer;

        source.setIds([1, 2, 3]);
        expect(buffer.fill(1)).toBe(true);
        expect(buffer.buffer).not.toBe(first);
        expect(buffer.buffer).toHaveLength(6);
        expect(buffer.marcherIds).toEqual([1, 2, 3]);

        source.setIds([3]);
        expect(buffer.fill(4)).toBe(true);
        expect([...buffer.buffer]).toEqual([304, -3]);
    });

    it("skips canvas marchers the resolver doesn't know", () => {
        const buffer = new TimelinePositionBuffer(fakeSource([2]));
        buffer.fill(1);
        const marchers = [marcher(1), marcher(2), marcher(3)];
        applyAll(buffer, marchers);
        expect(marchers.map((m) => m.at)).toEqual([null, [201, -2], null]);
    });

    it("leaves marchers where they are when positionsAt returns false", () => {
        const source = fakeSource([1, 2]);
        const buffer = new TimelinePositionBuffer(source);
        const marchers = [marcher(1), marcher(2)];
        buffer.fill(2);
        applyAll(buffer, marchers);
        expect(marchers.map((m) => m.at)).toEqual([
            [102, -1],
            [202, -2],
        ]);

        source.setReady(false);
        expect(buffer.fill(3)).toBe(false);
        expect(buffer.marcherIds).toEqual([]);
        applyAll(buffer, marchers);
        // Not moved, and never sent to (0, 0)
        expect(marchers.map((m) => m.at)).toEqual([
            [102, -1],
            [202, -2],
        ]);
    });
});

describe("TimelinePositionBuffer on the resolver store", () => {
    afterEach(() => {
        useTimelineResolverStore.setState({
            status: "off",
            resolver: null,
            version: 0,
            error: null,
        });
    });

    /** Enough of a resolver for the store's positionsAt and timelineMarcherIds. */
    const fakeResolver = (ids: number[]) =>
        ({
            marcherIds: () => ids,
            positionsAt: (beat: number, out: Float64Array) => {
                if (out.length !== 2 * ids.length) throw new Error("size");
                ids.forEach((id, i) => {
                    out[2 * i] = id + beat;
                    out[2 * i + 1] = id - beat;
                });
            },
        }) as unknown as Resolver;

    it("returns false with no resolver, then fills once one is ready", () => {
        const buffer = new TimelinePositionBuffer();
        expect(buffer.fill(1)).toBe(false);

        useTimelineResolverStore.setState({
            status: "ready",
            resolver: fakeResolver([4, 7]),
        });
        expect(buffer.fill(2)).toBe(true);
        expect([...buffer.buffer]).toEqual([6, 2, 9, 5]);
    });

    it("resizes after the store's marcher count changes", () => {
        useTimelineResolverStore.setState({
            status: "ready",
            resolver: fakeResolver([4, 7]),
        });
        const buffer = new TimelinePositionBuffer();
        expect(buffer.fill(1)).toBe(true);

        useTimelineResolverStore.setState({
            resolver: fakeResolver([4, 7, 9]),
        });
        expect(buffer.fill(1)).toBe(true);
        expect([...buffer.buffer]).toEqual([5, 3, 8, 6, 10, 8]);
    });
});

describe("pageEndBeat", () => {
    // Beat 0 (fixed, zero length), then 12 beats of 0.5 s
    const beats = makeBeats(Array.from({ length: 12 }, () => 0.5));
    const databasePages: DatabasePage[] = [
        { id: 0, start_beat: 0, is_subset: false, notes: null },
        { id: 1, start_beat: 1, is_subset: false, notes: null },
        { id: 2, start_beat: 5, is_subset: false, notes: null },
        { id: 3, start_beat: 9, is_subset: false, notes: null },
    ] as DatabasePage[];
    const pages = fromDatabasePages({
        databasePages,
        allMeasures: [],
        allBeats: beats,
        lastPageCounts: 4,
    });

    it("is the start beat of the next page, from the app's own page construction", () => {
        expect(pages.map((p) => p.id)).toEqual([0, 1, 2, 3]);
        // Page 0 holds only beat 0; its end is beat 1, which is show time 0
        expect(pageEndBeat(pages[0]!)).toBe(1);
        // Page 1 covers beats [1, 5), page 2 [5, 9), page 3 [9, 13)
        expect(pageEndBeat(pages[1]!)).toBe(5);
        expect(pageEndBeat(pages[2]!)).toBe(9);
        expect(pageEndBeat(pages[3]!)).toBe(13);
    });

    it("is the beat at the page-mode keyframe time (page.timestamp + page.duration)", () => {
        for (const page of pages)
            expect(pageEndBeat(page)).toBe(
                beatAtTime(beats, page.timestamp + page.duration),
            );
    });

    it("clamps the last page to the show's beats", () => {
        const [lastPage] = fromDatabasePages({
            databasePages: [
                { id: 1, start_beat: 9, is_subset: false, notes: null },
            ] as DatabasePage[],
            allMeasures: [],
            allBeats: beats,
            lastPageCounts: 100,
        });
        expect(pageEndBeat(lastPage!)).toBe(beats.length);
    });

    it("is 0 for a page with no beats", () => {
        expect(pageEndBeat({ beats: [] })).toBe(0);
    });
});
