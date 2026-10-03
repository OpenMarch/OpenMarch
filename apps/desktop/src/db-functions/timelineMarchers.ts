import { asc, desc, inArray, notInArray } from "drizzle-orm";
import {
    FieldProperties,
    validateDestination,
    validateHome,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { DbTransaction } from "./types";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { assertValid } from "./timelineErrors";
import { stealLayer } from "./timelineCommands";
import {
    createOwnTransitionsInTransaction,
    partlyOverlaps,
    removeAssignmentRowsInTransaction,
    type BeatRange,
    type OwnTransition,
    type RemoveAssignmentsResult,
} from "./timelineMembership";

/**
 * Marcher add and delete in timeline mode (P7.3, reworked for UI-9 by P8.14 in
 * docs/timeline/phases/08-authoring-ui.md). Both run inside the same `transactionWithHistory` edit
 * as the page-era create or delete (`createMarchers`, `deleteMarchers`, when the file's flag is
 * on), so each is one undo step.
 *
 * **Add** (UI-9 New marchers). A new marcher gets a home (C-5) and joins every stored timeline,
 * so it stands at home through the show and nothing else moves:
 *
 * - The home is a free spot found the way page mode finds one for page 0 (a column four steps in
 *   from the top left of the field, moved down two steps at a time until no marcher's home is
 *   there), with new marchers side by side two steps apart. Page mode checks page rows; this
 *   checks homes, because page rows are frozen in timeline mode.
 * - **Joining:** in each stored timeline the marcher gets its own one-slot shapeless `direct`
 *   transition spanning it (C-11), whose destination is its home, with an assignment over the
 *   whole timeline one layer above its highest layer there (UI-9 Layers), as **Add selected
 *   marchers** does. Timelines are taken in start order (a longer one first when two start
 *   together, so containers come before what they contain), and one that only partly overlaps a
 *   timeline already joined, or has the same range as one, is skipped (_lead default_, UI-9 New
 *   marchers and overlaps).
 *
 * **Delete.** The marcher's assignments are deleted explicitly before the marcher, children
 * first (C-1). Its own one-slot transitions are deleted with them and their timelines stay (UI-9
 * Removing marchers). A shared shapeless transition that lost a slot (a converted show's page
 * move) is compacted when that keeps every other marcher's resolved position, as P7.3 did
 * (`removeAssignmentRowsInTransaction`).
 */

const DEFAULT_START = { x: 100, y: 100, spacing: 25 };

/** The first free starting point for new marchers, as page mode picks one for page 0. */
const findStartingPoint = async (
    tx: DbTransaction,
    excludeMarcherIds: readonly number[],
): Promise<{ x: number; y: number; spacing: number }> => {
    const fieldPropertiesRow = await tx.query.field_properties.findFirst();
    let start = { ...DEFAULT_START };
    let stepY = DEFAULT_START.spacing;
    if (fieldPropertiesRow) {
        const pixelsPerStep = new FieldProperties(
            JSON.parse(fieldPropertiesRow.json_data),
        ).pixelsPerStep;
        start = {
            x: 8 * pixelsPerStep,
            y: 8 * pixelsPerStep,
            spacing: 2 * pixelsPerStep,
        };
        stepY = 2 * pixelsPerStep;
    } else {
        console.warn(
            "Field properties not found, using default starting point",
        );
    }
    const m = schema.marchers;
    const homes = await tx
        .select({ x: m.home_x, y: m.home_y })
        .from(m)
        .where(notInArray(m.id, [...excludeMarcherIds]))
        .all();
    const taken = new Set(homes.map((h) => `${h.x},${h.y}`));
    // A zero step size would never find a free row; stop at the first spot then
    while (stepY > 0 && taken.has(`${start.x},${start.y}`)) start.y += stepY;
    return start;
};

/** Where `joinNewMarchersToTimelinesInTransaction` put each new marcher. */
export interface TimelineMarcherAddResult {
    homes: { marcherId: number; home: XY }[];
    /** Each new marcher's own transition in each timeline it joined, in join order */
    joined: OwnTransition[];
    /** Stored timelines the new marchers didn't join, because of a partial overlap */
    skippedTimelineIds: number[];
}

/**
 * Gives newly created marchers a home and their own transition in every stored timeline (see the
 * module comment). Call it in the same edit as `createMarchersInTransaction`, after it.
 */
export const joinNewMarchersToTimelinesInTransaction = async ({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
}): Promise<TimelineMarcherAddResult> => {
    const result: TimelineMarcherAddResult = {
        homes: [],
        joined: [],
        skippedTimelineIds: [],
    };
    if (marcherIds.length === 0) return result;

    // Homes, side by side from the first free starting spot
    const start = await findStartingPoint(tx, marcherIds);
    marcherIds.forEach((marcherId, i) => {
        const home: XY = [start.x + i * start.spacing, start.y];
        assertValid(validateHome(home), "marcher home");
        assertValid(validateDestination(home), "destination");
        result.homes.push({ marcherId, home });
    });
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: result.homes.map(({ marcherId, home }) => ({
            marcherId,
            home,
        })),
    });

    const l = schema.timelines;
    const timelines = await tx
        .select()
        .from(l)
        .orderBy(asc(l.start_beat), desc(l.end_beat), asc(l.id))
        .all();
    const joined: BeatRange[] = [];
    for (const timeline of timelines) {
        const range = { start: timeline.start_beat, end: timeline.end_beat };
        if (
            joined.some(
                (j) =>
                    partlyOverlaps(j, range) ||
                    (j.start === range.start && j.end === range.end),
            )
        ) {
            result.skippedTimelineIds.push(timeline.id);
            continue;
        }
        joined.push(range);
        const members = [];
        for (const { marcherId, home } of result.homes)
            members.push({
                marcherId,
                point: home,
                layer: await stealLayer(
                    tx,
                    [marcherId],
                    range.start,
                    range.end,
                    "so the new marcher can't join this timeline",
                ),
            });
        result.joined.push(
            ...(await createOwnTransitionsInTransaction(tx, timeline, members)),
        );
    }
    return result;
};

/**
 * Deletes the marchers' assignments, their own one-slot transitions, and compacts the shared
 * shapeless transitions they leave; timelines stay (see the module comment). Call it in the same
 * edit as the marcher delete, before it.
 */
export const removeDeletedMarchersFromTimelinesInTransaction = async ({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
}): Promise<RemoveAssignmentsResult> => {
    const a = schema.timeline_assignments;
    const removed =
        marcherIds.length === 0
            ? []
            : await tx
                  .select()
                  .from(a)
                  .where(inArray(a.marcher_id, [...marcherIds]))
                  .orderBy(asc(a.id))
                  .all();
    return await removeAssignmentRowsInTransaction({
        tx,
        removed,
        compact: true,
    });
};
