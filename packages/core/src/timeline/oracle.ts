// cspell:ignore lerp prevs NONFOUNDING
/**
 * Reference oracle: an uncached, spec-literal implementation of section 8
 * (R-1 to R-13) with the section 8.9 diagnostics. Ported from
 * `docs/timeline/ref/oracle.mjs`.
 *
 * FOR TESTS AND SMALL SHOWS ONLY. It is deliberately naive and recursive:
 * an origin is computed by evaluating the previous span, so a long chain of
 * spans recurses that deep, and nothing is cached across calls except the
 * structural memos (flattening and FTL entries), which are pure. Production
 * code uses the cached resolver instead. Exposed from the package root only
 * as `createTimelineOracleForTesting`.
 */
import {
    arcPoint,
    classifySpan,
    clamp01,
    destPath,
    destinationsOf,
    flatten,
    lerp,
    makeTrail,
    paramT,
} from "./geom";
import type {
    AssignmentRow,
    Beat,
    Diagnostic,
    FlatSpan,
    FtlEntryInfo,
    FtlTrail,
    OrderSource,
    SpanInfo,
    SpanKind,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "./types";

/** A flattened span tagged with its marcher and its index in that marcher's list. */
export interface OracleSpan extends FlatSpan<AssignmentRow> {
    m: number;
    k: number;
}

/** The oracle's internal FTL entry: {@link FtlEntryInfo} plus the trail and a target map. */
export interface OracleFtlEntry {
    members: number[];
    source: OrderSource;
    trail: FtlTrail;
    startDist: number[];
    endDist: number[];
    target: Map<number, XY>;
}

export interface Oracle {
    /** R-2: the marcher's spans, the same objects on every call. */
    spans(marcherId: number): OracleSpan[];
    /** R-3 */
    kind(span: OracleSpan): SpanKind;
    /** Position at beat `b`, evaluated with `span` (R-5 to R-12). */
    evalSpan(span: OracleSpan, b: Beat): XY;
    /** R-9, R-12, in the public shape of spec 10.1. */
    ftlEntry(transitionId: number): FtlEntryInfo;
    /** The full internal entry, including the trail. */
    ftlEntryRaw(transitionId: number): OracleFtlEntry;
    positionAt(marcherId: number, beat: Beat): XY;
    /** Spans in the public shape of spec 10.1. */
    spanInfos(marcherId: number): SpanInfo[];
    /** Section 8.9, for the whole show. */
    diagnostics(): Diagnostic[];
}

export function createOracle(db: TimelineSnapshot): Oracle {
    const T = (id: number): TransitionRow => {
        const t = db.transitions[id];
        if (!t) throw new Error(`transition ${id} not found`);
        return t;
    };
    const spanCache = new Map<number, OracleSpan[]>(); // structural memo only: flatten is pure
    const spans = (m: number): OracleSpan[] => {
        let s = spanCache.get(m);
        if (!s) {
            s = flatten(db.assignments.filter((r) => r.marcher === m)).map(
                (sp, k) => ({ ...sp, m, k }),
            );
            spanCache.set(m, s);
        }
        return s;
    };
    const home = (m: number): XY => {
        const x = db.marchers.find((mm) => mm.id === m);
        if (!x) throw new Error(`marcher ${m} not found`);
        return x.home;
    };

    // R-3
    const kind = (sp: OracleSpan): SpanKind =>
        classifySpan(sp, spans(sp.m), (id) => T(id).start);

    // R-4
    const oMemo = new Map<OracleSpan, XY>();
    const origin = (sp: OracleSpan): XY => {
        let o = oMemo.get(sp);
        if (!o) {
            o =
                sp.k === 0
                    ? home(sp.m)
                    : evalSpan(spans(sp.m)[sp.k - 1]!, sp.start);
            oMemo.set(sp, o);
        }
        return o;
    };

    function evalSpan(sp: OracleSpan, b: Beat): XY {
        if (!sp.row) return origin(sp); // R-6
        const t = T(sp.row.transition);
        if (t.style === "follow_the_leader" && kind(sp) === "founding") {
            // R-10
            const e = ftlEntryRaw(t.id);
            const q = e.members.indexOf(sp.m);
            const p = clamp01((b - t.start) / (t.end - t.start));
            if (p <= 0) return origin(sp); // endpoints exact (8.10)
            if (p >= 1) return e.target.get(sp.m)!;
            return e.trail.at(
                e.startDist[q]! + (e.endDist[q]! - e.startDist[q]!) * p,
            );
        }
        const p = clamp01((b - sp.start) / (t.end - sp.start)); // R-5
        const o = origin(sp);
        if (t.style === "follow_the_leader") {
            // R-11
            return lerp(o, ftlEntryRaw(t.id).target.get(sp.m)!, p);
        }
        const dst = destinationsOf(t, db.shapes)[sp.row.slot]!;
        return t.style === "arc"
            ? arcPoint(o, dst, t.params?.bulge ?? 0, p) // R-8
            : lerp(o, dst, p); // R-7
    }

    function prevNonHold(sp: OracleSpan): OracleSpan | null {
        const s = spans(sp.m);
        for (let j = sp.k - 1; j >= 0; j--) if (s[j]!.row) return s[j]!;
        return null;
    }

    const eMemo = new Map<number, OracleFtlEntry>();
    function ftlEntryRaw(tid: number): OracleFtlEntry {
        let e = eMemo.get(tid);
        if (!e) {
            e = buildFtlEntry(tid);
            eMemo.set(tid, e);
        }
        return e;
    }

    function buildFtlEntry(tid: number): OracleFtlEntry {
        // R-9, R-12
        const t = T(tid);
        const founding = db.marchers
            .map((mm) =>
                spans(mm.id).find(
                    (s) =>
                        s.row &&
                        s.row.transition === tid &&
                        s.start === t.start,
                ),
            )
            .filter((s): s is OracleSpan => s !== undefined);
        let keyed: Array<[number, OracleSpan]> | null = null;
        let source: OrderSource = { kind: "slot", fallback: false };
        if (t.order === "inherit" && founding.length) {
            const prevs = founding.map(prevNonHold);
            const U = prevs[0]?.row!.transition;
            if (
                U !== undefined &&
                prevs.every((p) => p && p.row!.transition === U)
            ) {
                if (T(U).style === "follow_the_leader") {
                    if (prevs.every((p) => kind(p!) === "founding")) {
                        const eu = ftlEntryRaw(U);
                        keyed = founding.map((s) => [
                            eu.members.indexOf(s.m),
                            s,
                        ]);
                    }
                } else {
                    keyed = founding.map((s, i) => [prevs[i]!.row!.slot, s]);
                }
                if (keyed) source = { kind: "inherit", fromTransitionId: U };
            }
            if (!keyed) source = { kind: "slot", fallback: true };
        }
        if (!keyed) keyed = founding.map((s) => [s.row!.slot, s]);
        keyed.sort((a, b) => a[0] - b[0] || a[1].m - b[1].m);
        const members = keyed.map(([, s]) => s.m);
        const origins = keyed.map(([, s]) => origin(s));
        const shape = db.shapes[t.dest!];
        if (!shape) throw new Error(`transition ${tid} has no shape`);
        const path = destPath(shape);
        const wps = t.params?.waypoints ?? [];
        const trail = makeTrail(origins, wps, path);
        const n = t.slots;
        const m = members.length;
        const startDist = origins.map((_, q) => trail.cum[q]!);
        const endDist = origins.map(
            (_, q) =>
                trail.destOffset + paramT(path.closed, n - m + q, n) * path.L,
        );
        const pts = destinationsOf(t, db.shapes);
        const target = new Map<number, XY>(
            members.map((mm, q) => [mm, pts[n - m + q]!]),
        );
        db.assignments
            .filter((r) => r.transition === tid && !target.has(r.marcher))
            .sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)
            .forEach((r, k) => target.set(r.marcher, pts[n - m - 1 - k]!));
        return { members, source, trail, startDist, endDist, target };
    }

    const spanInfo = (sp: OracleSpan): SpanInfo => ({
        marcherId: sp.m,
        start: sp.start,
        end: sp.end,
        kind: kind(sp),
        assignmentId: sp.row?.id ?? null,
        transitionId: sp.row?.transition ?? null,
        slot: sp.row?.slot ?? null,
    });

    function diagnostics(): Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const t of Object.values(db.transitions)) {
            // D-VACANT: a slot with no assignment
            const taken = new Set(
                db.assignments
                    .filter((r) => r.transition === t.id)
                    .map((r) => r.slot),
            );
            for (let k = 0; k < t.slots; k++)
                if (!taken.has(k))
                    out.push({
                        code: "D-VACANT",
                        level: "warning",
                        transitionId: t.id,
                        marcherId: null,
                        slot: k,
                        message: `Slot ${k} of transition ${t.id} has no assignment`,
                    });
            if (t.style === "follow_the_leader") {
                const founders = db.marchers.filter((mm) =>
                    spans(mm.id).some(
                        (s) =>
                            s.row &&
                            s.row.transition === t.id &&
                            s.start === t.start,
                    ),
                );
                if (!founders.length)
                    out.push({
                        code: "D-FTL-EMPTY",
                        level: "warning",
                        transitionId: t.id,
                        marcherId: null,
                        slot: null,
                        message: `Follow-the-leader transition ${t.id} has no founding spans`,
                    });
                else {
                    const src = ftlEntryRaw(t.id).source;
                    if (src.kind === "slot" && src.fallback)
                        out.push({
                            code: "D-ORDER-FALLBACK",
                            level: "info",
                            transitionId: t.id,
                            marcherId: null,
                            slot: null,
                            message: `Transition ${t.id} could not inherit its order, so slot order was used`,
                        });
                }
            }
        }
        for (const mm of db.marchers)
            for (const sp of spans(mm.id)) {
                if (!sp.row) continue;
                const k = kind(sp);
                if (k !== "join" && k !== "resume") continue;
                const t = T(sp.row.transition);
                if (t.style === "follow_the_leader")
                    out.push({
                        code: "D-FTL-NONFOUNDING",
                        level: "warning",
                        transitionId: t.id,
                        marcherId: mm.id,
                        slot: sp.row.slot,
                        message: `Marcher ${mm.id} has a ${k} span in follow-the-leader transition ${t.id}`,
                    });
                else
                    out.push({
                        code: "D-REBASE",
                        level: "info",
                        transitionId: t.id,
                        marcherId: mm.id,
                        slot: sp.row.slot,
                        message: `Marcher ${mm.id} has a ${k} span in transition ${t.id}; its path was rebased`,
                    });
            }
        return out;
    }

    return {
        spans,
        kind,
        evalSpan,
        ftlEntryRaw,
        ftlEntry(tid) {
            const e = ftlEntryRaw(tid);
            return {
                transitionId: tid,
                members: [...e.members],
                orderSource: e.source,
                startDist: [...e.startDist],
                endDist: [...e.endDist],
                targets: [...e.target.entries()],
            };
        },
        positionAt(m, b) {
            const sp = spans(m).find((s) => s.start <= b && b < s.end);
            if (!sp) throw new Error(`no span for marcher ${m} at beat ${b}`);
            return evalSpan(sp, b);
        },
        spanInfos: (m) => spans(m).map(spanInfo),
        diagnostics,
    };
}
