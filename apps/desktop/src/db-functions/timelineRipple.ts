import { eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { DbTransaction } from "./types";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import { deleteTimelineTransitionsInTransaction } from "./timelineTransitions";
import { moveInSentence } from "@/timeline/timelineRangeWords";
import { readPageGrid, type GridPage, type PageGrid } from "./timelinePageGrid";
import {
    readHeldMarkArrivals,
    type HeldMarkArrival,
} from "./timelineHeldArrival";
import {
    text,
    type TimelineTextArg,
    timelineTextForLog,
} from "@/timeline/timelineText";

export {
    pageNumberOffsetInTransaction,
    readPageGrid,
    type GridPage,
    type PageGrid,
} from "./timelinePageGrid";

/**
 * Page and beat ripple (docs/timeline/phases/07-page-parity.md P7.4, P7.5).
 *
 * Timeline rows hold beat ordinals: beat `n` is the `n`th row of `beats` ordered by position,
 * counting from 0 (ADR 0012). Pages are time labels over those beats. So any edit that inserts,
 * deletes or reorders beats, or moves, adds or removes a page, has to rewrite timeline rows in the
 * same edit, or the rows end up over the wrong music. `withTimelinePageRipple` does that: it
 * reads the page grid (beat ids in order, and each page's beat range) before the page or beat
 * edit runs, reads it again afterwards, and rewrites every timeline, transition and
 * assignment to match, inside the same transaction, so one undo restores everything.
 *
 * **How a row's beats move.** Every row edge is mapped from the old grid to the new one:
 *
 * - Any row's edge on a page boundary follows that page, whether or not the row is a page move:
 *   a row ending where page N ends ends where page N ends now; a row starting where page N
 *   starts starts where page N starts now. So a track ending on a page boundary grows with that
 *   page when beats are inserted at the boundary, as the page's own move does. That is what
 *   makes the converted show (one transition per page) behave as the page model did: inserting beats
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
 * each shapeless transition whose assignments are all layer 0 and cover it, and that ends at the
 * page's flag or lies inside its box (what the converter writes, and every such move a merged box
 * holds after flag deletes, `isPageMove`), is deleted with its assignments and destinations. Any
 * other transition is never deleted here; one that would lose all its beats refuses the edit
 * instead (`E-ARGS`, naming it and its timeline). The page before then ends where the deleted page
 * ended, so its move stretches over the deleted page's beats, as in page mode (where those
 * coordinates are lost and the earlier page's move runs until the next page starts). A marcher's
 * row that would stretch into its next row at the same layer (a track, or a move crossing the
 * deleted page's flag) stops where that row starts instead.
 * A timeline left with no transition goes too (C-11: a timeline is the container for its moves),
 * and so does an empty page timeline that its page box no longer keeps
 * (`deleteStrayEmptyTimelinesInTransaction`); any other empty timeline ripples as usual.
 *
 * **Held marks** (`timeline_held_marks`, ADR 0012 amendment 2026-10-30, part 2) move with the
 * rows, by the owner's rules (2026-10-28):
 *
 * - a mark's start follows its **arrival** (the row it grows out of, `arrivalRowSql`): it takes
 *   that row's planned new end, after the stop-at-the-next-row clip below. If the arrival is a page
 *   move that goes with a removed page, the mark goes too (its arrival is gone);
 * - any other mark edge on a page flag follows that flag (the start of the page that begins
 *   there), and an end on the last page's end follows it;
 * - an edge mid-page stays on its beat, mapped as a row's end (a start, which is an arrival) or
 *   start (an end, from which the marcher moves again);
 * - an edge on a flag that goes away stays on its count: it is mapped by its beat, not by the
 *   page before (whose end moves to the deleted page's end);
 * - a mark left with no counts (its page was deleted, or all its beats) is deleted.
 *
 * So inserting beats in the page before a hold moves the hold with its arrival, resizing a page
 * moves the hold's edges on its flags, and deleting the held page deletes the hold.
 *
 * **When a page is added** (inserted, split off, or added at the end), nothing is written for it.
 * Page mode copies the previous page's coordinates onto a new page; here a marcher with no move over
 * the new page simply holds where it last was (C-12: no path writes timeline rows on behalf of a
 * page), so a later edit to an earlier page carries through the new page until that marcher's next
 * own move. A move over the page is written only when the designer moves someone there.
 *
 * **Refusals.** The ripple of existing rows is planned before its first timeline write, and the
 * edit is refused when a row would end up with no beats (`E-ARGS`), an assignment would leave its
 * transition (`E-A1`), a transition would leave its timeline (`E-T1`), or two of a marcher's rows
 * at one layer would overlap or swap order (`E-A3`). The whole edit then rolls back, page-mode
 * statements included, so nothing is written.
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
 * 6. every changed timeline shrinks to its new range.
 */

/** The largest beat a row may hold (spec I-N2). */
const MAX_BEAT = 2147483647;

/** `utility.last_page_counts` when the file has no utility row (the column's default). */
const sameGrid = (a: PageGrid, b: PageGrid) =>
    a.beatIds.length === b.beatIds.length &&
    a.beatIds.every((id, i) => b.beatIds[i] === id) &&
    a.pages.length === b.pages.length &&
    a.pages.every((p, i) => {
        const q = b.pages[i]!;
        return p.id === q.id && p.start === q.start && p.end === q.end;
    });

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
    /** The last page's end, when the same page is last in both grids */
    private readonly lastEnd: [number, number] | undefined;

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
        const lastBefore = before.pages.at(-1);
        const lastAfter = after.pages.at(-1);
        this.lastEnd =
            lastBefore && lastAfter && lastBefore.id === lastAfter.id
                ? [lastBefore.end, lastAfter.end]
                : undefined;
    }

    /**
     * Where a Held mark's edge at `b` goes when it isn't an arrival: with the page flag it sits on
     * (the start of a page in both grids, or the last page's end), else on its beat, mapped as a
     * row's `end` or `start` edge. A flag that goes away leaves the edge on its count.
     */
    markEdge(b: number, as: "start" | "end"): number {
        const flag =
            this.pageStart.get(b) ??
            (this.lastEnd && this.lastEnd[0] === b
                ? this.lastEnd[1]
                : undefined);
        if (flag !== undefined) return flag;
        return as === "end" ? this.beatEnd(b) : this.beatStart(b);
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

const union = (a: Range, b: Range): Range => [
    Math.min(a[0], b[0]),
    Math.max(a[1], b[1]),
];

const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];

const checkBeats = (r: Range, what: TimelineTextArg) => {
    if (r[0] >= r[1])
        refuse(text.t("timeline.refusals.ripple.noCounts", { what }));
    if (r[0] < 0 || r[1] > MAX_BEAT)
        refuse(text.t("timeline.refusals.ripple.outsideShow", { what }));
};

/**
 * A page move of `page`, which goes when the page goes: a shapeless transition whose assignments
 * are all at layer 0 and cover the whole transition, that lies entirely inside the page's box.
 * That is what the converter writes for a page and what a drag over a page writes where the
 * marcher has no move yet (stored files may also hold such moves from older builds' holds for
 * added pages). After flag deletes merge pages, the merged box holds several of them, and they all
 * go. Any other transition stays, and the edit is refused if it would lose its beats: a track the
 * user made, and a window move that starts before the box, even one ending at the page's flag
 * (owner decision V-149: Delete page and its moves keeps longer moves).
 */
const isPageMove = (
    t: { start_beat: number; end_beat: number; dest_shape_id: number | null },
    rows: readonly { start_beat: number; end_beat: number; layer: number }[],
    page: GridPage,
) =>
    t.dest_shape_id === null &&
    t.start_beat >= page.start &&
    t.end_beat <= page.end &&
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
    /** Each marcher's drill number ("T3") by id, for refusals; the id where absent */
    marcherLabels?: ReadonlyMap<number, string>;
    /**
     * The Held marks with their arrival rows; none in a file without the table (a page-era file
     * being converted)
     */
    marks?: readonly HeldMarkArrival[];
}

/** Reads every timeline, transition and assignment row, and the marchers' labels (`RippleRows`). */
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
    const marchers = await tx
        .select({
            id: schema.marchers.id,
            prefix: schema.marchers.drill_prefix,
            order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .all();
    const marcherLabels = new Map(
        marchers.map((m) => [m.id, `${m.prefix}${m.order}`]),
    );
    const marks = await readHeldMarkArrivals(tx);
    return { timelines, transitions, assignments, marcherLabels, marks };
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
    {
        timelines,
        transitions,
        assignments,
        marcherLabels,
        marks = [],
    }: RippleRows,
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
    // Refusals name moves and marchers as the timeline shows them, in pages and counts before
    // the change (`moveInSentence`, UI-14), never beats
    const boxes = before.pages.slice(1);
    const moves = timelines.map((l) => ({
        id: l.id,
        start: l.start_beat,
        end: l.end_beat,
        name: l.name,
    }));
    const moveName = (r: { start_beat: number; end_beat: number }) =>
        moveInSentence({ start: r.start_beat, end: r.end_beat }, boxes, moves);
    const transitionOf = new Map(transitions.map((t) => [t.id, t]));
    const partName = (a: (typeof assignments)[number]) => {
        const t = transitionOf.get(a.transition_id);
        return text.t("timeline.where.marcherPart", {
            marcher: marcherLabels?.get(a.marcher_id) ?? a.marcher_id,
            move: t ? moveName(t) : text.t("timeline.where.aMove"),
        });
    };
    // The invariant refusals below show their code's own message; theirs is for the log
    const logged = (value: TimelineTextArg) => timelineTextForLog(value);

    // A timeline whose transitions all go is deleted with them (C-11), so it isn't rippled. Nor is
    // an empty page timeline (everyone split off it, #581) unless it stays on its own page's box:
    // it's deleted, so it never lands on another page's box and outranks that page's move there.
    // Any other empty timeline (a move emptied with Remove, UI-9) ripples as usual
    const pageTimelines = pageTimelinesOf(
        timelines.map((l) => ({
            id: l.id,
            start: l.start_beat,
            end: l.end_beat,
        })),
        before.pages.slice(1),
    );
    const afterBox = new Map(after.pages.map((p) => [p.id, p]));
    const staysOnItsBox = (l: (typeof timelines)[number]) => {
        const page = before.pages.find(
            (p) =>
                p.id !== 0 && p.start === l.start_beat && p.end === l.end_beat,
        );
        const box = page && afterBox.get(page.id);
        if (!box) return false;
        const r = map.range(l.start_beat, l.end_beat);
        return r[0] === box.start && r[1] === box.end;
    };
    const emptied = new Set(
        timelines
            .filter((l) => {
                const owned = transitions.filter((t) => t.timeline_id === l.id);
                return owned.length > 0
                    ? owned.every((t) => removed.has(t.id))
                    : pageTimelines.has(l.id) && !staysOnItsBox(l);
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
                `this change would put ${logged(moveName(t))} outside its timeline`,
            );
        newTransition.set(t.id, r);
    }
    // Checked after the transitions, so a refusal names the move rather than its timeline
    for (const l of rippled) checkBeats(newTimeline.get(l.id)!, moveName(l));
    const kept = assignments.filter((a) => !removed.has(a.transition_id));
    const newAssignment = new Map<number, Range>();
    for (const a of kept) {
        const r = map.range(a.start_beat, a.end_beat);
        checkBeats(r, partName(a));
        const t = newTransition.get(a.transition_id)!;
        if (r[0] < t[0] || r[1] > t[1])
            throw new TimelineWriteError(
                "E-A1",
                `this change would move ${logged(partName(a))} outside that move`,
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
    // A row whose end followed a page edge past the marcher's next row ends where that row starts
    // instead: the move carries until the marcher's next own move (a page before a deleted page
    // takes its box, but a track or a move crossing its flag may still be in it)
    for (const chain of chains.values()) {
        chain.sort((a, b) => a.start_beat - b.start_beat);
        for (let i = 1; i < chain.length; i++) {
            const prev = newAssignment.get(chain[i - 1]!.id)!;
            const cur = newAssignment.get(chain[i]!.id)!;
            if (
                prev[1] > cur[0] &&
                prev[0] < cur[0] &&
                map.beatEnd(chain[i - 1]!.end_beat) <= cur[0]
            )
                prev[1] = cur[0];
            if (prev[1] > cur[0])
                throw new TimelineWriteError(
                    "E-A3",
                    `this change would overlap ${logged(partName(chain[i - 1]!))} and its part of ${logged(moveName(transitionOf.get(chain[i]!.transition_id)!))}`,
                );
        }
    }

    const { newMark, droppedMarks } = planHeldMarks(
        map,
        marks,
        assignments,
        removed,
        newAssignment,
    );

    return {
        removed,
        emptied,
        pageTimelines,
        rippled,
        newTimeline,
        newTransition,
        newAssignment,
        chains,
        newMark,
        droppedMarks,
    };
}

/**
 * The Held marks' new ranges (see the module comment): `newMark` for each mark that changed and
 * stays, `droppedMarks` for those whose arrival went with a removed page or that have no counts
 * left.
 */
function planHeldMarks(
    map: GridEdgeMap,
    marks: readonly HeldMarkArrival[],
    assignments: RippleRows["assignments"],
    removed: ReadonlySet<number>,
    newAssignment: ReadonlyMap<number, Range>,
) {
    const assignmentOf = new Map(assignments.map((a) => [a.id, a]));
    const newMark = new Map<number, Range>();
    const droppedMarks = new Set<number>();
    for (const mark of marks) {
        // The arrival, read by the one rule (`arrivalRowSql`, `readHeldMarkArrivals`)
        const arrival =
            mark.arrivalId === null
                ? undefined
                : assignmentOf.get(mark.arrivalId);
        const arrives = arrival !== undefined;
        if (arrives && removed.has(arrival.transition_id)) {
            droppedMarks.add(mark.id);
            continue;
        }
        const start = arrives
            ? newAssignment.get(arrival.id)![1]
            : map.markEdge(mark.start, "end");
        const end = map.markEdge(mark.end, "start");
        if (start >= end) droppedMarks.add(mark.id);
        else if (start !== mark.start || end !== mark.end)
            newMark.set(mark.id, [start, end]);
    }
    return { newMark, droppedMarks };
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
    const { transitions, marks = [] } = rows;
    const {
        removed,
        emptied,
        pageTimelines,
        rippled,
        newTimeline,
        newTransition,
        newAssignment,
        chains,
        newMark,
        droppedMarks,
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

        // 7. Held marks: the dropped ones, then each moved one. One marcher's starts keep their
        // order, so moving the later ones first when they move later (the earlier ones first when
        // earlier) never meets another mark's start (unique per marcher)
        const H = schema.timeline_held_marks;
        for (const id of droppedMarks) await tx.delete(H).where(eq(H.id, id));
        const moved = marks.filter((m) => newMark.has(m.id));
        const later = moved
            .filter((m) => newMark.get(m.id)![0] > m.start)
            .sort((x, y) => y.start - x.start);
        const earlier = moved
            .filter((m) => newMark.get(m.id)![0] <= m.start)
            .sort((x, y) => x.start - y.start);
        for (const m of [...later, ...earlier]) {
            const [start, end] = newMark.get(m.id)!;
            await tx
                .update(H)
                .set({ start_beat: start, end_beat: end })
                .where(eq(H.id, m.id));
        }
    });
    // 8. Empty timelines off their page's box (the others went with their transitions in 1)
    if (emptied.size > 0)
        await mapDbErrors(() =>
            tx.delete(L).where(inArray(L.id, [...emptied])),
        );
    await deleteStrayEmptyTimelinesInTransaction(tx, pageTimelines, after);
}

interface Span {
    id: number;
    start: number;
    end: number;
}

type Box = { start: number; end: number };
const sameSpan = (a: Box, b: Box) => a.start === b.start && a.end === b.end;

/** `l` is a page's own timeline: the oldest over exactly a page box (UI-25). */
const isPageTimeline = (
    l: Span,
    timelines: readonly Span[],
    boxes: readonly Box[],
) =>
    boxes.some((b) => sameSpan(b, l)) &&
    !timelines.some((o) => sameSpan(o, l) && o.id < l.id);

/**
 * The page timelines before a page edit, for `deleteStrayEmptyTimelinesInTransaction` to check
 * after it (`isPageTimeline`). Pure: `boxes` are the page boxes.
 */
export function pageTimelinesOf(
    timelines: readonly Span[],
    boxes: readonly Box[],
): Set<number> {
    return new Set(
        timelines
            .filter((l) => isPageTimeline(l, timelines, boxes))
            .map((l) => l.id),
    );
}

const readSpans = async (tx: DbTransaction) => {
    const L = schema.timelines;
    const timelines = await tx
        .select({ id: L.id, start: L.start_beat, end: L.end_beat })
        .from(L)
        .all();
    const used = new Set(
        (
            await tx
                .selectDistinct({
                    id: schema.timeline_transitions.timeline_id,
                })
                .from(schema.timeline_transitions)
                .all()
        ).map((t) => t.id),
    );
    return { timelines, used };
};

/**
 * `pageTimelinesOf` read from the database: call it before a page edit's first write, and pass
 * the result to `deleteStrayEmptyTimelinesInTransaction` after its last. Pass `grid` when it was
 * just read.
 */
export async function readPageTimelinesInTransaction(
    tx: DbTransaction,
    grid?: PageGrid,
): Promise<Set<number>> {
    const { timelines } = await readSpans(tx);
    const boxes = (grid ?? (await readPageGrid(tx))).pages.slice(1);
    return pageTimelinesOf(timelines, boxes);
}

/**
 * Deletes each of `pageTimelines` (the page timelines before a page edit,
 * `readPageTimelinesInTransaction`) that the edit left empty and the UI-25 rule no longer keeps
 * (#581 review). Splitting every marcher off a page leaves the page's timeline empty, and it keeps
 * its row while another timeline shares its range, so a split move never becomes the page's by
 * accident (ADR 0012, UI-25 amendment). Once a page edit leaves it off its box (the page deleted,
 * a flag deleted or added across it), or the box's oldest timeline isn't it, or no timeline with
 * transitions shares its range, it would only draw as an empty clip, so it goes. Any other empty
 * timeline, such as a move emptied with Remove (UI-9), is never touched. Pass `grid` when it was
 * just read. Returns the deleted ids.
 */
export async function deleteStrayEmptyTimelinesInTransaction(
    tx: DbTransaction,
    pageTimelines: ReadonlySet<number>,
    grid?: PageGrid,
): Promise<number[]> {
    if (pageTimelines.size === 0) return [];
    const { timelines, used } = await readSpans(tx);
    const candidates = timelines.filter(
        (l) => pageTimelines.has(l.id) && !used.has(l.id),
    );
    if (candidates.length === 0) return [];
    const boxes = (grid ?? (await readPageGrid(tx))).pages.slice(1);
    const stray = candidates
        .filter(
            (l) =>
                !isPageTimeline(l, timelines, boxes) ||
                !timelines.some(
                    (o) => o.id !== l.id && sameSpan(o, l) && used.has(o.id),
                ),
        )
        .map((l) => l.id);
    if (stray.length > 0)
        await mapDbErrors(() =>
            tx
                .delete(schema.timelines)
                .where(inArray(schema.timelines.id, stray)),
        );
    return stray;
}

// ---------------------------------------------------------------------------
// Wrapping a page or beat edit
// ---------------------------------------------------------------------------

/** Transactions already inside `withTimelinePageRipple`, so nested wrappers don't ripple twice. */
const rippling = new WeakSet<object>();

/**
 * Runs a page or beat edit and ripples the timeline rows to match in the same transaction (see
 * the module comment). Call it inside `transactionWithHistory`, around everything the edit does
 * to beats, pages and `utility.last_page_counts`. Nested calls on the same transaction run their
 * edit only; the outermost one ripples once for all of it.
 */
export async function withTimelinePageRipple<T>(
    tx: DbTransaction,
    edit: () => Promise<T>,
): Promise<T> {
    if (rippling.has(tx)) return await edit();
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
