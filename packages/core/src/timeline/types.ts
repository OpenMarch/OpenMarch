// cspell:ignore NONFOUNDING
/**
 * Timeline motion model types (ADR 0012, spec section 10.1) plus the input show
 * shape used by the reference suite (`docs/timeline/ref/README.md`).
 *
 * All resolver arithmetic uses Float64 (spec section 10.1).
 */

export type Beat = number;
export type XY = readonly [number, number];

export type SpanKind = "hold" | "founding" | "join" | "resume";

export interface SpanInfo {
    marcherId: number;
    /** -Infinity for the leading hold */
    start: Beat;
    /** +Infinity for the trailing hold */
    end: Beat;
    kind: SpanKind;
    assignmentId: number | null;
    /**
     * The `end_beat` of the span's assignment, null for holds. It equals `end` when the span is
     * the one that arrives where its row ends; it's later when a higher layer cuts the row short
     * here (R-2), whether or not the row resumes after.
     */
    assignmentEnd: Beat | null;
    transitionId: number | null;
    slot: number | null;
}

export type OrderSource =
    | { kind: "inherit"; fromTransitionId: number }
    /** `fallback` true means D-ORDER-FALLBACK was raised */
    | { kind: "slot"; fallback: boolean };

export interface FtlEntryInfo {
    transitionId: number;
    /** Marcher ids, q = 0 (tail) to m-1 (leader) */
    members: number[];
    orderSource: OrderSource;
    startDist: number[];
    endDist: number[];
    targets: Array<[marcherId: number, xy: XY]>;
    /**
     * R-13″ (pathways step 4b): set when the members' ends are along the way. `endDist[q]` is
     * then `e_q`; the member walks the way to it, then straight from `turn[q]` (`P(e_q)`) to its
     * target over the last `straight[q]` of its walk.
     */
    along?: { turn: XY[]; straight: number[] };
}

export type DiagnosticCode =
    | "D-VACANT"
    | "D-REBASE"
    | "D-FTL-NONFOUNDING"
    | "D-FTL-EMPTY"
    | "D-ORDER-FALLBACK"
    | "D-ANCHOR"
    | "D-ADJUST-CLAMP"
    | "D-ADJUST-TIE";

export interface Diagnostic {
    code: DiagnosticCode;
    level: "info" | "warning";
    transitionId: number;
    marcherId: number | null;
    slot: number | null;
    message: string;
}

export interface Explanation {
    span: SpanInfo;
    origin: XY;
    originFrom: SpanInfo | "home";
    /** null for holds */
    progress: number | null;
    ftl?: { q: number | null; entry: FtlEntryInfo };
    diagnostics: Diagnostic[];
}

/** A JSON image of one changed row, as written to the change log (spec 10.2). */
export type RowImage = Record<string, unknown>;

/** One committed transaction, as read from the change log (spec 10.2). */
export interface ChangeBatch {
    changes: Array<{
        table:
            | "marchers"
            | "shapes"
            | "transitions"
            | "assignments"
            | "slot_destinations"
            | "routes"
            | "lanes";
        /** For `slot_destinations`, the transition id */
        rowId: number;
        /** null on insert */
        before: RowImage | null;
        /** null on delete */
        after: RowImage | null;
    }>;
}

export interface InvalidationReport {
    marchersRebuilt: number[];
    originsDirtied: number;
    ftlEntriesDirtied: number;
    localRecomputed: { destinations: number[]; ftlGeometry: number[] };
}

export interface Counters {
    originsComputed: number;
    ftlEntriesComputed: number;
    destinationsComputed: number;
    ftlGeometryComputed: number;
    cacheHits: number;
    cacheMisses: number;
    /** Number of nodes the walk touched */
    dirtyVisits: number;
    spanLookups: number;
}

export interface Resolver {
    positionAt(marcherId: number, beat: Beat): XY;
    /** Marcher order is `marcherIds()` */
    positionsAt(beat: Beat, out: Float64Array): void;
    marcherIds(): readonly number[];
    explain(marcherId: number, beat: Beat): Explanation;
    /**
     * Every span of a marcher (R-2) with its kind (R-3), sorted from the leading hold to the
     * trailing one. Not in spec §10.1: added for the timeline UI (ADR 0012 §4 amendment,
     * 2026-09-30). Reads the cached spans only; computes no positions.
     */
    spanInfos(marcherId: number): SpanInfo[];
    ftlEntry(transitionId: number): FtlEntryInfo;
    /** After COMMIT; applied atomically (spec 10.2) */
    notify(batch: ChangeBatch): InvalidationReport;
    /** Compile every node */
    warmAll(): void;
    counters(): Counters;
    resetCounters(): void;
    diagnostics(): Diagnostic[];
    /** I-C1; debug builds only */
    checkCacheClosure(): boolean;
}

// ---------------------------------------------------------------------------
// Input show shape (ref/README.md)
// ---------------------------------------------------------------------------

export type ShapeKind = "line" | "freehand" | "box" | "circle" | "block";
/** Shape kinds that have a parameterized path (everything except `block`). */
export type PathShapeKind = Exclude<ShapeKind, "block">;
/**
 * A transition's path style. v0.10 (ADR 0017) retires `route`: a slot walks a route through a
 * lane (`LaneRow`), whatever its transition's style.
 */
export type PathStyle = "direct" | "arc" | "follow_the_leader";
export type OrderMode = "inherit" | "slot";

export interface PolylineGeometry {
    points: XY[];
}
export interface BoxGeometry {
    origin: XY;
    width: number;
    height: number;
}
export interface CircleGeometry {
    center: XY;
    radius: number;
    /** Radians, normalized to [0, 2*PI) */
    start_angle: number;
    clockwise: boolean;
}
export interface BlockGeometry {
    origin: XY;
    rows: number;
    cols: number;
    spacing: XY;
}

export type ShapeRow =
    | { kind: "line"; geometry: PolylineGeometry }
    | { kind: "freehand"; geometry: PolylineGeometry }
    | { kind: "box"; geometry: BoxGeometry }
    | { kind: "circle"; geometry: CircleGeometry }
    | { kind: "block"; geometry: BlockGeometry };

export type ShapeGeometry = ShapeRow["geometry"];

export interface PathParams {
    /** Signed sagitta / chord, |bulge| <= 1/2 (arc style) */
    bulge?: number;
    /** Extra trail vertices (follow_the_leader style) */
    waypoints?: XY[];
    /**
     * Follow-the-leader only (R-12′, pathways step 4): the trail order is reversed, so the other
     * end of the line leads, and the destination is entered from its far end. Absent for R-12's
     * order.
     */
    reverse?: boolean;
    /**
     * Follow-the-leader with no shape only (R-13″, pathways step 4b): `"along"` ends each member
     * on the way (line-up, then the trail's drawn part) at its spot's projection, then straight
     * to the spot. Absent for R-13′.
     */
    ends?: "along";
}

/** One inner point of a route (spec 5.2, v0.9): a corner, or smooth with a tension (step 2). */
export interface RoutePoint {
    /** Non-empty, at most 16 characters, unique within its route and never reused in it */
    id: string;
    at: XY;
    /** Roundness in (0, 2], 1 the plain curve (step 2); absent for a corner */
    tension?: number;
    /**
     * The leg arriving at this point is R-8's arc with this signed sagitta over chord,
     * `0 < |bulge| <= 1/2` (R-14″, pathways step 10a); absent for a straight or curved leg
     */
    bulge?: number;
}

/** A route's `geometry` (spec 5.2, I-R1). `from` and `to` are R-14's tangent neighbors F and G. */
export interface RouteGeometry {
    v: 1;
    /** Where the marcher stood at the transition's start when the route was drawn */
    from: XY;
    /** Its destination when the route was drawn */
    to: XY;
    /** Inner points in walking order; may be empty */
    points: RoutePoint[];
    /** The last leg's bulge, the leg arriving at `to` (R-14″, step 10a); absent for none */
    toBulge?: number;
}

/** A row of the routes table (spec 5.1, D-19). */
export interface RouteRow {
    geometry: RouteGeometry;
}

export interface TransitionRow {
    id: number;
    start: Beat;
    end: Beat;
    /** Shape id, or null for individually placed destinations in `points` */
    dest: number | null;
    /** One point per slot, when `dest` is null (D-16) */
    points?: XY[];
    slots: number;
    style: PathStyle;
    order: OrderMode;
    params: PathParams | null;
    /**
     * A follow-the-leader transition's trail route (I-R2′, R-9′, pathways step 4): the drawn
     * part of its trail. Absent or null for none; not read on any other style.
     */
    route?: number | null;
}

/**
 * A lane (spec v0.10 D-20, Appendix J.1): slot `slot` of transition `transition` walks route
 * `route`. Whoever occupies the slot at a beat walks it (D-22).
 */
export interface LaneRow {
    transition: number;
    slot: number;
    route: number;
    /**
     * The start offset `o_s` from the route's `from`: a group path's lane. null for an own lane,
     * one marcher's own path walked alone (I-LN4).
     */
    offset: XY | null;
    /** This spot's own Adjust profile (spec J.2, pathways step 3b); absent or null for none */
    adjust?: AdjustProfile | null;
}

/**
 * A place on a route (spec J.2): the fraction `f` of the way from point `a` (a point id, or
 * `"from"`) to point `b` (a point id, or `"to"`). Stable when the move is resized or reshaped (D-21).
 */
export interface AdjustAnchor {
    a: string;
    b: string;
    f: number;
}

/** One key of an Adjust profile: the displacement `d` at its place. */
export interface AdjustKey extends AdjustAnchor {
    d: XY;
}

/** An Adjust profile (spec J.2): linear between its keys, constant beyond them. */
export interface AdjustProfile {
    v: 1;
    keys: AdjustKey[];
    /** UI badge only (AP-H1): the last edit of the route re-homed or dropped a key here */
    rehomed?: true;
}

export interface AssignmentRow {
    id: number;
    marcher: number;
    transition: number;
    slot: number;
    start: Beat;
    end: Beat;
    layer: number;
}

/** The post-commit state the resolver reads. */
export interface TimelineSnapshot {
    marchers: Array<{ id: number; home: XY }>;
    shapes: Record<number, ShapeRow>;
    transitions: Record<number, TransitionRow>;
    assignments: AssignmentRow[];
    /** Routes by id (v0.9, D-19); absent when the show has none */
    routes?: Record<number, RouteRow>;
    /** Lanes by id (v0.10, D-20); absent when the show has none */
    lanes?: Record<number, LaneRow>;
}

/** One piece of a marcher's flattened timeline (R-2). */
export interface FlatSpan<
    R extends { id: number; layer: number } = AssignmentRow,
> {
    row: R | null;
    start: Beat;
    end: Beat;
}

/** The exact destination path of a path-kind shape (R-13). */
export interface DestPath {
    closed: boolean;
    /** Total length */
    L: number;
    /** Point at arc length s, clamped to [0, L] */
    at(s: number): XY;
    /**
     * R-13′ (pathways step 4): for a follow-the-leader transition with no shape, the arc length
     * of each slot's destination along the line through them. Absent for a shape, whose samples
     * are at `paramT`.
     */
    stops?: number[];
}

export interface FtlTrail {
    /** Cumulative length at each vertex of the trail's polyline part; `cum[q]` is `startDist[q]` */
    cum: number[];
    destOffset: number;
    at(d: number): XY;
    /**
     * R-9′ (pathways step 4): the drawn part, when the transition has a trail route with a kept
     * point. It starts at trail distance `start` (the leader's origin) and runs to `destOffset`.
     */
    drawn?: { start: number; path: import("./geom").RoutePath };
    /**
     * R-13″ (pathways step 4b): on a way with its ends along it, the line-up's vertices (the
     * member origins, tail first). `destOffset` is then the way's whole length.
     */
    lineUp?: XY[];
}
