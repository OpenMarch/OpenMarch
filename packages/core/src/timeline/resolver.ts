// cspell:ignore lerp prevs NONFOUNDING dests
/**
 * The cached, incremental resolver (spec sections 9 and 10), ported from
 * `docs/timeline/ref/resolver.mjs` without the reference's `rules: 'v0.1'`
 * switch. It must agree with the oracle (`oracle.ts`, spec section 8).
 *
 * - The resolver keeps its own assignment row index (by id, by marcher and by
 *   transition), updated only from batch after-images (spec 10.2). Marchers,
 *   shapes and transitions are read by id from the host's post-commit mirror
 *   (ADR 0001 section 4), which the caller keeps equal to the committed state.
 * - Local caches (9.2 #1-4): `spans`, `spansByTransition`, `destinations`,
 *   `ftlGeometry`. Cascading caches (9.2 #5-6): `origin`, keyed by
 *   (marcher, span.start), and `ftlEntry`.
 * - Pull-compile (9.5) and the dirty walk (9.4, W-1 to W-4) use explicit work
 *   stacks, never recursion, because dependency depth equals chain length
 *   (9.3). A node seen again while its dependencies are unresolved is a cycle,
 *   which valid data can't produce, so it throws.
 * - All arithmetic and caches are Float64 (spec 10.1).
 */
import {
    arcPoint,
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
    ChangeBatch,
    Counters,
    DestPath,
    Diagnostic,
    Explanation,
    FtlEntryInfo,
    FtlTrail,
    InvalidationReport,
    OrderSource,
    Resolver,
    RowImage,
    SpanInfo,
    SpanKind,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "./types";

/** A flattened span tagged with its marcher and its index in that marcher's list. */
interface RSpan {
    row: AssignmentRow | null;
    start: Beat;
    end: Beat;
    m: number;
    k: number;
}

/** The internal FTL entry (R-9): the public {@link FtlEntryInfo} plus the trail and lookup maps. */
interface Entry {
    members: number[];
    source: OrderSource;
    trail: FtlTrail;
    /** marcher id -> q, so a founding evaluation finds q in O(1) (9.6) */
    qOf: Map<number, number>;
    startDist: number[];
    endDist: number[];
    target: Map<number, XY>;
}

/** A node of the dependency graph (9.3): an origin or an FTL entry. */
type Node = readonly ["o", RSpan] | readonly ["e", number];

/** One net change per (table, rowId) after coalescing (spec 10.2). */
interface NetChange {
    before: RowImage | null;
    after: RowImage | null;
}

/**
 * TEST ONLY. Hooks that read internal caches or corrupt them on purpose, so
 * tests can check P-8, I-C1 and the pull-compile guard. Production code must
 * never call them; they are not exported from the package.
 */
export interface ResolverTestHooks {
    /**
     * The cached local values of transition `tid` (spec 9.2 #3, #4), as the
     * same objects the resolver holds: a value that was not recomputed keeps
     * its identity.
     */
    localCaches(tid: number): {
        destinations: readonly XY[] | undefined;
        ftlGeometry: DestPath | undefined;
    };
    /** The number of cached cascading nodes (origins plus FTL entries). */
    cachedNodeCount(): number;
    /** Stores an origin under `(marcherId, start)` without pull-compile, so a test can plant a stale key. */
    putOrigin(marcherId: number, start: Beat, xy: XY): void;
    /** Drops one cached origin without the dirty walk, breaking I-C1 on purpose. */
    dropOrigin(marcherId: number, start: Beat): boolean;
    /**
     * Hides dependencies (by node key, such as `ftlEntry 2` or `origin 1|4`)
     * from pull-compile, to fake `depsOfOrigin`/`depsOfEntry` drifting from
     * what the compute functions read. `null` restores normal behavior.
     */
    hideDependencies(hide: ((nodeKey: string) => boolean) | null): void;
}

/** The resolver plus test and debug hooks that are not part of the public API. */
export interface CachedResolver extends Resolver {
    /** I-C1: the first violation found, described, or null when the caches are closed. */
    cacheClosureViolation(): string | null;
    /** TEST ONLY: see {@link ResolverTestHooks}. */
    testOnly: ResolverTestHooks;
}

const FTL = "follow_the_leader";

function num(img: RowImage, field: string, table: string): number {
    const v = img[field];
    if (typeof v !== "number")
        throw new Error(
            `${table} row image has no numeric '${field}': ${JSON.stringify(img)}`,
        );
    return v;
}

/** An assignment row from its change-log image (spec 5.1 `log_assignments_*`). */
function assignmentFromImage(img: RowImage): AssignmentRow {
    const t = "assignments";
    return {
        id: num(img, "id", t),
        marcher: num(img, "marcher", t),
        transition: num(img, "transition", t),
        slot: num(img, "slot", t),
        start: num(img, "start", t),
        end: num(img, "end", t),
        layer: num(img, "layer", t),
    };
}

/**
 * Spec 10.2: reduce a batch to one net change per (table, rowId), keeping the
 * first `before` and the last `after`. A row inserted and then deleted in the
 * same batch disappears. `slot_destinations` changes are logged under their
 * transition's id, so several slot rows share one rowId and a net null/null
 * pair can still mean the destinations changed: those are kept as a set of
 * transition ids instead.
 */
function coalesce(batch: ChangeBatch) {
    const byTable = {
        marchers: new Map<number, NetChange>(),
        shapes: new Map<number, NetChange>(),
        transitions: new Map<number, NetChange>(),
        assignments: new Map<number, NetChange>(),
    };
    const destinations = new Set<number>();
    for (const c of batch.changes) {
        if (c.table === "slot_destinations") {
            // Logged under the transition id; a row that moved between
            // transitions changes both.
            destinations.add(c.rowId);
            for (const img of [c.before, c.after]) {
                const t = img?.["transition"];
                if (typeof t === "number") destinations.add(t);
            }
            continue;
        }
        const net = byTable[c.table];
        const prev = net.get(c.rowId);
        if (prev) prev.after = c.after;
        else net.set(c.rowId, { before: c.before, after: c.after });
    }
    const live = (m: Map<number, NetChange>) => {
        for (const [id, c] of m) if (!c.before && !c.after) m.delete(id);
        return m;
    };
    return {
        marchers: live(byTable.marchers),
        shapes: live(byTable.shapes),
        transitions: live(byTable.transitions),
        assignments: live(byTable.assignments),
        destinations,
    };
}

const sameXY = (a: unknown, b: unknown): boolean =>
    Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

/**
 * Whether a transition update changes an input of its local caches (spec 9.4
 * table): `dest_shape_id`, `slot_count`, `path_style` or `path_params`. A
 * range or `order_mode` change recomputes nothing local. Individual
 * destinations arrive as `slot_destinations` changes instead.
 *
 * A `path_style` or `path_params` change recomputes both local caches, which is
 * more than the table requires (it names `ftlGeometry` only) but never wrong.
 * The params comparison is by `JSON.stringify`, so a key-order difference can
 * only cause an extra recompute, never a missed one.
 */
function localInputsChanged(before: RowImage, after: RowImage): boolean {
    return (
        before["dest"] !== after["dest"] ||
        before["slots"] !== after["slots"] ||
        before["style"] !== after["style"] ||
        JSON.stringify(before["params"] ?? null) !==
            JSON.stringify(after["params"] ?? null)
    );
}

/** Cold build of the cached resolver (ADR 0001 section 4). */
// The caches are closure state shared by every query, so they live together.
// eslint-disable-next-line max-lines-per-function
export function createCachedResolver(host: TimelineSnapshot): CachedResolver {
    const tMaybe = (id: number): TransitionRow | undefined =>
        host.transitions[id];
    const T = (id: number): TransitionRow => {
        const t = host.transitions[id];
        if (!t) throw new Error(`transition ${id} not found`);
        return t;
    };
    const isFtl = (t: TransitionRow | undefined): boolean =>
        !!t && t.style === FTL;

    // ---- row index (10.2): rows by id, by marcher, by transition
    const rows = new Map<number, AssignmentRow>();
    const byM = new Map<number, Set<number>>();
    const byTR = new Map<number, Set<number>>();
    const setOf = <K, V>(map: Map<K, Set<V>>, k: K): Set<V> => {
        let s = map.get(k);
        if (!s) map.set(k, (s = new Set()));
        return s;
    };
    const addRow = (r: AssignmentRow) => {
        rows.set(r.id, r);
        setOf(byM, r.marcher).add(r.id);
        setOf(byTR, r.transition).add(r.id);
    };
    const dropRow = (r: AssignmentRow) => {
        const cur = rows.get(r.id);
        rows.delete(r.id);
        // Use the indexed copy when there is one: it is what the indexes hold.
        const x = cur ?? r;
        byM.get(x.marcher)?.delete(x.id);
        byTR.get(x.transition)?.delete(x.id);
    };
    const rowsOf = (ids: Set<number> | undefined): AssignmentRow[] => {
        const out: AssignmentRow[] = [];
        if (ids) for (const id of ids) out.push(rows.get(id)!);
        return out;
    };
    const rowsOfMarcher = (m: number) => rowsOf(byM.get(m));
    const rowsOfTransition = (tid: number) => rowsOf(byTR.get(tid));
    for (const r of host.assignments) addRow({ ...r });

    const homes = new Map<number, XY>(host.marchers.map((m) => [m.id, m.home]));
    let idsCache: number[] | null = null;
    const marcherIds = (): readonly number[] =>
        (idsCache ??= [...homes.keys()].sort((a, b) => a - b));

    // transitions by destination shape (for shape edits), kept in step with the host
    const byDest = new Map<number, Set<number>>();
    const destOf = new Map<number, number | null>();
    const setDest = (tid: number, dest: number | null) => {
        const old = destOf.get(tid);
        if (old != null) byDest.get(old)?.delete(tid);
        if (dest == null) destOf.delete(tid);
        else {
            destOf.set(tid, dest);
            setOf(byDest, dest).add(tid);
        }
    };

    // ---- local caches (9.2 #1-4)
    const spans = new Map<number, RSpan[]>(); // marcher -> spans
    const byT = new Map<number, Set<RSpan>>(); // spansByTransition
    const dests = new Map<number, XY[]>(); // destinations
    const paths = new Map<number, DestPath>(); // ftlGeometry
    // ---- cascading caches (9.2 #5-6)
    const origins = new Map<string, XY>(); // `${m}|${start}` -> xy
    const entries = new Map<number, Entry>(); // FTL transition -> entry

    const C: Counters = {
        originsComputed: 0,
        ftlEntriesComputed: 0,
        destinationsComputed: 0,
        ftlGeometryComputed: 0,
        cacheHits: 0,
        cacheMisses: 0,
        dirtyVisits: 0,
        spanLookups: 0,
    };
    // per-notify tallies for the InvalidationReport
    let originsDirtied = 0;
    let ftlEntriesDirtied = 0;

    const key = (s: RSpan) => `${s.m}|${s.start}`;
    const idx = (tid: number) => setOf(byT, tid);
    const build = (m: number): RSpan[] =>
        flatten(rowsOfMarcher(m)).map((s, k) => ({
            row: s.row,
            start: s.start,
            end: s.end,
            m,
            k,
        }));
    const indexAdd = (list: RSpan[]) => {
        for (const s of list) if (s.row) idx(s.row.transition).add(s);
    };
    const indexRemove = (list: RSpan[]) => {
        for (const s of list) if (s.row) byT.get(s.row.transition)?.delete(s);
    };
    function computeLocal(
        tid: number,
        report?: InvalidationReport["localRecomputed"],
    ) {
        const t = T(tid);
        dests.set(tid, destinationsOf(t, host.shapes)); // shape or individual points (D-16)
        C.destinationsComputed++;
        report?.destinations.push(tid);
        if (isFtl(t)) {
            const shape = t.dest == null ? undefined : host.shapes[t.dest];
            if (!shape)
                throw new Error(
                    `follow-the-leader transition ${tid} has no shape (I-T5)`,
                );
            paths.set(tid, destPath(shape));
            C.ftlGeometryComputed++;
            report?.ftlGeometry.push(tid);
        } else paths.delete(tid);
    }

    for (const m of homes.keys()) {
        const l = build(m);
        spans.set(m, l);
        indexAdd(l);
    }
    for (const t of Object.values(host.transitions)) {
        setDest(t.id, t.dest);
        computeLocal(t.id);
    }

    // ---- resolution (pull)
    const spansOf = (m: number): RSpan[] => {
        const l = spans.get(m);
        if (!l) throw new Error(`marcher ${m} not found`);
        return l;
    };
    /** R-3 founding: the span starts at its transition's start. */
    const founding = (s: RSpan): boolean => {
        if (!s.row) return false;
        const t = tMaybe(s.row.transition);
        return !!t && s.start === t.start;
    };
    function kind(s: RSpan): SpanKind {
        if (!s.row) return "hold";
        if (founding(s)) return "founding";
        const id = s.row.id;
        return spansOf(s.m).find((x) => x.row && x.row.id === id) === s
            ? "join"
            : "resume";
    }
    /** The previous span with a winner; at most 2 steps back, since holds never abut. */
    function prevNonHold(s: RSpan): RSpan | null {
        const l = spansOf(s.m);
        for (let j = s.k - 1; j >= 0; j--) if (l[j]!.row) return l[j]!;
        return null;
    }

    const isCached = (n: Node): boolean =>
        n[0] === "o" ? origins.has(key(n[1])) : entries.has(n[1]);
    const nodeKey = (n: Node): string =>
        n[0] === "o" ? `origin ${key(n[1])}` : `ftlEntry ${n[1]}`;
    /** Exactly what computeOrigin reads. */
    function depsOfOrigin(s: RSpan): Node[] {
        if (s.k === 0) return [];
        const p = spansOf(s.m)[s.k - 1]!;
        if (p.row && isFtl(tMaybe(p.row.transition)))
            return [
                ["o", p],
                ["e", p.row.transition],
            ];
        return [["o", p]];
    }
    /** Exactly what computeEntry reads. */
    function depsOfEntry(tid: number): Node[] {
        const t = T(tid);
        const F = [...idx(tid)].filter(founding);
        const d: Node[] = F.map((s): Node => ["o", s]);
        if (t.order === "inherit" && F.length) {
            const prevs = F.map(prevNonHold);
            const U = prevs[0]?.row?.transition;
            if (
                U !== undefined &&
                prevs.every((p) => p && p.row!.transition === U) &&
                isFtl(tMaybe(U)) &&
                prevs.every((p) => founding(p!))
            )
                d.push(["e", U]);
        }
        return d;
    }
    /** TEST ONLY: dependencies hidden from pull-compile (see ResolverTestHooks). */
    let hiddenDeps: ((nodeKey: string) => boolean) | null = null;
    /** The node being computed, while computeOrigin or computeEntry runs. */
    let computing: Node | null = null;
    /**
     * Pull-compile (9.5) with an explicit work stack. Dependencies are pushed
     * above the node that needs them and computed first, so a node is computed
     * only once all its dependencies are cached (I-C1).
     */
    function ensure(node: Node) {
        if (computing)
            // A compute read a node its dependency list didn't name. Compiling
            // it here would recurse, with depth growing with the chain (9.3),
            // so fail loudly instead.
            throw new Error(
                `timeline resolver internal error: cache miss on ${nodeKey(node)} while computing ${nodeKey(computing)}; its dependency list is out of step with what it reads (spec 9.3)`,
            );
        const work: Node[] = [node];
        const expanding = new Set<string>();
        while (work.length) {
            const top = work[work.length - 1]!;
            if (isCached(top)) {
                work.pop();
                continue;
            }
            let deps =
                top[0] === "o" ? depsOfOrigin(top[1]) : depsOfEntry(top[1]);
            if (hiddenDeps) {
                const hide = hiddenDeps;
                deps = deps.filter((d) => !hide(nodeKey(d)));
            }
            const missing = deps.filter((d) => !isCached(d));
            if (missing.length) {
                // Back on top with dependencies still missing: one of them is
                // (transitively) waiting on this node, so the graph has a cycle.
                // Valid data can't produce one (9.3); only inconsistent derived
                // state can. Fail loudly rather than loop.
                const k = nodeKey(top);
                if (expanding.has(k))
                    throw new Error(
                        `timeline resolver: dependency cycle at ${k}; derived state is inconsistent (spec 9.3, I-C1)`,
                    );
                expanding.add(k);
                for (const d of missing) work.push(d);
                continue;
            }
            work.pop();
            computing = top;
            try {
                if (top[0] === "o") computeOrigin(top[1]);
                else computeEntry(top[1]);
            } finally {
                computing = null;
            }
        }
    }
    function computeOrigin(s: RSpan) {
        // R-4; every read below is a cache hit
        const v =
            s.k === 0
                ? homes.get(s.m)!
                : evalSpan(spansOf(s.m)[s.k - 1]!, s.start);
        origins.set(key(s), v);
        C.originsComputed++;
    }
    function origin(s: RSpan): XY {
        const k = key(s);
        const hit = origins.get(k);
        if (hit) {
            C.cacheHits++;
            return hit;
        }
        C.cacheMisses++;
        ensure(["o", s]);
        return origins.get(k)!;
    }
    function entry(tid: number): Entry {
        const hit = entries.get(tid);
        if (hit) {
            C.cacheHits++;
            return hit;
        }
        C.cacheMisses++;
        ensure(["e", tid]);
        return entries.get(tid)!;
    }
    /** Progress p (R-5) of span `s` at beat `b`; for a founding span this equals R-10's p. */
    const progress = (s: RSpan, t: TransitionRow, b: Beat) =>
        clamp01((b - s.start) / (t.end - s.start));

    function evalSpan(s: RSpan, b: Beat): XY {
        if (!s.row) return origin(s); // R-6
        const t = T(s.row.transition);
        if (t.style === FTL && founding(s)) {
            // R-10
            const e = entry(t.id);
            const q = e.qOf.get(s.m)!;
            const p = clamp01((b - t.start) / (t.end - t.start));
            if (p <= 0) return origin(s); // endpoints exact (8.10)
            if (p >= 1) return e.target.get(s.m)!;
            return e.trail.at(
                e.startDist[q]! + (e.endDist[q]! - e.startDist[q]!) * p,
            );
        }
        const p = progress(s, t, b); // R-5
        const o = origin(s);
        if (t.style === FTL) return lerp(o, entry(t.id).target.get(s.m)!, p); // R-11
        const dst = dests.get(t.id)![s.row.slot]!;
        return t.style === "arc"
            ? arcPoint(o, dst, t.params?.bulge ?? 0, p) // R-8
            : lerp(o, dst, p); // R-7
    }

    function computeEntry(tid: number) {
        // R-9, R-12
        const t = T(tid);
        const F = [...idx(tid)].filter(founding);
        let keyed: Array<[number, RSpan]> | null = null;
        let source: OrderSource = { kind: "slot", fallback: false };
        if (t.order === "inherit" && F.length) {
            const prevs = F.map(prevNonHold);
            const U = prevs[0]?.row?.transition;
            if (
                U !== undefined &&
                prevs.every((p) => p && p.row!.transition === U)
            ) {
                if (isFtl(tMaybe(U))) {
                    if (prevs.every((p) => founding(p!))) {
                        const eu = entry(U);
                        keyed = F.map((s) => [eu.qOf.get(s.m)!, s]);
                    }
                } else keyed = F.map((s, i) => [prevs[i]!.row!.slot, s]);
                if (keyed) source = { kind: "inherit", fromTransitionId: U };
            }
            if (!keyed) source = { kind: "slot", fallback: true };
        }
        if (!keyed) keyed = F.map((s) => [s.row!.slot, s]);
        keyed.sort((a, b) => a[0] - b[0] || a[1].m - b[1].m);
        const members = keyed.map(([, s]) => s.m);
        const os = keyed.map(([, s]) => origin(s));
        const path = paths.get(tid);
        if (!path)
            throw new Error(
                `follow-the-leader transition ${tid} has no destination path`,
            );
        const trail = makeTrail(os, t.params?.waypoints ?? [], path);
        const n = t.slots;
        const m = members.length;
        const pts = dests.get(tid)!;
        const target = new Map<number, XY>(
            members.map((mm, q) => [mm, pts[n - m + q]!]),
        );
        // non-members, from the per-transition row index: never a full scan (9.6)
        rowsOfTransition(tid)
            .filter((r) => !target.has(r.marcher))
            .sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)
            .forEach((r, k) => target.set(r.marcher, pts[n - m - 1 - k]!));
        entries.set(tid, {
            members,
            source,
            trail,
            qOf: new Map(members.map((mm, q) => [mm, q])),
            startDist: os.map((_, q) => trail.cum[q]!),
            endDist: os.map(
                (_, q) =>
                    trail.destOffset +
                    paramT(path.closed, n - m + q, n) * path.L,
            ),
            target,
        });
        C.ftlEntriesComputed++;
    }

    /** Binary search: the last span with start <= b (9.5). */
    function spanAt(m: number, b: Beat): RSpan {
        C.spanLookups++;
        const l = spansOf(m);
        let lo = 0;
        let hi = l.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (l[mid]!.start <= b) lo = mid;
            else hi = mid - 1;
        }
        return l[lo]!;
    }
    const positionAt = (m: number, b: Beat): XY => evalSpan(spanAt(m, b), b);

    // ---- invalidation (push)
    /** W-1, W-2 and W-4, with an explicit work stack. */
    function dirtyWalk(start: Node | null) {
        if (!start) return;
        const work: Node[] = [start];
        while (work.length) {
            const n = work.pop()!;
            if (n[0] === "o") {
                const x = n[1];
                if (!origins.delete(key(x))) continue; // W-4: already dirty
                C.dirtyVisits++;
                originsDirtied++;
                const nx = spans.get(x.m)?.[x.k + 1];
                if (nx) work.push(["o", nx]); // W-1
                if (x.row && isFtl(tMaybe(x.row.transition)) && founding(x))
                    work.push(["e", x.row.transition]);
            } else {
                const tid = n[1];
                if (!entries.delete(tid)) continue; // W-4
                C.dirtyVisits++;
                ftlEntriesDirtied++;
                for (const s of idx(tid)) {
                    const nx = spans.get(s.m)?.[s.k + 1];
                    if (nx) work.push(["o", nx]); // W-2
                }
            }
        }
    }
    const nextOf = (s: RSpan): Node | null => {
        const nx = spans.get(s.m)?.[s.k + 1];
        return nx ? ["o", nx] : null;
    };
    const dirtyEntry = (tid: number) => dirtyWalk(["e", tid]);
    /** W-3: next origins of every span in T, then T's entry (dirtied unconditionally). */
    function seed(tid: number) {
        for (const s of idx(tid)) dirtyWalk(nextOf(s));
        dirtyEntry(tid);
    }

    // Spec 9.4 steps 1 to 4 in one place, so their order stays visible.
    // eslint-disable-next-line max-lines-per-function
    function notify(batch: ChangeBatch): InvalidationReport {
        originsDirtied = 0;
        ftlEntriesDirtied = 0;
        const localRecomputed: InvalidationReport["localRecomputed"] = {
            destinations: [],
            ftlGeometry: [],
        };
        // 1. coalesce (10.2)
        const net = coalesce(batch);
        const rowChanges = [...net.assignments.values()].map((c) => ({
            before: c.before ? assignmentFromImage(c.before) : null,
            after: c.after ? assignmentFromImage(c.after) : null,
        }));

        // the row index, from the batch images only; homes from the host mirror
        for (const { before, after } of rowChanges) {
            if (before) dropRow(before);
            if (after) addRow(after);
        }
        if (net.marchers.size) {
            const hostHomes = new Map(host.marchers.map((m) => [m.id, m.home]));
            for (const m of net.marchers.keys()) {
                const h = hostHomes.get(m);
                if (h) homes.set(m, h);
                else homes.delete(m);
            }
            idsCache = null;
        }

        // 2. affected marchers and their earliest affected beat b0
        const affected = new Map<number, number>();
        const touch = (m: number, b: number) =>
            affected.set(m, Math.min(affected.get(m) ?? Infinity, b));
        const rowTs = new Map<number, Set<number>>(); // transitions in changed row images, per marcher
        for (const { before, after } of rowChanges)
            for (const r of [before, after])
                if (r) {
                    touch(r.marcher, r.start);
                    setOf(rowTs, r.marcher).add(r.transition);
                }
        for (const [tid, tc] of net.transitions) {
            if (!tc.before || !tc.after) continue;
            const b0 = num(tc.before, "start", "transitions");
            const b1 = num(tc.after, "start", "transitions");
            const e0 = num(tc.before, "end", "transitions");
            const e1 = num(tc.after, "end", "transitions");
            if (b0 !== b1 || e0 !== e1)
                for (const r of rowsOfTransition(tid))
                    touch(r.marcher, Math.min(b0, b1));
        }
        for (const [m, mc] of net.marchers)
            // A net change that leaves `home` as it was (a move and its
            // inverse in one batch) changes no span and no origin.
            if (
                !(
                    mc.before &&
                    mc.after &&
                    sameXY(mc.before["home"], mc.after["home"])
                )
            )
                touch(m, -Infinity);

        // 3. per affected marcher
        for (const [m, b0] of affected) {
            const old = spans.get(m) ?? [];
            for (const s of old) if (s.start >= b0) dirtyWalk(["o", s]); // 3.1 evict along the OLD structure
            const Ts = new Set<number>();
            for (const s of old) if (s.row) Ts.add(s.row.transition);
            for (const tid of rowTs.get(m) ?? []) Ts.add(tid);
            indexRemove(old);
            if (!homes.has(m))
                spans.delete(m); // 3.2 drop a deleted marcher
            else {
                const neu = build(m); // 3.2 rebuild
                spans.set(m, neu);
                indexAdd(neu); // 3.3 re-index every T in old ∪ new
                for (const s of neu) if (s.row) Ts.add(s.row.transition);
            }
            for (const tid of Ts)
                if (isFtl(tMaybe(tid)) || entries.has(tid)) dirtyEntry(tid); // 3.4
        }

        // 4. transition and shape changes: recompute local caches, then seed W-3 with the new index
        const seedTs = new Set<number>();
        for (const [tid, tc] of net.transitions) {
            if (!tc.after) {
                dests.delete(tid);
                paths.delete(tid);
                dirtyEntry(tid);
                entries.delete(tid);
                byT.delete(tid);
                byTR.delete(tid);
                setDest(tid, null);
                continue;
            }
            setDest(tid, T(tid).dest);
            if (!tc.before || localInputsChanged(tc.before, tc.after))
                computeLocal(tid, localRecomputed);
            seedTs.add(tid);
        }
        const recomputed = new Set(localRecomputed.destinations);
        for (const tid of net.destinations)
            if (!recomputed.has(tid) && host.transitions[tid]) {
                computeLocal(tid, localRecomputed); // individual points edited
                recomputed.add(tid);
                seedTs.add(tid);
            }
        for (const sid of net.shapes.keys())
            for (const tid of byDest.get(sid) ?? [])
                if (!recomputed.has(tid)) {
                    computeLocal(tid, localRecomputed);
                    recomputed.add(tid);
                    seedTs.add(tid);
                }
        for (const tid of seedTs) seed(tid);

        return {
            marchersRebuilt: [...affected.keys()].sort((a, b) => a - b),
            originsDirtied,
            ftlEntriesDirtied,
            localRecomputed,
        };
    }

    // ---- introspection
    const spanInfo = (s: RSpan, k: SpanKind = kind(s)): SpanInfo => ({
        marcherId: s.m,
        start: s.start,
        end: s.end,
        kind: k,
        assignmentId: s.row?.id ?? null,
        transitionId: s.row?.transition ?? null,
        slot: s.row?.slot ?? null,
    });
    const publicEntry = (tid: number, e: Entry): FtlEntryInfo => ({
        transitionId: tid,
        members: [...e.members],
        orderSource: { ...e.source },
        startDist: [...e.startDist],
        endDist: [...e.endDist],
        targets: [...e.target.entries()],
    });
    function ftlEntryOf(tid: number): Entry {
        const t = T(tid);
        if (t.style !== FTL)
            throw new Error(`transition ${tid} is not follow-the-leader`);
        return entry(tid);
    }

    /** Transition-level diagnostics (8.9): D-VACANT, D-FTL-EMPTY, D-ORDER-FALLBACK. */
    function transitionDiagnostics(t: TransitionRow, out: Diagnostic[]) {
        const taken = new Set(rowsOfTransition(t.id).map((r) => r.slot));
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
        if (t.style !== FTL) return;
        let hasFounder = false;
        for (const s of idx(t.id))
            if (founding(s)) {
                hasFounder = true;
                break;
            }
        if (!hasFounder)
            out.push({
                code: "D-FTL-EMPTY",
                level: "warning",
                transitionId: t.id,
                marcherId: null,
                slot: null,
                message: `Follow-the-leader transition ${t.id} has no founding spans`,
            });
        else {
            const src = entry(t.id).source;
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
    /** Span-level diagnostics (8.9): D-REBASE, D-FTL-NONFOUNDING. */
    function spanDiagnostic(s: RSpan, k: SpanKind): Diagnostic | null {
        if (!s.row || (k !== "join" && k !== "resume")) return null;
        const t = T(s.row.transition);
        return t.style === FTL
            ? {
                  code: "D-FTL-NONFOUNDING",
                  level: "warning",
                  transitionId: t.id,
                  marcherId: s.m,
                  slot: s.row.slot,
                  message: `Marcher ${s.m} has a ${k} span in follow-the-leader transition ${t.id}`,
              }
            : {
                  code: "D-REBASE",
                  level: "info",
                  transitionId: t.id,
                  marcherId: s.m,
                  slot: s.row.slot,
                  message: `Marcher ${s.m} has a ${k} span in transition ${t.id}; its path was rebased`,
              };
    }
    /** R-3 kinds for a whole marcher in one pass. */
    function kindsOf(m: number): SpanKind[] {
        const seen = new Set<number>();
        return spansOf(m).map((s) => {
            if (!s.row) return "hold";
            const first = !seen.has(s.row.id);
            seen.add(s.row.id);
            if (founding(s)) return "founding";
            return first ? "join" : "resume";
        });
    }
    function diagnostics(): Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const t of Object.values(host.transitions))
            transitionDiagnostics(t, out);
        for (const m of marcherIds()) {
            const ks = kindsOf(m);
            spansOf(m).forEach((s, i) => {
                const d = spanDiagnostic(s, ks[i]!);
                if (d) out.push(d);
            });
        }
        return out;
    }

    function explain(m: number, b: Beat): Explanation {
        const s = spanAt(m, b);
        const k = kind(s);
        const pos = spansOf(m);
        const diags: Diagnostic[] = [];
        let prog: number | null = null;
        let ftl: Explanation["ftl"];
        if (s.row) {
            const t = T(s.row.transition);
            prog = progress(s, t, b);
            transitionDiagnostics(t, diags);
            const d = spanDiagnostic(s, k);
            if (d) diags.push(d);
            if (t.style === FTL) {
                const e = entry(t.id);
                ftl = {
                    q: k === "founding" ? (e.qOf.get(m) ?? null) : null,
                    entry: publicEntry(t.id, e),
                };
            }
        }
        const out: Explanation = {
            span: spanInfo(s, k),
            origin: origin(s),
            originFrom: s.k === 0 ? "home" : spanInfo(pos[s.k - 1]!),
            progress: prog,
            diagnostics: diags,
        };
        if (ftl) out.ftl = ftl;
        return out;
    }

    /** I-C1: every cached node's dependencies are cached, and no cached key is stale. */
    function cacheClosureViolation(): string | null {
        const live = new Set<string>();
        for (const l of spans.values()) for (const s of l) live.add(key(s));
        for (const k of origins.keys())
            if (!live.has(k)) return `stale origin key ${k}`;
        for (const tid of entries.keys()) {
            const t = tMaybe(tid);
            if (!t) return `stale ftlEntry ${tid}: transition deleted`;
            if (t.style !== FTL)
                return `stale ftlEntry ${tid}: transition is not follow-the-leader`;
        }
        for (const l of spans.values())
            for (const s of l) {
                if (!origins.has(key(s))) continue;
                for (const d of depsOfOrigin(s))
                    if (!isCached(d))
                        return `origin ${key(s)} cached but ${nodeKey(d)} not`;
            }
        for (const tid of entries.keys())
            for (const d of depsOfEntry(tid))
                if (!isCached(d))
                    return `ftlEntry ${tid} cached but ${nodeKey(d)} not`;
        return null;
    }

    return {
        positionAt,
        positionsAt(b, out) {
            const ids = marcherIds();
            if (out.length < 2 * ids.length)
                throw new Error(
                    `positionsAt: output holds ${out.length} values, needs ${2 * ids.length}`,
                );
            for (let i = 0; i < ids.length; i++) {
                const p = positionAt(ids[i]!, b);
                out[2 * i] = p[0];
                out[2 * i + 1] = p[1];
            }
        },
        marcherIds,
        explain,
        ftlEntry: (tid) => publicEntry(tid, ftlEntryOf(tid)),
        notify,
        warmAll() {
            for (const l of spans.values()) for (const s of l) origin(s);
            for (const tid of paths.keys()) entry(tid);
        },
        counters: () => ({ ...C }),
        resetCounters() {
            for (const k of Object.keys(C) as Array<keyof Counters>) C[k] = 0;
        },
        diagnostics,
        checkCacheClosure: () => cacheClosureViolation() === null,
        cacheClosureViolation,
        spanInfos: (m) => {
            const ks = kindsOf(m);
            return spansOf(m).map((s, i) => spanInfo(s, ks[i]!));
        },
        testOnly: {
            localCaches: (tid) => ({
                destinations: dests.get(tid),
                ftlGeometry: paths.get(tid),
            }),
            cachedNodeCount: () => origins.size + entries.size,
            putOrigin(m, start, xy) {
                origins.set(`${m}|${start}`, xy);
            },
            dropOrigin: (m, start) => origins.delete(`${m}|${start}`),
            hideDependencies(hide) {
                hiddenDeps = hide;
            },
        },
    };
}

/** Cold build of the resolver (ADR 0001 section 4, spec 10.1). */
export function createResolver(host: TimelineSnapshot): Resolver {
    const r = createCachedResolver(host);
    // Only the public interface (spec 10.1 plus `spanInfos`, ADR 0001 section 4):
    // the internal caches, introspection and test hooks on the cached resolver
    // stay unreachable at runtime too.
    return {
        positionAt: r.positionAt,
        positionsAt: r.positionsAt,
        marcherIds: r.marcherIds,
        explain: r.explain,
        spanInfos: r.spanInfos,
        ftlEntry: r.ftlEntry,
        notify: r.notify,
        warmAll: r.warmAll,
        counters: r.counters,
        resetCounters: r.resetCounters,
        diagnostics: r.diagnostics,
        checkCacheClosure: r.checkCacheClosure,
    };
}
