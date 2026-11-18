import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    findGroupTarget,
    findPathTarget,
    findTrailTarget,
    groupMoveAt,
} from "@/pathways/pathTarget";
import { followKeepAt, isTrailLineAt } from "@/pathways/followTool";
import { removeMarchersFromTimeline } from "../timelineMembership";
import { drawRoute } from "../timelineRoutes";
import { drawGroupRoute } from "../timelineGroupRoutes";
import { followOrder, followTrail } from "../timelineTrails";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * A path shows only in its own move (owner, 2026-11-18): with the page before it selected (the
 * playhead on its start flag) it doesn't, even when its marchers have no move arriving on that
 * flag. On the converted `marchersAndPages` show, page 2's move is `[9, 17)` and page 3's
 * `[17, 25)`; the line holds through page 2 (taken out of its move) and follows a trail on page 3,
 * as a block standing still on page 10A and following the leader from 10A to 11.
 */

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);
const moveAt = async (db: DbConnection, start: number) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, start))
        .get())!;
const drills = new Map<number, string>();

/** The first four marchers out of page 2's move, holding through it */
async function holdThroughPage2(db: DbConnection) {
    await convertPagesToTimeline(db);
    const ids = (await resolverOf(db)).marcherIds().slice(0, 4);
    await removeMarchersFromTimeline({
        db,
        timelineId: (await moveAt(db, 9)).id,
        marcherIds: ids,
    });
    return ids;
}

describeDbTests("A path shows only in its own move", (it) => {
    it("a trail on page 3 isn't shown, drawn again or kept with page 2 selected; it is inside its move and on its end flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await holdThroughPage2(db);
        const before = await resolverOf(db);
        const starts = ids.map((m) => before.positionAt(m, 17) as XY);
        const ends = ids.map((m) => before.positionAt(m, 25) as XY);
        const leader = starts[followOrder(starts, ends).at(-1)!]!;
        await followTrail({
            db,
            timelineId: (await moveAt(db, 17)).id,
            marcherIds: ids,
            points: [{ at: [leader[0] + 40, leader[1] - 60] }],
        });
        const r = await resolverOf(db);
        // Page 2 selected: the playhead on its end flag, where the trail's move starts
        for (const beat of [12, 17]) {
            expect(await findTrailTarget(db, r, ids, drills, beat)).toBeNull();
            expect(await groupMoveAt(db, ids, beat)).toMatchObject({
                kind: "noMove",
            });
            expect(await isTrailLineAt(db, ids, beat)).toBe(false);
            expect(await followKeepAt(db, r, ids, beat)).toBeNull();
        }
        // Inside the trail's move, and on its end flag (page 3 selected)
        for (const beat of [17.5, 25]) {
            const trail = await findTrailTarget(db, r, ids, drills, beat);
            expect(trail).toMatchObject({ start: 17, end: 25 });
            expect(await isTrailLineAt(db, ids, beat)).toBe(true);
        }
    });

    it("an own path and a group path on page 3 aren't shown with page 2 selected either", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ids = await holdThroughPage2(db);
        const page3 = (await moveAt(db, 17)).id;
        const before = await resolverOf(db);
        const [own, ...group] = ids;
        const at = before.positionAt(own!, 17);
        await drawRoute({
            db,
            timelineId: page3,
            marcherId: own!,
            points: [{ at: [at[0] + 20, at[1] - 30] }],
        });
        const g = before.positionAt(group[0]!, 17);
        await drawGroupRoute({
            db,
            timelineId: page3,
            marcherIds: group,
            points: [{ at: [g[0] + 20, g[1] - 30] }],
        });
        const r = await resolverOf(db);
        expect(await findPathTarget(db, r, own!, 17)).toBeNull();
        expect(await findGroupTarget(db, r, group, drills, 17)).toBeNull();
        expect(await findPathTarget(db, r, own!, 18)).toMatchObject({
            start: 17,
            end: 25,
        });
        expect(await findGroupTarget(db, r, group, drills, 18)).toMatchObject({
            start: 17,
            end: 25,
        });
    });
});
