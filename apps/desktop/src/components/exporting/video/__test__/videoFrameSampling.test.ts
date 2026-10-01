import { describe, expect, it, vi } from "vitest";
import { createResolver } from "@openmarch/core";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import { beatAtTime, type BeatTiming } from "@/timeline/timeMap";
import { ResolverFrameSampler } from "@/timeline/timelineExport";
import {
    setMarcherPositionsAtTime,
    type VideoRenderContext,
} from "../videoFrameRenderer";
import type { MarcherTimeline } from "@/utilities/Keyframes";

/** Beat 0 is the zero-length beat; beats 1..count last 0.4 s then 0.6 s (a tempo change). */
const beats: BeatTiming[] = (() => {
    const out: BeatTiming[] = [{ timestamp: 0, duration: 0 }];
    let t = 0;
    for (let b = 1; b <= 30; b++) {
        const d = b <= 10 ? 0.4 : 0.6;
        out.push({ timestamp: t, duration: d });
        t += d;
    }
    return out;
})();

const show = GOLDEN_FIXTURES.find((g) => g.name === "G6")!.build().show;

function fakeContext(
    overrides: Partial<VideoRenderContext>,
    ids: number[],
): {
    context: VideoRenderContext;
    set: Record<number, ReturnType<typeof vi.fn>>;
} {
    const set: Record<number, ReturnType<typeof vi.fn>> = {};
    const canvasMarchersById: Record<number, unknown> = {};
    for (const id of ids) {
        set[id] = vi.fn();
        canvasMarchersById[id] = {
            marcherObj: { id },
            setLiveCoordinates: set[id],
        };
    }
    return {
        context: {
            canvasMarchersById,
            marcherTimelines: new Map(),
            frameSampler: null,
            ...overrides,
        } as unknown as VideoRenderContext,
        set,
    };
}

describe("video frames in timeline mode", () => {
    const resolver = createResolver(show);
    const ids = [...resolver.marcherIds()];

    it("places each marcher at the resolver's position at the frame's beat", () => {
        const { context, set } = fakeContext(
            { frameSampler: new ResolverFrameSampler(resolver, beats) },
            ids,
        );
        for (const timeSeconds of [0, 0.7, 1.9, 4.0, 5.55, 9.99, 11.3]) {
            setMarcherPositionsAtTime(context, timeSeconds * 1000);
            const beat = beatAtTime(beats, timeSeconds);
            for (const id of ids) {
                const [x, y] = resolver.positionAt(id, beat);
                expect(set[id]).toHaveBeenLastCalledWith({ x, y });
            }
        }
    });

    it("skips canvas marchers the resolver doesn't know and ignores the page keyframes", () => {
        const stale: Map<number, MarcherTimeline> = new Map([
            [
                ids[0]!,
                {
                    pathMap: new Map([
                        [0, { x: 999, y: 999 }],
                        [1000, { x: 999, y: 999 }],
                    ]),
                    sortedTimestamps: [0, 1000],
                },
            ],
        ]);
        const { context, set } = fakeContext(
            {
                frameSampler: new ResolverFrameSampler(resolver, beats),
                marcherTimelines: stale,
            },
            [...ids, 9999],
        );
        setMarcherPositionsAtTime(context, 500);
        expect(set[9999]).not.toHaveBeenCalled();
        const [x, y] = resolver.positionAt(ids[0]!, beatAtTime(beats, 0.5));
        expect(set[ids[0]!]).toHaveBeenLastCalledWith({ x, y });
    });

    it("keeps working after the marcher count changes (the buffer is resized)", () => {
        const sampler = new ResolverFrameSampler(resolver, beats);
        const { context, set } = fakeContext({ frameSampler: sampler }, ids);
        setMarcherPositionsAtTime(context, 1000);
        const smaller = createResolver({
            ...show,
            marchers: show.marchers.slice(0, 2),
            assignments: show.assignments.filter((r) => r.marcher <= 2),
        });
        const sampler2 = new ResolverFrameSampler(smaller, beats);
        const second = fakeContext({ frameSampler: sampler2 }, ids);
        setMarcherPositionsAtTime(second.context, 1000);
        expect(second.set[ids[3]!]).not.toHaveBeenCalled();
        expect(set[ids[3]!]).toHaveBeenCalledTimes(1);
    });
});

describe("video frames in page mode (no sampler)", () => {
    it("interpolates the page keyframes as before", () => {
        const timeline: MarcherTimeline = {
            pathMap: new Map([
                [0, { x: 0, y: 0 }],
                [1000, { x: 10, y: 20 }],
            ]),
            sortedTimestamps: [0, 1000],
        };
        const { context, set } = fakeContext(
            { marcherTimelines: new Map([[1, timeline]]) },
            [1, 2],
        );
        setMarcherPositionsAtTime(context, 250);
        expect(set[1]).toHaveBeenLastCalledWith({ x: 2.5, y: 5 });
        // A marcher with no timeline stays where it is
        expect(set[2]).not.toHaveBeenCalled();
    });
});
