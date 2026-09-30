// cspell:ignore NONFOUNDING
/**
 * Timeline motion model types (ADR 0001, spec section 10.1) plus the input show
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
}

export type DiagnosticCode =
    | "D-VACANT"
    | "D-REBASE"
    | "D-FTL-NONFOUNDING"
    | "D-FTL-EMPTY"
    | "D-ORDER-FALLBACK";

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
            | "slot_destinations";
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
}

export interface FtlTrail {
    cum: number[];
    destOffset: number;
    at(d: number): XY;
}
