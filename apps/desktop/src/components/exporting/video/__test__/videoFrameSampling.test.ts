import { describe, expect, it } from "vitest";
import { createResolver } from "@openmarch/core";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import { beatAtTime, type BeatTiming } from "@/timeline/timeMap";
import { ResolverFrameSampler } from "@/timeline/timelineExport";
import { FieldMarchers } from "@/field/three/fieldMarchers";
import { frameBeat } from "../videoFrameRenderer";

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

/** What the export's off-screen field holds after drawing the frame at `timeSeconds`. */
function drawnAt(
    sampler: ResolverFrameSampler,
    marchers: FieldMarchers,
    timeSeconds: number,
    durationSeconds = 100,
) {
    marchers.fill(frameBeat(sampler, timeSeconds, durationSeconds));
    return new Map(
        marchers.ids.map((id, i) => [
            id,
            [marchers.positions[i * 2], marchers.positions[i * 2 + 1]],
        ]),
    );
}

describe("video frames", () => {
    const resolver = createResolver(show);
    const ids = [...resolver.marcherIds()];

    it("draws each marcher at the resolver's position at the frame's beat", () => {
        const sampler = new ResolverFrameSampler(resolver, beats);
        const marchers = new FieldMarchers(sampler.source);
        for (const timeSeconds of [0, 0.7, 1.9, 4.0, 5.55, 9.99, 11.3]) {
            const drawn = drawnAt(sampler, marchers, timeSeconds);
            const beat = beatAtTime(beats, timeSeconds);
            expect([...drawn.keys()]).toEqual(ids);
            for (const id of ids)
                expect(drawn.get(id)).toEqual(resolver.positionAt(id, beat));
        }
    });

    it("holds the last frame just before the show's end", () => {
        const sampler = new ResolverFrameSampler(resolver, beats);
        const duration = 5;
        expect(frameBeat(sampler, duration, duration)).toBe(
            beatAtTime(beats, duration - 0.001),
        );
        expect(frameBeat(sampler, 2, duration)).toBe(beatAtTime(beats, 2));
    });

    it("draws only the marchers the export's resolver knows", () => {
        const smaller = createResolver({
            ...show,
            marchers: show.marchers.slice(0, 2),
            assignments: show.assignments.filter((r) => r.marcher <= 2),
        });
        const sampler = new ResolverFrameSampler(smaller, beats);
        const drawn = drawnAt(sampler, new FieldMarchers(sampler.source), 1);
        expect([...drawn.keys()]).toEqual([...smaller.marcherIds()]);
        expect(drawn.has(ids[3]!)).toBe(false);
    });
});
