import { afterEach, expect, vi } from "vitest";
import { asc } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { convertPagesToTimeline } from "@/test/convertPages";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readShowTiming } from "@/timeline/showTiming";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { readStoredTimelineMemberships } from "@/timeline/useTimelineSelectionHost";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    createSplitMergeCommands,
    type SplitMergeContext,
} from "../splitMergeMoves";

// The test converts the show itself, so each page box holds a stored timeline
keepFixturesInPageMode("its test converts the show itself");

afterEach(() => {
    stopTimelineResolver();
    useTimelineSelectionStore.getState().reset();
});

/** The split and merge commands' guard (docs/timeline/ui.md UI-25), on a real show. */

const context = (): SplitMergeContext => ({
    storedTimelines: [],
    pageBoxes: [],
    selectedMarcherIds: new Set(),
    isPlaying: false,
});

const commands = (db: DbConnection) =>
    createSplitMergeCommands({ database: db, context });

const timelines = async (db: DbConnection) =>
    await db
        .select()
        .from(schema.timelines)
        .orderBy(asc(schema.timelines.id))
        .all();

/** What the app's selection host does after an edit: the store reads the stored timelines */
const feedStore = async (db: DbConnection) =>
    useTimelineSelectionStore
        .getState()
        .setStoredTimelines(await readStoredTimelineMemberships(db));

describeDbTests("split and merge commands", (it) => {
    it("run one edit at a time across every caller (the panel, the Move card, the palette)", async ({
        db,
        marchersAndPages,
    }) => {
        await convertPagesToTimeline(db);
        const pages = [...(await readShowTiming(db)).pages].sort(
            (x, y) => x.order - y.order,
        );
        const box = {
            start: pageEndBeat(pages[1]!),
            end: pageEndBeat(pages[2]!),
        };
        const page = (await timelines(db)).find(
            (t) => t.start_beat === box.start && t.end_beat === box.end,
        )!;
        const [a, b] = marchersAndPages.expectedMarchers.map((m) => m.id);
        const before = (await timelines(db)).length;
        await feedStore(db);

        const panel = commands(db);
        const card = commands(db);
        panel.split(page.id, [a!]);
        // While the panel's split is writing, the Move card's split and merge do nothing
        card.split(page.id, [b!]);
        card.merge(page.id, page.id);
        await vi.waitFor(async () =>
            expect(await timelines(db)).toHaveLength(before + 1),
        );
        const split = (await timelines(db)).at(-1)!;
        // Only the panel's split ran: a is in the new move, b still in the page's
        const memberships = async () =>
            new Map(
                (await readStoredTimelineMemberships(db)).map((t) => [
                    t.id,
                    [...t.marcherIds],
                ]),
            );
        expect((await memberships()).get(split.id)).toEqual([a]);
        expect((await memberships()).get(page.id)).toContain(b);
        // The store sees the new move, so the split finishes and frees the guard
        await feedStore(db);

        // Once the first edit settles, the next one runs: the split move merges back
        await vi.waitFor(async () => {
            card.merge(split.id, page.id);
            expect(await timelines(db)).toHaveLength(before);
        });
        await feedStore(db);
    });
});
