/**
 * Applies one count edit (tempo mode's add or remove counts) and checks it lost nothing and moved
 * nothing the user didn't ask to move. See `countEditShow.ts` for the show and the snapshots.
 *
 * What is checked, against the state before the edit:
 *
 * - **Rows.** Every row of every beat-keyed table is still there, by id, except the removed beats.
 *   A row on a removed beat (a page, a measure, a cue, a prop change) is carried to the survivor
 *   (the first count left after the removed ones) or dropped only where the carry rules say so
 *   (`dropped` lists those, with why). Tables no count edit should touch are unchanged.
 * - **Counts.** Every count left keeps its length, notes, hold and tempo point (the count after
 *   removed ones takes theirs too: their tempo point, and their notes before its own), and shifts by the
 *   counts added or removed when it is after the spot; new counts are plain counts of the given
 *   length; "keep everything else in place" writes exactly the lengths it was given.
 * - **Seconds.** Every count after the spot (so every page start, cue, measure and prop change on
 *   it) starts later by the added length, earlier by the removed length, or at the same second
 *   when the edit is respaced.
 * - **Moves.** Every move, transition, assignment and held mark edge maps by the ripple's rules
 *   (`expectedEdge`); with `keep`, a move over the spot keeps its length.
 * - **Positions.** Through the app's resolver: each marcher (and prop) is where it was at every
 *   count where its position is set (home, every move's end and start, every hold edge, every page
 *   start it isn't moving through), at the count that maps to.
 * - **Measures.** Each measure reads the time signature that was in effect at its count before,
 *   and no measure number, rehearsal mark or note written on a measure disappears (except as
 *   listed in `dropped`).
 * - **Refusals** write nothing. **Undo** restores a full dump of the database exactly, and **redo**
 *   brings back exactly the edited state.
 */
import { performRedo, performUndo } from "@/db-functions/history";
import { keepInPlaceLengths } from "../tempoMath";
import type { DbConnection } from "@/test/base";
import {
    deleteCounts,
    insertCounts,
    type CountEditResult,
    type DrillChoice,
} from "../tempoWrites";
import {
    allCounts,
    anchors,
    close,
    dumpAll,
    positionsAt,
    readState,
    rows,
    type ShowState,
} from "./countEditShow";

export type Respaced = { from: number; lengths: readonly number[] };

export type CountEdit =
    | {
          kind: "insert";
          at: number;
          count: number;
          duration: number;
          drill: DrillChoice;
          respaced?: Respaced;
      }
    | {
          kind: "delete";
          from: number;
          to: number;
          drill: DrillChoice;
          respaced?: Respaced;
      };

export const describeEdit = (e: CountEdit) =>
    e.kind === "insert"
        ? `add ${e.count} at ${e.at} (${e.drill}${e.respaced ? ", respaced" : ""})`
        : `remove ${e.from}..${e.to - 1} (${e.drill}${e.respaced ? ", respaced" : ""})`;

export async function runEdit(edit: CountEdit): Promise<CountEditResult> {
    return edit.kind === "insert"
        ? await insertCounts(edit)
        : await deleteCounts(edit);
}

export interface CheckOutcome {
    /** The edit's result, or the error it was refused with */
    result?: CountEditResult;
    error?: unknown;
    /** Invariant failures: each is a bug, or an expectation the owner should look at */
    problems: string[];
    /** Data that went by a documented rule (carry onto a survivor that has its own) */
    dropped: string[];
    /**
     * Props that are somewhere else at a count where they were set: a prop put down by a
     * performer lies where that performer is on the put-down count
     */
    propMoved: string[];
    /**
     * A marcher's set hidden because the edit made two of its moves on different layers end on
     * the same count, where the higher one wins (a keyframe ending where the move under it now
     * ends): the lower move's set is never shown. An owner decision, see the matrix test.
     */
    layerTies: string[];
    before: ShowState;
    after?: ShowState;
}

type Row = Record<string, unknown>;
const n = (v: unknown) => v as number;

/** How counts map through the edit: old count number → new count number */
interface CountMap {
    /** Where an old count (a beat, or a row's start) lands */
    start: (o: number) => number;
    /**
     * Where a row ending at old count `e` (exclusive) ends now, by the ripple's rules:
     * an end on a page boundary follows the page; any other end stays at the end of its beat
     */
    end: (e: number) => number;
    /** Counts whose length is not checked (new, respaced) and the respaced span after */
    seconds: (oldOrdinal: number) => number | null;
}

/** Page boundaries (old counts): every page start, and the last page's end */
function boundaries(s: ShowState): Set<number> {
    const starts = s.pages
        .map((p) => s.ordinal.get(n(p.start_beat))!)
        .sort((a, b) => a - b);
    const out = new Set(starts);
    const last = starts[starts.length - 1]!;
    if (last > 0) out.add(Math.min(last + s.lastPageCounts, s.beats.length));
    return out;
}

function countMap(edit: CountEdit, before: ShowState): CountMap {
    const durations = before.beats.map((b) => n(b.duration));
    if (edit.kind === "insert") {
        const { at, count, duration, respaced } = edit;
        const bounds = boundaries(before);
        const span = respaced
            ? {
                  a: respaced.from,
                  e: respaced.from + respaced.lengths.length - count,
              }
            : null;
        return {
            start: (o) => (o >= at ? o + count : o),
            end: (e) =>
                e > at || (e === at && bounds.has(at)) ? e + count : e,
            seconds: (o) => {
                if (span) {
                    if (o < span.a || o >= span.e) return 0;
                    if (o === span.a && at > span.a) return 0;
                    return null;
                }
                return o >= at ? count * duration : 0;
            },
        };
    }
    const { from, to, respaced } = edit;
    const removed = to - from;
    const lost = durations.slice(from, to).reduce((a, b) => a + b, 0);
    const span = respaced
        ? {
              a: respaced.from,
              e: respaced.from + respaced.lengths.length + removed,
          }
        : null;
    const f = (o: number) => (o <= from ? o : Math.max(from, o - removed));
    return {
        start: f,
        end: f,
        seconds: (o) => {
            if (o >= from && o < to) return null;
            if (span) {
                if (o < span.a || o >= span.e) return 0;
                if (o === span.a && from > span.a) return 0;
                return null;
            }
            return o >= to ? -lost : 0;
        },
    };
}

/** The meter in effect at each measure (the last one written at or before it), by measure id */
function meterInEffect(s: ShowState): Map<number, string> {
    const sorted = [...s.measures].sort(
        (a, b) =>
            s.ordinal.get(n(a.start_beat))! - s.ordinal.get(n(b.start_beat))!,
    );
    const out = new Map<number, string>();
    let cur = "(none)";
    for (const m of sorted) {
        if (m.meter) cur = `${m.meter} ${m.grouping ?? ""}`;
        out.set(n(m.id), cur);
    }
    return out;
}

/** The meter in effect at an old count number */
function meterAtCount(s: ShowState, count: number): string {
    const sorted = [...s.measures]
        .map((m) => ({ m, start: s.ordinal.get(n(m.start_beat))! }))
        .sort((a, b) => a.start - b.start);
    let cur = "(none)";
    for (const { m, start } of sorted) {
        if (start > count) break;
        if (m.meter) cur = `${m.meter} ${m.grouping ?? ""}`;
    }
    return cur;
}

const byId = (list: Row[], key = "id") =>
    new Map(list.map((r) => [n(r[key]), r]));

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

const without = (r: Row, ...keys: string[]) => {
    const out = { ...r };
    for (const k of keys) delete out[k];
    return out;
};

/**
 * Apply `edit` and check every invariant. `undo` (default true) also undoes and redoes it and
 * compares full dumps; the database is left in the edited state either way.
 */
export async function applyAndCheck(
    db: DbConnection,
    edit: CountEdit,
    {
        undo = true,
        run = () => runEdit(edit),
        newMeasure = false,
    }: {
        undo?: boolean;
        /** Runs the edit (default: `runEdit`), for options `CountEdit` doesn't carry */
        run?: () => Promise<CountEditResult>;
        /** An add that makes a measure of the new counts (Add a measure before) */
        newMeasure?: boolean;
    } = {},
): Promise<CheckOutcome> {
    const before = await readState(db);
    const dumpBefore = await dumpAll(db);
    const anchorsBefore = anchors(before);
    const posBefore = await positionsAt(db, allCounts(anchorsBefore));
    const problems: string[] = [];
    const dropped: string[] = [];
    const propMoved: string[] = [];
    const layerTies: string[] = [];
    const where = describeEdit(edit);

    let result: CountEditResult;
    try {
        result = await run();
    } catch (error) {
        const dumpNow = await dumpAll(db);
        for (const table of Object.keys(dumpBefore))
            if (!same(dumpBefore[table], dumpNow[table]))
                problems.push(`${where}: refused but changed ${table}`);
        return { error, problems, dropped, propMoved, layerTies, before };
    }
    const after = await readState(db);
    const map = countMap(edit, before);

    // Counts stored past the end first (endless counts), before the edit itself
    const stored =
        edit.kind === "insert"
            ? Math.max(0, edit.at - before.beats.length)
            : Math.max(0, edit.to + 1 - before.beats.length);
    const doomed = new Set<number>(
        edit.kind === "delete"
            ? after.ordinal.size === 0
                ? []
                : [] // filled below from the ids that went
            : [],
    );
    const afterIds = new Set(after.beats.map((b) => n(b.id)));
    for (const b of before.beats)
        if (!afterIds.has(n(b.id))) doomed.add(n(b.id));

    // ---- beats
    const added = edit.kind === "insert" ? edit.count : 0;
    const removed =
        edit.kind === "delete" ? edit.to - Math.max(1, edit.from) : 0;
    const expectedLength = before.beats.length + stored + added - removed;
    if (after.beats.length !== expectedLength)
        problems.push(
            `${where}: ${after.beats.length} beats, expected ${expectedLength}`,
        );
    if (edit.kind === "delete") {
        const expectGone = before.beats
            .slice(Math.max(1, edit.from), edit.to)
            .map((b) => n(b.id));
        if (!same([...doomed].sort(), expectGone.sort()))
            problems.push(
                `${where}: removed beats ${[...doomed]} but expected ${expectGone}`,
            );
    } else if (doomed.size)
        problems.push(`${where}: an add removed beats ${[...doomed]}`);
    const respacedOrdinals = new Map<number, number>();
    if (edit.respaced)
        edit.respaced.lengths.forEach((l, i) => {
            if (edit.respaced!.from + i > 0)
                respacedOrdinals.set(edit.respaced!.from + i, l);
        });
    const beatAfter = byId(after.beats);
    for (const b of before.beats) {
        const id = n(b.id);
        if (doomed.has(id)) continue;
        const now = beatAfter.get(id)!;
        const o = before.ordinal.get(id)!;
        const expectedOrdinal = map.start(o);
        const o2 = after.ordinal.get(id)!;
        if (o2 !== expectedOrdinal)
            problems.push(
                `${where}: count ${o} (beat ${id}) is now count ${o2}, expected ${expectedOrdinal}`,
            );
        // The count after removed ones takes their tempo point and notes (written first)
        const want: Record<string, unknown> = { ...b };
        if (edit.kind === "delete" && b === before.beats[edit.to]) {
            const gone = before.beats.slice(Math.max(1, edit.from), edit.to);
            const notes = [...gone.map((g) => g.notes), b.notes]
                .map((x) => (typeof x === "string" ? x.trim() : ""))
                .filter(Boolean);
            if (notes.length) want.notes = notes.join("\n");
            if (gone.some((g) => g.tempo_change)) want.tempo_change = 1;
        }
        for (const k of [
            "notes",
            "tempo_hold",
            "tempo_change",
            "include_in_measure",
        ])
            if (!same(want[k], now[k]))
                problems.push(
                    `${where}: count ${o} ${k} ${JSON.stringify(want[k])} → ${JSON.stringify(now[k])}`,
                );
        if (!respacedOrdinals.has(o2) && !close(n(b.duration), n(now.duration)))
            problems.push(
                `${where}: count ${o} length ${b.duration} → ${now.duration}`,
            );
    }
    for (const [o, l] of respacedOrdinals) {
        const b = after.beats[o];
        if (!b || !close(n(b.duration), l))
            problems.push(
                `${where}: respaced count ${o} has length ${b?.duration}, expected ${l}`,
            );
    }
    if (edit.kind === "insert") {
        const beforeIds = new Set(before.beats.map((b) => n(b.id)));
        const fresh = after.beats
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => !beforeIds.has(n(b.id)));
        for (const { b, i } of fresh) {
            const isNew = i >= edit.at && i < edit.at + edit.count;
            if (!isNew) continue; // stored past the end first
            if (b.tempo_hold || b.tempo_change || b.notes)
                problems.push(
                    `${where}: new count ${i} has facts ${JSON.stringify(b)}`,
                );
            if (
                !respacedOrdinals.has(i) &&
                !close(n(b.duration), edit.duration)
            )
                problems.push(
                    `${where}: new count ${i} is ${b.duration} s, expected ${edit.duration}`,
                );
        }
        const newAt = fresh.filter(
            ({ i }) => i >= edit.at && i < edit.at + edit.count,
        );
        if (newAt.length !== edit.count)
            problems.push(
                `${where}: the new counts are at ${fresh.map(({ i }) => i)}, expected ${edit.at}..${edit.at + edit.count - 1}`,
            );
    }

    // ---- seconds of every count left
    for (const b of before.beats) {
        const id = n(b.id);
        if (doomed.has(id)) continue;
        const o = before.ordinal.get(id)!;
        const delta = map.seconds(o);
        if (delta === null) continue;
        const want = before.seconds.get(id)! + delta;
        const got = after.seconds.get(id)!;
        if (!close(want, got, 1e-6))
            problems.push(
                `${where}: count ${o} starts at ${got.toFixed(4)} s, expected ${want.toFixed(4)} s`,
            );
    }

    // ---- the survivor and where carried rows go
    const survivorId =
        edit.kind === "delete"
            ? ((before.beats[edit.to]?.id as number | undefined) ??
              after.beats[edit.from]?.id)
            : undefined;

    // ---- pages
    const pagesAfter = byId(after.pages);
    for (const p of before.pages) {
        const now = pagesAfter.get(n(p.id));
        if (!now) {
            problems.push(`${where}: page ${p.id} is gone`);
            continue;
        }
        const wantBeat = doomed.has(n(p.start_beat))
            ? survivorId
            : p.start_beat;
        if (now.start_beat !== wantBeat)
            problems.push(
                `${where}: page ${p.id} starts on beat ${now.start_beat}, expected ${wantBeat}`,
            );
        if (!same(without(p, "start_beat"), without(now, "start_beat")))
            problems.push(
                `${where}: page ${p.id} changed ${JSON.stringify(now)}`,
            );
    }
    if (after.pages.length !== before.pages.length)
        problems.push(
            `${where}: ${after.pages.length} pages, were ${before.pages.length}`,
        );
    {
        // the last page's length: its end maps like a row's end
        const lastBefore = [...before.pages]
            .sort(
                (a, b) =>
                    before.ordinal.get(n(a.start_beat))! -
                    before.ordinal.get(n(b.start_beat))!,
            )
            .at(-1)!;
        const s = before.ordinal.get(n(lastBefore.start_beat))!;
        if (s > 0) {
            const e = Math.min(s + before.lastPageCounts, before.beats.length);
            const want =
                map.end(e) -
                after.ordinal.get(
                    n(pagesAfter.get(n(lastBefore.id))!.start_beat),
                )!;
            const drawn = (st: ShowState) => {
                const last = [...st.pages]
                    .sort(
                        (a, b) =>
                            st.ordinal.get(n(a.start_beat))! -
                            st.ordinal.get(n(b.start_beat))!,
                    )
                    .at(-1)!;
                const ls = st.ordinal.get(n(last.start_beat))!;
                return Math.min(ls + st.lastPageCounts, st.beats.length) - ls;
            };
            if (drawn(after) !== want)
                problems.push(
                    `${where}: the last page is drawn ${drawn(after)} counts long (last_page_counts ${after.lastPageCounts}), expected ${want}`,
                );
        }
    }

    // ---- measures
    const measuresAfter = byId(after.measures);
    const holder = after.measures.find((m) => m.start_beat === survivorId);
    const facts = [
        "meter",
        "grouping",
        "number_override",
        "rehearsal_mark",
        "notes",
    ];
    for (const m of before.measures) {
        const now = measuresAfter.get(n(m.id));
        const onDoomed = doomed.has(n(m.start_beat));
        if (!now) {
            if (!onDoomed) {
                problems.push(
                    `${where}: measure ${m.id} (count ${before.ordinal.get(n(m.start_beat))}) is gone`,
                );
                continue;
            }
            // its facts go to the holder
            for (const k of ["number_override", "rehearsal_mark", "notes"]) {
                if (m[k] === null || m[k] === undefined) continue;
                if (holder && same(holder[k], m[k])) continue;
                const msg = `${where}: measure ${m.id} ${k} ${JSON.stringify(m[k])} dropped (the measure left on the survivor has ${JSON.stringify(holder?.[k])})`;
                if (
                    holder &&
                    holder[k] !== null &&
                    k !== "notes" &&
                    k !== "rehearsal_mark"
                )
                    dropped.push(msg);
                else if (holder && holder[k] !== null) dropped.push(msg);
                else problems.push(msg);
            }
            continue;
        }
        if (onDoomed) {
            if (now.start_beat !== survivorId)
                problems.push(
                    `${where}: measure ${m.id} moved to beat ${now.start_beat}, expected ${survivorId}`,
                );
        } else if (now.start_beat !== m.start_beat)
            problems.push(
                `${where}: measure ${m.id} start beat ${m.start_beat} → ${now.start_beat}`,
            );
        for (const k of facts) {
            if (same(m[k], now[k])) continue;
            const isHolder =
                (holder && n(holder.id) === n(m.id)) ||
                // the measure after a measure added before it may have its (now repeated) meter cleared
                (newMeasure &&
                    edit.kind === "insert" &&
                    before.ordinal.get(n(m.start_beat)) === edit.at);
            // the holder may take facts from the measures that went, or have a repeated meter cleared
            if (
                isHolder &&
                (m[k] === null || k === "meter" || k === "grouping")
            )
                continue;
            problems.push(
                `${where}: measure ${m.id} ${k} ${JSON.stringify(m[k])} → ${JSON.stringify(now[k])}`,
            );
        }
    }
    for (const m of after.measures)
        if (!before.measures.some((b) => b.id === m.id)) {
            const o = after.ordinal.get(n(m.start_beat))!;
            const fromStore =
                stored > 0 && !before.beats.some((b) => b.id === m.start_beat);
            const added = newMeasure && edit.kind === "insert" && o === edit.at;
            if (!fromStore && !added)
                problems.push(`${where}: a new measure ${m.id} at count ${o}`);
        }
    // every measure reads the time signature that was in effect at its count before
    {
        const effectAfter = meterInEffect(after);
        for (const m of after.measures) {
            const startBefore = before.ordinal.get(n(m.start_beat));
            if (startBefore === undefined) continue; // on a stored count
            const want = meterAtCount(before, startBefore);
            const got = effectAfter.get(n(m.id))!;
            if (want !== got)
                problems.push(
                    `${where}: measure ${m.id} at count ${after.ordinal.get(n(m.start_beat))} reads ${got}, was ${want} at its count`,
                );
        }
    }

    // ---- moves (timelines, transitions, assignments, held marks)
    const keptTimelines = new Set<number>();
    const timelinesAfter = byId(after.timelines);
    const wantRange = (r: Row) => ({
        start: map.start(n(r.start_beat)),
        end: Math.max(
            map.start(n(r.start_beat)) + (edit.kind === "delete" ? 0 : 0),
            map.end(n(r.end_beat)),
        ),
    });
    for (const t of before.timelines) {
        const now = timelinesAfter.get(n(t.id));
        if (!now) {
            problems.push(
                `${where}: move (timeline) ${t.id} [${t.start_beat}, ${t.end_beat}) is gone`,
            );
            continue;
        }
        const w = wantRange(t);
        const s0 = n(t.start_beat);
        const e0 = n(t.end_beat);
        const len0 = e0 - s0;
        const around =
            edit.kind === "insert"
                ? s0 < edit.at &&
                  (e0 > edit.at || (e0 === edit.at && w.end !== e0))
                : s0 < edit.to && e0 > edit.from;
        const len = n(now.end_beat) - n(now.start_beat);
        if (
            edit.drill === "keep" &&
            around &&
            len === len0 &&
            w.end - w.start !== len0
        ) {
            keptTimelines.add(n(t.id));
            if (n(now.start_beat) !== w.start)
                problems.push(
                    `${where}: kept move ${t.id} starts at ${now.start_beat}, expected ${w.start}`,
                );
            continue;
        }
        if (n(now.start_beat) !== w.start || n(now.end_beat) !== w.end)
            problems.push(
                `${where}: move ${t.id} [${s0}, ${e0}) → [${now.start_beat}, ${now.end_beat}), expected [${w.start}, ${w.end})`,
            );
    }
    if (edit.drill === "keep") {
        const kept = keptTimelines.size;
        if (result.kept !== kept)
            problems.push(
                `${where}: says ${result.kept} moves kept their counts, ${kept} did`,
            );
    }
    for (const [name, list, listAfter, timelineOf] of [
        [
            "transition",
            before.transitions,
            after.transitions,
            (r: Row) => n(r.timeline_id),
        ],
        [
            "assignment",
            before.assignments,
            after.assignments,
            (r: Row) =>
                n(
                    before.transitions.find((t) => t.id === r.transition_id)
                        ?.timeline_id,
                ),
        ],
    ] as const) {
        const now = byId(listAfter as Row[]);
        for (const r of list as Row[]) {
            const a = now.get(n(r.id));
            if (!a) {
                problems.push(
                    `${where}: ${name} ${r.id} [${r.start_beat}, ${r.end_beat}) is gone`,
                );
                continue;
            }
            if (keptTimelines.has(timelineOf(r))) continue;
            const w = wantRange(r);
            if (n(a.start_beat) !== w.start || n(a.end_beat) !== w.end)
                problems.push(
                    `${where}: ${name} ${r.id} [${r.start_beat}, ${r.end_beat}) → [${a.start_beat}, ${a.end_beat}), expected [${w.start}, ${w.end})`,
                );
            if (
                !same(
                    without(r, "start_beat", "end_beat", "layer"),
                    without(a, "start_beat", "end_beat", "layer"),
                )
            )
                problems.push(
                    `${where}: ${name} ${r.id} changed ${JSON.stringify(r)} → ${JSON.stringify(a)}`,
                );
            if (name === "assignment" && r.layer !== a.layer)
                problems.push(
                    `${where}: assignment ${r.id} layer ${r.layer} → ${a.layer}`,
                );
        }
        if ((listAfter as Row[]).length !== (list as Row[]).length)
            problems.push(
                `${where}: ${(listAfter as Row[]).length} ${name}s, were ${(list as Row[]).length}`,
            );
    }
    {
        const now = byId(after.held);
        for (const h of before.held) {
            const a = now.get(n(h.id));
            if (!a) {
                problems.push(
                    `${where}: held mark ${h.id} [${h.start_beat}, ${h.end_beat}) is gone`,
                );
                continue;
            }
            if (n(a.end_beat) !== map.end(n(h.end_beat)))
                problems.push(
                    `${where}: held mark ${h.id} [${h.start_beat}, ${h.end_beat}) → [${a.start_beat}, ${a.end_beat}), expected to end at ${map.end(n(h.end_beat))}`,
                );
        }
        if (after.held.length !== before.held.length)
            problems.push(
                `${where}: ${after.held.length} held marks, were ${before.held.length}`,
            );
    }

    // ---- cues
    {
        const now = byId(after.cues);
        const droppedCues = new Set(result.cues?.dropped ?? []);
        for (const c of before.cues) {
            const a = now.get(n(c.id));
            const onDoomed = doomed.has(n(c.beat_id));
            const o = before.ordinal.get(n(c.beat_id));
            if (!a) {
                if (onDoomed && droppedCues.has(n(c.id)))
                    dropped.push(
                        `${where}: cue ${c.id} on count ${o} dropped (reported to the user)`,
                    );
                else
                    problems.push(
                        `${where}: cue ${c.id} on count ${o} is gone${onDoomed ? " and not reported" : ""}`,
                    );
                continue;
            }
            const wantBeat = onDoomed ? survivorId : c.beat_id;
            if (a.beat_id !== wantBeat)
                problems.push(
                    `${where}: cue ${c.id} on count ${o} moved to beat ${a.beat_id}, expected ${wantBeat}`,
                );
            const moved = (result.cues?.moved ?? []).find(
                (m) => m.cueId === c.id,
            );
            const changed = without(
                a,
                "beat_id",
                ...(moved?.shortenedTo !== undefined ? ["length"] : []),
            );
            if (
                !same(
                    without(
                        c,
                        "beat_id",
                        ...(moved?.shortenedTo !== undefined ? ["length"] : []),
                    ),
                    changed,
                )
            )
                problems.push(
                    `${where}: cue ${c.id} changed ${JSON.stringify(c)} → ${JSON.stringify(a)}`,
                );
        }
        const members = (list: Row[]) =>
            list
                .filter((m) => now.has(n(m.cue_id)))
                .map((m) => JSON.stringify(m))
                .sort();
        if (!same(members(before.cueMarchers), members(after.cueMarchers)))
            problems.push(`${where}: cue members changed`);
    }

    // ---- prop changes
    for (const [name, list, listAfter] of [
        ["Outline change", before.geometry, after.geometry],
        ["Placement change", before.placements, after.placements],
        ["artwork slot", before.artwork, after.artwork],
    ] as const) {
        const now = byId(listAfter as Row[]);
        for (const r of list as Row[]) {
            const a = now.get(n(r.id));
            const onDoomed = doomed.has(n(r.beat_id));
            const o = before.ordinal.get(n(r.beat_id));
            if (!a) {
                // the carry keeps the last change of a run, unless the item has one on the survivor
                const itemOnSurvivor = (listAfter as Row[]).some(
                    (x) =>
                        x.item_id === r.item_id &&
                        x.beat_id === survivorId &&
                        (name !== "artwork slot" || x.slot === r.slot),
                );
                const laterInRun = (list as Row[]).some(
                    (x) =>
                        x.id !== r.id &&
                        x.item_id === r.item_id &&
                        doomed.has(n(x.beat_id)) &&
                        before.ordinal.get(n(x.beat_id))! > o! &&
                        (name !== "artwork slot" || x.slot === r.slot),
                );
                if (onDoomed && (itemOnSurvivor || laterInRun))
                    dropped.push(
                        `${where}: ${name} ${r.id} of item ${r.item_id} on count ${o} dropped (${itemOnSurvivor ? "the item has its own change on the survivor" : "a later change in the removed run wins"})`,
                    );
                else
                    problems.push(
                        `${where}: ${name} ${r.id} of item ${r.item_id} on count ${o} is gone`,
                    );
                continue;
            }
            const wantBeat = onDoomed ? survivorId : r.beat_id;
            if (a.beat_id !== wantBeat)
                problems.push(
                    `${where}: ${name} ${r.id} on count ${o} moved to beat ${a.beat_id}, expected ${wantBeat}`,
                );
            if (
                !same(
                    without(r, "beat_id", "beat_rank"),
                    without(a, "beat_id", "beat_rank"),
                )
            )
                problems.push(
                    `${where}: ${name} ${r.id} changed ${JSON.stringify(r)} → ${JSON.stringify(a)}`,
                );
        }
    }

    // ---- tables no count edit touches
    for (const [name, list] of Object.entries(before.untouched))
        if (!same(list, after.untouched[name]))
            problems.push(`${where}: ${name} changed`);

    // ---- resolved positions at every count where a position is set
    {
        // a kept move's set is reached at its kept end
        const keptEnd = new Map<number, number>(); // assignment id → its end now
        for (const a of after.assignments) {
            const t = before.transitions.find((t) => t.id === a.transition_id);
            if (t && keptTimelines.has(n(t.timeline_id)))
                keptEnd.set(n(a.id), n(a.end_beat));
        }
        const keptAt = new Map<string, number>(); // "marcher:old end" → kept end
        for (const a of before.assignments) {
            const end = keptEnd.get(n(a.id));
            if (end !== undefined)
                keptAt.set(`${a.marcher_id}:${a.end_beat}`, end);
        }
        const pairs: { m: number; c: number; c2: number; kind: string }[] = [];
        for (const [m, list] of anchorsBefore)
            for (const { count: c, kind } of list) {
                if (edit.kind === "delete" && c > edit.from && c < edit.to)
                    continue; // a count that went
                const c2 =
                    kind === "home"
                        ? 0
                        : kind === "page"
                          ? map.start(c)
                          : (keptAt.get(`${m}:${c}`) ?? map.end(c));
                pairs.push({ m, c, c2, kind });
            }
        const posAfter = await positionsAt(db, new Set(pairs.map((p) => p.c2)));
        let reported = 0;
        const seen = new Set<string>();
        for (const { m, c, c2, kind } of pairs) {
            const key = `${m}:${c}:${c2}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const p = posBefore.get(c)?.get(m);
            const q = posAfter.get(c2)?.get(m);
            if (!p || !q) continue;
            if (close(p[0], q[0], 1e-6) && close(p[1], q[1], 1e-6)) continue;
            const msg = `${where}: ${before.propIds.has(m) ? "prop" : "marcher"} ${m} at count ${c} (${kind}) was (${p[0].toFixed(2)}, ${p[1].toFixed(2)}), at count ${c2} now (${q[0].toFixed(2)}, ${q[1].toFixed(2)})`;
            // two of the marcher's moves on different layers end on c2 now, and didn't end together before
            const layersEndingAt = (st: ShowState, at: number) =>
                new Set(
                    st.assignments
                        .filter((a) => a.marcher_id === m && a.end_beat === at)
                        .map((a) => a.layer),
                ).size;
            if (before.propIds.has(m)) propMoved.push(msg);
            else if (
                layersEndingAt(after, c2) > 1 &&
                layersEndingAt(before, c) < 2
            )
                layerTies.push(msg);
            else if (reported++ < 12) problems.push(msg);
        }
        if (reported > 12)
            problems.push(`${where}: … ${reported - 12} more positions moved`);
    }

    // ---- undo and redo
    if (undo) {
        const dumpAfter = await dumpAll(db);
        await performUndo(db);
        const dumpUndone = await dumpAll(db);
        for (const table of Object.keys(dumpBefore))
            if (!same(dumpBefore[table], dumpUndone[table]))
                problems.push(`${where}: undo didn't restore ${table}`);
        await performRedo(db);
        const dumpRedone = await dumpAll(db);
        for (const table of Object.keys(dumpAfter))
            if (!same(dumpAfter[table], dumpRedone[table]))
                problems.push(`${where}: redo didn't restore ${table}`);
    }

    return { result, problems, dropped, propMoved, layerTies, before, after };
}

/** The lengths "keep everything else in place" writes, worked out as TempoBand does */
export function respacedFor(
    durations: readonly number[],
    span: { a: number; e: number },
    edit:
        | { kind: "insert"; at: number; count: number; len: number }
        | { kind: "delete"; from: number; to: number },
    holds: ReadonlySet<number> = new Set(),
): Respaced {
    return keepInPlaceLengths(durations, holds, span, edit);
}

/** The counts that are holds, by count number, from the database */
export async function holdsOf(db: DbConnection): Promise<Set<number>> {
    const s = await readState(db);
    return new Set(
        (await rows(db, "beats"))
            .filter((b) => b.tempo_hold)
            .map((b) => s.ordinal.get(n(b.id))!),
    );
}

/** Durations by count number, from the database */
export async function durations(db: DbConnection): Promise<number[]> {
    const beats = await rows(db, "beats");
    const s = await readState(db);
    return beats
        .map((b) => ({ o: s.ordinal.get(n(b.id))!, d: n(b.duration) }))
        .sort((a, b) => a.o - b.o)
        .map((x) => x.d);
}

/** The measure holding count `beat` as [start, end) counts, as TempoBand's keepSpan */
export async function measureSpan(db: DbConnection, beat: number) {
    const s = await readState(db);
    const starts = s.measures
        .map((m) => s.ordinal.get(n(m.start_beat))!)
        .sort((a, b) => a - b);
    const a = [...starts].reverse().find((x) => x <= beat);
    if (a === undefined) return { a: 1, e: beat + 1 };
    const next = starts.find((x) => x > a);
    return { a, e: next ?? s.beats.length };
}
