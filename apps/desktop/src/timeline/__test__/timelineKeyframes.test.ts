import { describe, expect, it, vi } from "vitest";
import { createResolver, type Resolver } from "@openmarch/core";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import {
    beatAtTime,
    showEndTime,
    timeAtBeat,
    type BeatTiming,
} from "../timeMap";
import {
    buildKeyframes,
    DEFAULT_KEYFRAME_TOLERANCE,
    interpolateKeyframes,
    keyframesToJson,
    keyframesToMarcherTimelines,
} from "../timelineKeyframes";

/** Beat 0 is the fixed zero-length beat; beats 1..count last `duration(b)` seconds each. */
function makeBeats(
    count: number,
    duration: (beat: number) => number = () => 0.5,
): BeatTiming[] {
    const beats: BeatTiming[] = [{ timestamp: 0, duration: 0 }];
    let t = 0;
    for (let b = 1; b <= count; b++) {
        const d = duration(b);
        beats.push({ timestamp: t, duration: d });
        t += d;
    }
    return beats;
}

const fixture = (name: string) =>
    GOLDEN_FIXTURES.find((g) => g.name === name)!.build().show;

const FIXTURE_NAMES = ["G1", "G8", "G8b", "G6", "G12"] as const;
/** The Float32 rounding the default export adds, for coordinates in these shows (< 100) */
const FLOAT32_SLACK = 1e-5;

function maxError(
    resolver: Resolver,
    beats: BeatTiming[],
    marcherId: number,
    keyframes: ReturnType<typeof buildKeyframes>[number]["keyframes"],
    samples = 1500,
): number {
    const end = showEndTime(beats);
    let worst = 0;
    for (let i = 0; i <= samples; i++) {
        const t = (end * i) / samples;
        const want = resolver.positionAt(marcherId, beatAtTime(beats, t));
        const got = interpolateKeyframes(keyframes, t)!;
        worst = Math.max(worst, Math.hypot(want[0] - got.x, want[1] - got.y));
    }
    return worst;
}

describe.each(FIXTURE_NAMES)("keyframe export of %s", (name) => {
    const show = fixture(name);
    const resolver = createResolver(show);
    const beats = makeBeats(30);

    it("has a keyframe at every span boundary and at the show's start and end", () => {
        const exported = buildKeyframes(resolver, beats);
        expect(exported.map((m) => m.marcherId)).toEqual([
            ...resolver.marcherIds(),
        ]);
        for (const { marcherId, keyframes } of exported) {
            const times = new Set(keyframes.map((k) => k.time));
            expect(keyframes[0]!.time).toBe(timeAtBeat(beats, 1));
            expect(keyframes.at(-1)!.time).toBe(showEndTime(beats));
            for (const span of resolver.spanInfos(marcherId))
                for (const edge of [span.start, span.end]) {
                    if (!Number.isFinite(edge)) continue;
                    if (edge <= 1 || edge >= beats.length) continue;
                    expect(times.has(timeAtBeat(beats, edge))).toBe(true);
                }
        }
    });

    it("keeps linear interpolation within the tolerance of the resolver", () => {
        const tolerance = DEFAULT_KEYFRAME_TOLERANCE;
        for (const { marcherId, keyframes } of buildKeyframes(resolver, beats, {
            float32: false,
        }))
            expect(
                maxError(resolver, beats, marcherId, keyframes),
            ).toBeLessThanOrEqual(tolerance);
        // Float32 coordinates add only rounding
        for (const { marcherId, keyframes } of buildKeyframes(resolver, beats))
            expect(
                maxError(resolver, beats, marcherId, keyframes),
            ).toBeLessThanOrEqual(tolerance + FLOAT32_SLACK);
    });

    it("honours a tighter tolerance, with more keyframes only where the path bends", () => {
        const loose = buildKeyframes(resolver, beats, { float32: false });
        const tight = buildKeyframes(resolver, beats, {
            tolerance: 1e-4,
            float32: false,
        });
        for (let i = 0; i < loose.length; i++) {
            expect(tight[i]!.keyframes.length).toBeGreaterThanOrEqual(
                loose[i]!.keyframes.length,
            );
            expect(
                maxError(
                    resolver,
                    beats,
                    tight[i]!.marcherId,
                    tight[i]!.keyframes,
                ),
            ).toBeLessThanOrEqual(1e-4);
        }
    });

    it("is deterministic", () => {
        expect(buildKeyframes(resolver, beats)).toEqual(
            buildKeyframes(createResolver(fixture(name)), beats),
        );
    });
});

describe("keyframe export details", () => {
    it("emits two keyframes for a direct move at a steady tempo, and many for an arc", () => {
        const beats = makeBeats(30);
        const direct = buildKeyframes(createResolver(fixture("G1")), beats, {
            float32: false,
        })[0]!.keyframes;
        // Start of the show, the move's end, the end of the show (the move starts with the show)
        expect(direct.length).toBeLessThanOrEqual(3);

        const arc = buildKeyframes(createResolver(fixture("G8")), beats, {
            float32: false,
        })[0]!.keyframes;
        expect(arc.length).toBeGreaterThan(8);
    });

    it("subdivides a direct move across a tempo change (the player interpolates in time)", () => {
        // 8 beats at 0.25 s, then 8 beats at 1 s: a straight move at two speeds
        const beats = makeBeats(30, (b) => (b <= 8 ? 0.25 : 1));
        const resolver = createResolver(fixture("G1"));
        const [m] = buildKeyframes(resolver, beats, { float32: false });
        expect(m!.keyframes.length).toBeGreaterThan(3);
        expect(
            maxError(resolver, beats, m!.marcherId, m!.keyframes),
        ).toBeLessThanOrEqual(DEFAULT_KEYFRAME_TOLERANCE);
    });

    it("rounds coordinates to Float32 by default and not when asked", () => {
        const beats = makeBeats(30);
        const resolver = createResolver(fixture("G8"));
        for (const k of buildKeyframes(resolver, beats)[0]!.keyframes) {
            expect(k.x).toBe(Math.fround(k.x));
            expect(k.y).toBe(Math.fround(k.y));
        }
        const exact = buildKeyframes(resolver, beats, { float32: false })[0]!
            .keyframes;
        expect(exact.some((k) => k.x !== Math.fround(k.x))).toBe(true);
    });

    it("returns nothing without beats and rejects a non-positive tolerance", () => {
        const resolver = createResolver(fixture("G1"));
        expect(buildKeyframes(resolver, [])).toEqual([]);
        expect(() =>
            buildKeyframes(resolver, makeBeats(4), { tolerance: 0 }),
        ).toThrow(RangeError);
    });

    it("converts to the page-mode timeline shape and to JSON", () => {
        const beats = makeBeats(30);
        const exported = buildKeyframes(createResolver(fixture("G8")), beats);
        const timelines = keyframesToMarcherTimelines(exported);
        const t = timelines.get(exported[0]!.marcherId)!;
        expect(t.sortedTimestamps).toEqual(
            exported[0]!.keyframes.map((k) => Math.round(k.time * 1000)),
        );
        expect(t.pathMap.get(t.sortedTimestamps[0]!)).toEqual({
            x: exported[0]!.keyframes[0]!.x,
            y: exported[0]!.keyframes[0]!.y,
        });
        const json = JSON.parse(keyframesToJson(exported)) as {
            marchers: { marcherId: number; keyframes: number[][] }[];
        };
        expect(json.marchers[0]!.keyframes.length).toBe(
            exported[0]!.keyframes.length,
        );
    });

    it("reports error above the tolerance when the depth cap is hit, and warns", () => {
        const beats = makeBeats(30);
        const resolver = createResolver(fixture("G8"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const capped = buildKeyframes(resolver, beats, {
            tolerance: 1e-9,
            maxDepth: 2,
            float32: false,
        });
        expect(capped[0]!.maxErrorAboveTolerance).toBeGreaterThan(0);
        expect(warn).toHaveBeenCalled();
        expect(JSON.parse(keyframesToJson(capped)).maxErrorAboveTolerance).toBe(
            capped[0]!.maxErrorAboveTolerance,
        );

        warn.mockClear();
        const fine = buildKeyframes(resolver, beats);
        expect(fine[0]!.maxErrorAboveTolerance).toBe(0);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
