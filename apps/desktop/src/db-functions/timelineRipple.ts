import { and, asc, eq, gt, lt } from "drizzle-orm";
import { createResolver, validateDestination, type XY } from "@openmarch/core";
import * as schema from "@om-electron/database/migrations/schema";
import { isTimelineModeEnabled } from "@/settings/workspaceSettings";
import { readTimelineTables } from "@/timeline/timelineRows";
import { DbTransaction } from "./types";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import {
    createTimelineTransitionsInTransaction,
    deleteTimelineTransitionsInTransaction,
} from "./timelineTransitions";
import { findTimelineByRange } from "./timelines";
import { createRangeTimelineInTransaction } from "./timelineMoveNames";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";

/**
 * Page and beat ripple (docs/timeline/phases/07-page-parity.md P7.4, P7.5).
 *
 * Timeline rows hold beat ordinals: beat `n` is the `n`th row of `beats` ordered by position,
 * counting from 0 (ADR 0001). Pages are time labels over those beats. So any edit that inserts,
 * deletes or reorders beats, or moves, adds or removes a page, has to rewrite timeline rows in the
 * same edit, or the rows end up over the wrong music. `withTimelinePageRipple` does that: in
 * timeline mode it reads the page grid (beat ids in order, and each page's beat range) before the
 * page-mode edit runs, reads it again afterwards, and rewrites every timeline, transition and
 * assignment to match, inside the same transaction, so one undo restores everything.
 *
 * **How a row's beats move.** Every row edge is mapped from the old grid to the new one:
 *
 * - Any row's edge on a page boundary follows that page, whether or not the row is a page move:
 *   a row ending where page N ends ends where page N ends now; a row starting where page N
 *   starts starts where page N starts now. So a track ending on a page boundary grows with that
 *   page when beats are inserted at the boundary, as the page's own move does. That is what
 *   makes the converted show (one transition per page) behave as page mode does: inserting beats
 *   inside a page, or right after it, lengthens its move; resizing a page moves the boundary it
 *   shares with the next page, so the move ending there and the move starting there both change
 *   (an R-E1 edit of each; their anchored assignments follow). The edge falls back to the beat
 *   rule below when following the page would leave the row with no beats (a short row inside a
 *   page that ends at the page end, when the page is split before it).
 * - Any other edge follows its beat. A start stays at the start of its beat; an end stays at the
 *   end of the beat before it. So inserting k beats at ordinal p shifts every row starting at or
 *   after p by k, grows every row that strictly contains p, and leaves rows ending at p alone
 *   (unless p is a page boundary, above);
 *   deleting beats shrinks the rows that held them and shifts the rows after them. An edge whose
 *   beat was deleted moves to the next surviving beat (a start) or the previous one (an end).
 *
 * **When a page goes away** (deleted, or its start beat is deleted), its page moves go with it:
 * each shapeless transition over exactly the page's beats whose assignments are all layer 0 and
 * cover it (what the converter writes, `isPageMove`) is deleted with its assignments and
 * destinations. Any other transition is never deleted here; one that would lose all its beats
 * refuses the edit instead (`E-ARGS`, naming it and its timeline). The page before then ends where
 * the deleted page ended, so its move stretches over the deleted page's beats, as in page mode
 * (where those coordinates are lost and the earlier page's move runs until the next page starts).
 * A timeline left with no transition goes too (C-11: a timeline is the container for its moves).
 *
 * **When a page is added** (inserted, split off, or added at the end), page mode copies the
 * previous page's coordinates onto it, so marchers hold through it. Here every transition that
 * ends where the new page starts gets a holding transition over the new page, with one slot per
 * assignment that ends there, at that assignment's layer, whose destination is the marcher's
 * position at the page start. If no transition ends there but a timeline contains the page start
 * (or ends there), one holding transition holds every marcher at layer 0. A transition spans its
 * whole timeline (C-11), so the holding transitions of a page share one new timeline over the
 * page. A marcher that already has a row at that layer over the new page is left out (it moves
 * there anyway). The holding transition is what "move the marchers on the new page" edits (D-16,
 * P7.2).
 *
 * **Refusals.** The ripple of existing rows is planned before its first timeline write, and the
 * edit is refused when a row would end up with no beats (`E-ARGS`), an assignment would leave its
 * transition (`E-A1`), a transition would leave its timeline (`E-T1`), or two of a marcher's rows
 * at one layer would overlap or swap order (`E-A3`). The holding moves are planned after the
 * ripple has been written, so their one refusal (a marcher outside the field's bounds at the new
 * page's start, `E-ARGS`) comes after earlier writes. Either way the whole edit rolls back,
 * page-mode statements included, so nothing is written.
 *
 * **Statement order** (U-3: every intermediate state passes the row triggers, so undo can replay
 * the edit backwards):
 *
 * 1. delete the removed pages' transitions, children first (C-1), then the timelines they emptied;
 * 2. every changed timeline grows to the union of its old and new range;
 * 3. every changed transition grows to the union of its old and new range;
 * 4. each changed assignment moves to its new range in one statement. Within one marcher and
 *    layer, a row moves only after the rows its new range would overlap have moved out of the way
 *    (that order always exists when the rows keep their order);
 * 5. every changed transition shrinks to its new range;
 * 6. every changed timeline shrinks to its new range;
 * 7. holding transitions for added pages.
 */

/** The largest beat a row may hold (spec I-N2). */
const MAX_BEAT = 2147483647;

/** `utility.last_page_counts` when the file has no utility row (the column's default). */
const DEFAULT_LAST_PAGE_COUNTS = 8;

/** A page's beats as ordinals: `[start, end)`, the same range `pageEndBeat` gives. */
export interface GridPage {
    id: number;
    start: number;
    end: number;
}

/** Where every beat and page sits, by ordinal. */
export interface PageGrid {
    /** Beat ids in position order: the ordinal of a beat is its index here */
    beatIds: number[];
    /** Pages in show order */
    pages: GridPage[];
}

/**
 * Reads the page grid. It mirrors `fromDatabasePages` (`src/global/classes/Page.ts`): pages in
 * start-beat order; page 0 is its one beat; a page runs to the next page's start, and the last
 * page runs `last_page_counts` beats (fewer if the show ends first); a page with no room keeps its
 * start beat.
 */
export async function readPageGrid(tx: DbTransaction): Promise<PageGrid> {
    const beats = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position), asc(schema.beats.id))
        .all();
    const beatIds = beats.map((b) => b.id);
    const ordinal = new Map(beatIds.map((id, i) => [id, i]));
    const pageRows = await tx
        .select({ id: schema.pages.id, start_beat: schema.pages.start_beat })
        .from(schema.pages)
        .all();
    const utility = await tx
        .select({ lastPageCounts: schema.utility.last_page_counts })
        .from(schema.utility)
        .get();
    const lastPageCounts = utility?.lastPageCounts ?? DEFAULT_LAST_PAGE_COUNTS;
    const placed = pageRows
        .filter((p) => ordinal.has(p.start_beat))
        .map((p) => ({ id: p.id, start: ordinal.get(p.start_beat)! }))
        .sort((a, b) => a.start - b.start);
    const n = beatIds.length;
    const pages = placed.map((p, i): GridPage => {
        const next = placed[i + 1];
        if (p.id === 0) return { id: p.id, start: p.start, end: p.start + 1 };
        const last = next ? next.start : Math.min(p.start + lastPageCounts, n);
        return {
            id: p.id,
            start: p.start,
            end: last > p.start ? last : p.start + 1,
        };
    });
    return { beatIds, pages };
}

const sameGrid = (a: PageGrid, b: PageGrid) =>
    a.beatIds.length === b.beatIds.length &&
    a.beatIds.every((id, i) => b.beatIds[i] === id) &&
    a.pages.length === b.pages.length &&
    a.pages.every((p, i) => {
        const q = b.pages[i]!;
        return p.id === q.id && p.start === q.start && p.end === q.end;
    });

/** Whether the file's timeline flag is on, read inside `tx` from `workspace_settings`. */
export async function timelineModeInTransaction(
    tx: DbTransaction,
): Promise<boolean> {
    const row = await tx
        .select({ json: schema.workspace_settings.json_data })
        .from(schema.workspace_settings)
        .get();
    if (!row) return false;
    try {
        return isTimelineModeEnabled(JSON.parse(row.json) as never);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// The edge maps
// ---------------------------------------------------------------------------

/**
 * Maps row edges from the `before` grid to the `after` grid (see the module comment).
 */
export class GridEdgeMap {
    private readonly startByBeat: number[];
    private readonly endByBeat: number[];
    private readonly oldBeats: number;
    private readonly tail: number;
    private readonly pageStart = new Map<number, number>();
    private readonly pageEnd = new Map<number, number>();

    constructor(before: PageGrid, after: PageGrid) {
        const newOrdinal = new Map(after.beatIds.map((id, i) => [id, i]));
        const n = before.beatIds.length;
        this.oldBeats = n;
        // The end of the last surviving old beat; edges at or past the old end hang off it
        let tail = 0;
        for (let j = n - 1; j >= 0; j--) {
            const o = newOrdinal.get(before.beatIds[j]!);
            if (o !== undefined) {
                tail = o + 1;
                break;
            }
        }
        this.tail = tail;
        // A start at old beat b: the start of the first surviving beat at or after b
        this.startByBeat = new Array<number>(n);
        let next = tail;
        for (let b = n - 1; b >= 0; b--) {
            const o = newOrdinal.get(before.beatIds[b]!);
            if (o !== undefined) next = o;
            this.startByBeat[b] = next;
        }
        // An end at old boundary b (after beat b - 1): the end of the last surviving beat before b
        this.endByBeat = new Array<number>(n + 1);
        let prev = 0;
        this.endByBeat[0] = 0;
        for (let b = 1; b <= n; b++) {
            const o = newOrdinal.get(before.beatIds[b - 1]!);
            if (o !== undefined) prev = o + 1;
            this.endByBeat[b] = prev;
        }
        // Page edges, for pages that are in both grids (the first page listed wins a shared edge)
        const afterById = new Map(after.pages.map((p) => [p.id, p]));
        for (const p of before.pages) {
            const q = afterById.get(p.id);
            if (!q) continue;
            if (!this.pageStart.has(p.start))
                this.pageStart.set(p.start, q.start);
            if (!this.pageEnd.has(p.end)) this.pageEnd.set(p.end, q.end);
        }
    }

    /** A start edge by its beat. */
    beatStart(b: number): number {
        if (b >= this.oldBeats) return this.tail + (b - this.oldBeats);
        return this.startByBeat[b]!;
    }

    /** An end edge by its beat. */
    beatEnd(b: number): number {
        if (b > this.oldBeats) return this.tail + (b - this.oldBeats);
        return this.endByBeat[b]!;
    }

    /** A row's new range: page edges follow their page unless that leaves the row empty. */
    range(start: number, end: number): [number, number] {
        const s = this.beatStart(start);
        const e = this.beatEnd(end);
        const ps = this.pageStart.get(start);
        const pe = this.pageEnd.get(end);
        const s1 = ps ?? s;
        const e1 = pe ?? e;
        if (s1 < e1) return [s1, e1];
        // Following a page edge emptied the row: keep the other edge on its beat
        if (ps !== undefined && s < e1) return [s, e1];
        if (pe !== undefined && s1 < e) return [s1, e];
        return [s, e];
    }
}

// ---------------------------------------------------------------------------
// The ripple
// ---------------------------------------------------------------------------

type Range = [number, number];

const describe = (r: { start_beat: number; end_beat: number }) =>
    `[${r.start_beat}, ${r.end_beat})`;

const union = (a: Range, b: Range): Range => [
    Math.min(a[0], b[0]),
    Math.max(a[1], b[1]),
];

const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];

const checkBeats = (r: Range, what: string) => {
    if (r[0] >= r[1])
        refuse(
            `this change would leave ${what} with no beats; delete or shorten it first`,
        );
    if (r[0] < 0 || r[1] > MAX_BEAT)
        refuse(`this change would move ${what} outside beats 0 to ${MAX_BEAT}`);
};

/**
 * A page move of `page`: what the converter writes for a page, and what a holding move for an
 * added page looks like. A shapeless transition over exactly the page's beats whose assignments
 * are all at layer 0 and cover the whole transition. Only these go when their page goes; any other
 * transition (a track the user made) stays, and the edit is refused if it would lose its beats.
 */
const isPageMove = (
    t: { start_beat: number; end_beat: number; dest_shape_id: number | null },
    rows: readonly { start_beat: number; end_beat: number; layer: number }[],
    page: GridPage,
) =>
    t.start_beat === page.start &&
    t.end_beat === page.end &&
    t.dest_shape_id === null &&
    rows.every(
        (a) =>
            a.layer === 0 &&
            a.start_beat === t.start_beat &&
            a.end_beat === t.end_beat,
    );

/** The timeline rows the ripple rewrites, as read from the database. */
export interface RippleRows {
    timelines: (typeof schema.timelines.$inferSelect)[];
    transitions: (typeof schema.timeline_transitions.$inferSelect)[];
    assignments: (typeof schema.timeline_assignments.$inferSelect)[];
}

/** Reads every timeline, transition and assignment row (`RippleRows`). */
export async function readRippleRows(tx: DbTransaction): Promise<RippleRows> {
    const timelines = await tx.select().from(schema.timelines).all();
    const transitions = await tx
        .select()
        .from(schema.timeline_transitions)
        .all();
    const assignments = await tx
        .select()
        .from(schema.timeline_assignments)
        .all();
    return { timelines, transitions, assignments };
}

/**
 * Plans the ripple from the `before` grid to the `after` grid without writing anything: which
 * page moves go with removed pages, and every remaining row's new range. Throws the ripple's
 * refusals (`E-ARGS`, `E-T1`, `E-A1`, `E-A3`; see the module comment). Pure, so a gesture can ask
 * whether a grid is reachable before it commits (`pageFlagMoveLimits`).
 */
// eslint-disable-next-line max-lines-per-function
export function planTimelineRipple(
    before: PageGrid,
    after: PageGrid,
    { timelines, transitions, assignments }: RippleRows,
) {
    const map = new GridEdgeMap(before, after);

    // Removed pages take their page moves with them, and nothing else (see `isPageMove`)
    const afterIds = new Set(after.pages.map((p) => p.id));
    const removedPages = before.pages.filter(
        (p) => p.id !== 0 && !afterIds.has(p.id),
    );
    const rowsOf = new Map<number, typeof assignments>();
    for (const a of assignments) {
        const rows = rowsOf.get(a.transition_id);
        if (rows) rows.push(a);
        else rowsOf.set(a.transition_id, [a]);
    }
    const removed = new Set(
        transitions
            .filter((t) =>
                removedPages.some((p) =>
                    isPageMove(t, rowsOf.get(t.id) ?? [], p),
                ),
            )
            .map((t) => t.id),
    );
    const timelineName = new Map(
        timelines.map((l) => [
            l.id,
            l.name ? `timeline "${l.name}"` : `timeline ${l.id}`,
        ]),
    );
    const moveName = (t: (typeof transitions)[number]) =>
        `the move over beats ${describe(t)} in ${timelineName.get(t.timeline_id)}`;

    // A timeline whose transitions all go is deleted with them (C-11), so it isn't rippled
    const emptied = new Set(
        timelines
            .filter((l) => {
                const owned = transitions.filter((t) => t.timeline_id === l.id);
                return (
                    owned.length > 0 && owned.every((t) => removed.has(t.id))
                );
            })
            .map((l) => l.id),
    );
    const rippled = timelines.filter((l) => !emptied.has(l.id));

    // Plan every new range
    const newTimeline = new Map<number, Range>();
    for (const l of rippled)
        newTimeline.set(l.id, map.range(l.start_beat, l.end_beat));
    const newTransition = new Map<number, Range>();
    for (const t of transitions) {
        if (removed.has(t.id)) continue;
        const r = map.range(t.start_beat, t.end_beat);
        checkBeats(r, moveName(t));
        const l = newTimeline.get(t.timeline_id)!;
        if (r[0] < l[0] || r[1] > l[1])
            throw new TimelineWriteError(
                "E-T1",
                `this change would put ${moveName(t)} outside its timeline`,
            );
        newTransition.set(t.id, r);
    }
    // Checked after the transitions, so a refusal names the move rather than its timeline
    for (const l of rippled)
        checkBeats(
            newTimeline.get(l.id)!,
            `${timelineName.get(l.id)} (beats ${describe(l)})`,
        );
    const kept = assignments.filter((a) => !removed.has(a.transition_id));
    const newAssignment = new Map<number, Range>();
    for (const a of kept) {
        const r = map.range(a.start_beat, a.end_beat);
        checkBeats(
            r,
            `marcher ${a.marcher_id}'s part over beats ${describe(a)}`,
        );
        const t = newTransition.get(a.transition_id)!;
        if (r[0] < t[0] || r[1] > t[1])
            throw new TimelineWriteError(
                "E-A1",
                `this change would move marcher ${a.marcher_id}'s part over beats ${describe(a)} outside its move`,
            );
        newAssignment.set(a.id, r);
    }

    // I-A3: each marcher's rows at one layer stay apart and in order
    const chains = new Map<string, typeof kept>();
    for (const a of kept) {
        const key = `${a.marcher_id}:${a.layer}`;
        const chain = chains.get(key);
        if (chain) chain.push(a);
        else chains.set(key, [a]);
    }
    for (const chain of chains.values()) {
        chain.sort((a, b) => a.start_beat - b.start_beat);
        for (let i = 1; i < chain.length; i++) {
            const prev = newAssignment.get(chain[i - 1]!.id)!;
            const cur = newAssignment.get(chain[i]!.id)!;
            if (prev[1] > cur[0])
                throw new TimelineWriteError(
                    "E-A3",
                    `this change would overlap marcher ${chain[i]!.marcher_id}'s parts over beats ${describe(chain[i - 1]!)} and ${describe(chain[i]!)}`,
                );
        }
    }

    return {
        removed,
        rippled,
        newTimeline,
        newTransition,
        newAssignment,
        chains,
    };
}

/**
 * Rewrites the timeline rows after a page or beat edit that changed the grid from `before` to the
 * grid now in the database. Does nothing when the grid didn't change. See the module comment for
 * the rules, the refusals and the statement order.
 */
// eslint-disable-next-line max-lines-per-function
export async function rippleTimelineToPageGridInTransaction({
    tx,
    before,
}: {
    tx: DbTransaction;
    before: PageGrid;
}): Promise<void> {
    const after = await readPageGrid(tx);
    if (sameGrid(before, after)) return;
    const rows = await readRippleRows(tx);
    const { transitions } = rows;
    const {
        removed,
        rippled,
        newTimeline,
        newTransition,
        newAssignment,
        chains,
    } = planTimelineRipple(before, after, rows);

    const T = schema.timeline_transitions;
    const L = schema.timelines;
    const A = schema.timeline_assignments;
    await mapDbErrors(async () => {
        // 1. Removed pages' moves, children first
        await deleteTimelineTransitionsInTransaction({
            transitionIds: removed,
            tx,
        });

        // 2, 3. Grow timelines, then transitions, to the union of old and new
        const grow = async (
            table: typeof T | typeof L,
            rows: { id: number; start_beat: number; end_beat: number }[],
            planned: Map<number, Range>,
        ) => {
            for (const row of rows) {
                const next = planned.get(row.id);
                if (!next) continue;
                const old: Range = [row.start_beat, row.end_beat];
                const u = union(old, next);
                if (sameRange(u, old)) continue;
                await tx
                    .update(table)
                    .set({ start_beat: u[0], end_beat: u[1] })
                    .where(eq(table.id, row.id));
            }
        };
        const shrink = async (
            table: typeof T | typeof L,
            rows: { id: number; start_beat: number; end_beat: number }[],
            planned: Map<number, Range>,
        ) => {
            for (const row of rows) {
                const next = planned.get(row.id);
                if (!next) continue;
                const u = union([row.start_beat, row.end_beat], next);
                if (sameRange(u, next)) continue;
                await tx
                    .update(table)
                    .set({ start_beat: next[0], end_beat: next[1] })
                    .where(eq(table.id, row.id));
            }
        };
        await grow(L, rippled, newTimeline);
        await grow(T, transitions, newTransition);

        // 4. Move each assignment once the rows in its way have moved
        for (const chain of chains.values()) {
            const moved = new Set<number>();
            const move = async (i: number): Promise<void> => {
                const a = chain[i]!;
                if (moved.has(a.id)) return;
                moved.add(a.id);
                const next = newAssignment.get(a.id)!;
                // Later rows whose old range the new one reaches into go first
                for (let j = i + 1; j < chain.length; j++) {
                    if (chain[j]!.start_beat >= next[1]) break;
                    await move(j);
                }
                // So do earlier rows it reaches back into
                for (let j = i - 1; j >= 0; j--) {
                    if (chain[j]!.end_beat <= next[0]) break;
                    await move(j);
                }
                if (next[0] === a.start_beat && next[1] === a.end_beat) return;
                await tx
                    .update(A)
                    .set({ start_beat: next[0], end_beat: next[1] })
                    .where(eq(A.id, a.id));
            };
            for (let i = 0; i < chain.length; i++) await move(i);
        }

        // 5, 6. Shrink transitions, then timelines, to the target
        await shrink(T, transitions, newTransition);
        await shrink(L, rippled, newTimeline);
    });

    // 7. Holding moves for added pages
    const beforeIds = new Set(before.pages.map((p) => p.id));
    for (const page of after.pages)
        if (page.id !== 0 && !beforeIds.has(page.id) && page.end > page.start)
            await addHoldingMoves(tx, page);
}

/**
 * Holding transitions over an added page (see the module comment): one per transition that ends
 * where the page starts, or one for every marcher when none does.
 */
// eslint-disable-next-line max-lines-per-function
async function addHoldingMoves(tx: DbTransaction, page: GridPage) {
    const m = page.start;
    const e = page.end;
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const ending = await tx
        .select()
        .from(T)
        .where(eq(T.end_beat, m))
        .orderBy(asc(T.id))
        .all();

    type Plan = { rows: { marcherId: number; layer: number }[] };
    const plans: Plan[] = [];
    if (ending.length > 0) {
        for (const t of ending) {
            const rows = await tx
                .select({ marcherId: A.marcher_id, layer: A.layer })
                .from(A)
                .where(and(eq(A.transition_id, t.id), eq(A.end_beat, m)))
                .orderBy(asc(A.slot_index))
                .all();
            plans.push({ rows });
        }
    } else {
        const timeline = await tx
            .select()
            .from(schema.timelines)
            .orderBy(asc(schema.timelines.id))
            .all()
            .then((ls) =>
                ls.find(
                    (l) =>
                        l.start_beat <= m &&
                        (m < l.end_beat || l.end_beat === m),
                ),
            );
        if (!timeline) return;
        const marchers = await tx
            .select({ id: schema.marchers.id })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id))
            .all();
        plans.push({
            rows: marchers.map((mr) => ({ marcherId: mr.id, layer: 0 })),
        });
    }

    const { snapshot } = await readTimelineTables(tx);
    const resolver = createResolver(snapshot);
    // The page's holding transitions share one timeline over the page (C-11), made with the first
    let timelineId: number | undefined;
    for (const plan of plans) {
        // Leave out a marcher that already has a row at that layer over the page
        const rows: { marcherId: number; layer: number }[] = [];
        for (const row of plan.rows) {
            const busy = await tx
                .select({ id: A.id })
                .from(A)
                .where(
                    and(
                        eq(A.marcher_id, row.marcherId),
                        eq(A.layer, row.layer),
                        lt(A.start_beat, e),
                        gt(A.end_beat, m),
                    ),
                )
                .get();
            if (!busy) rows.push(row);
        }
        if (rows.length === 0) continue;
        const points = rows.map((row) => {
            const [x, y] = resolver.positionAt(row.marcherId, m);
            const point: XY = [x, y];
            if (!validateDestination(point).ok)
                refuse(
                    `marcher ${row.marcherId} is outside the field's bounds at beat ${m}`,
                );
            return point;
        });

        if (timelineId === undefined) {
            // One timeline per range (C-12): a stored timeline over the page (say, one made by
            // Add selected marchers) holds the holds too
            const [timeline] = [
                (await findTimelineByRange(tx, { start: m, end: e })) ??
                    (await createRangeTimelineInTransaction(tx, {
                        startBeat: m,
                        endBeat: e,
                    })),
            ];
            timelineId = timeline!.id;
        }
        const [hold] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId,
                    startBeat: m,
                    endBeat: e,
                    slotCount: rows.length,
                    destination: { kind: "individual", points },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: rows.map((row, slotIndex) => ({
                marcherId: row.marcherId,
                transitionId: hold!.id,
                slotIndex,
                startBeat: m,
                endBeat: e,
                layer: row.layer,
            })),
        });
    }
}

// ---------------------------------------------------------------------------
// Wrapping a page or beat edit
// ---------------------------------------------------------------------------

/** Transactions already inside `withTimelinePageRipple`, so nested wrappers don't ripple twice. */
const rippling = new WeakSet<object>();

/**
 * Runs a page or beat edit and, in timeline mode, ripples the timeline rows to match in the same
 * transaction (see the module comment). With the flag off it only runs `edit`, so page mode is
 * unchanged. Call it inside `transactionWithHistory`, around everything the edit does to beats,
 * pages and `utility.last_page_counts`. Nested calls on the same transaction run their edit only;
 * the outermost one ripples once for all of it.
 */
export async function withTimelinePageRipple<T>(
    tx: DbTransaction,
    edit: () => Promise<T>,
): Promise<T> {
    if (rippling.has(tx) || !(await timelineModeInTransaction(tx)))
        return await edit();
    rippling.add(tx);
    try {
        const before = await readPageGrid(tx);
        const result = await edit();
        await rippleTimelineToPageGridInTransaction({ tx, before });
        return result;
    } finally {
        rippling.delete(tx);
    }
}
