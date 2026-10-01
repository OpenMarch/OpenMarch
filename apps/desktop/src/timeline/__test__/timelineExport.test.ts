import { afterEach, expect } from "vitest";
import { describeDbTests } from "@/test/base";
import { createBeats } from "@/db-functions/beat";
import { loadTimelineFixture } from "../fixtures/loadTimelineFixture";
import { buildTimelineFixture } from "../fixtures/timelineFixtures";
import {
    acquireExportResolver,
    exportTimelineKeyframesJson,
    readExportBeats,
} from "../timelineExport";
import { beatAtTime, showEndTime } from "../timeMap";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * The export helpers on a real database (P7.8, P7.9): a resolver cold-built for the export when
 * the store has none, the store's own when it is ready, the beats with timestamps, and the
 * keyframe JSON built from them.
 */

afterEach(() => stopTimelineResolver());

describeDbTests("timeline export helpers", (it) => {
    it("always builds a separate resolver, and an edit committed mid-export doesn't change it", async ({
        db,
    }) => {
        const loaded = await loadTimelineFixture(
            db,
            buildTimelineFixture("G8"),
            {
                beatOffset: 1,
            },
        );
        const id = loaded.marchers.get(1)!;

        await startTimelineResolver(db);
        const stored = useTimelineResolverStore.getState().resolver!;
        const exportResolver = await acquireExportResolver(db);
        expect(exportResolver).not.toBe(stored);
        const beatsToSample = [1, 3.5, 6, 9];
        const before = beatsToSample.map((b) =>
            exportResolver.positionAt(id, b),
        );
        for (let i = 0; i < before.length; i++)
            expect(before[i]).toEqual(stored.positionAt(id, beatsToSample[i]!));

        // An edit commits while the export is running; the store follows it in place
        await loadTimelineFixture(db, buildTimelineFixture("G1"), {
            beatOffset: 1,
        });
        await timelineResolverSettled();
        expect(
            useTimelineResolverStore.getState().resolver!.marcherIds(),
        ).toHaveLength(2);

        expect(exportResolver.marcherIds()).toEqual([id]);
        expect(
            beatsToSample.map((b) => exportResolver.positionAt(id, b)),
        ).toEqual(before);
    });

    it("reads the beats with cumulative timestamps and exports keyframes from them", async ({
        db,
    }) => {
        await createBeats({
            db,
            newBeats: Array.from({ length: 12 }, () => ({
                duration: 0.5,
                include_in_measure: true,
            })),
        });
        const loaded = await loadTimelineFixture(
            db,
            buildTimelineFixture("G8"),
            { beatOffset: 1 },
        );
        const beats = await readExportBeats(db);
        expect(beats.length).toBeGreaterThan(8);
        expect(beats[1]!.timestamp).toBe(0);
        expect(beatAtTime(beats, 0)).toBe(1);

        const json = JSON.parse(await exportTimelineKeyframesJson(db)) as {
            tolerance: number;
            marchers: { marcherId: number; keyframes: number[][] }[];
        };
        expect(json.tolerance).toBe(0.01);
        expect(json.marchers.map((m) => m.marcherId)).toEqual([
            loaded.marchers.get(1),
        ]);
        const keyframes = json.marchers[0]!.keyframes;
        expect(keyframes[0]![0]).toBe(0);
        expect(keyframes.at(-1)![0]).toBeCloseTo(showEndTime(beats), 9);
        // An arc needs more than its two ends
        expect(keyframes.length).toBeGreaterThan(4);
    });
});
