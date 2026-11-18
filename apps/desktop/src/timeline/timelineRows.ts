import type {
    AssignmentRow,
    AdjustProfile,
    LaneRow,
    OrderMode,
    PathParams,
    PathStyle,
    RouteGeometry,
    RouteRow,
    RowImage,
    ShapeKind,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "@openmarch/core";
import { asc } from "drizzle-orm";
// The schema itself, not the renderer's `@/global/database/db`: the main process loads this module
// (through `sourceTimelinePositions`, for the previous-show import).
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection, DbTransaction } from "@/db-functions/types";

/**
 * The one place that maps timeline storage to the core model's types (ADR 0012 §4, spec §5.1 and
 * §10.2): database rows for the cold build, and change-log row images for batches.
 *
 * Tables carry a `timeline_` prefix and spec column names (`dest_shape_id`, `slot_index`, ...);
 * the core uses the reference data shape (`dest`, `slot`, ...). The change-log triggers
 * (`electron/database/migrations/triggers.ts`) already write images in the core's shape, so the
 * image readers only check and narrow them.
 */

type MarcherRow = Pick<
    typeof schema.marchers.$inferSelect,
    "id" | "home_x" | "home_y"
>;
type ShapeDbRow = typeof schema.timeline_shapes.$inferSelect;
type TransitionDbRow = typeof schema.timeline_transitions.$inferSelect;
type AssignmentDbRow = typeof schema.timeline_assignments.$inferSelect;
type SlotDestinationDbRow =
    typeof schema.timeline_slot_destinations.$inferSelect;
type RouteDbRow = typeof schema.timeline_routes.$inferSelect;
type LaneDbRow = typeof schema.timeline_lanes.$inferSelect;

/** A marcher as the resolver reads it. */
export interface TimelineMarcher {
    id: number;
    home: XY;
}

/** One individually placed destination (D-16), keyed by its transition and slot. */
export interface SlotDestination {
    transition: number;
    slot: number;
    xy: XY;
}

/**
 * Individually placed destinations, by transition id, then slot index. The resolver reads them as
 * a transition's `points`.
 */
export type SlotDestinationIndex = Map<number, Map<number, XY>>;

// ---------------------------------------------------------------------------
// Database rows
// ---------------------------------------------------------------------------

export const marcherFromRow = (row: MarcherRow): TimelineMarcher => ({
    id: row.id,
    home: [row.home_x, row.home_y],
});

export const shapeFromRow = (row: ShapeDbRow): ShapeRow =>
    ({
        kind: row.kind as ShapeKind,
        geometry: JSON.parse(row.geometry),
    }) as ShapeRow;

/** A transition without its individual destinations; see `withPoints`. */
export const transitionFromRow = (row: TransitionDbRow): TransitionRow => ({
    id: row.id,
    start: row.start_beat,
    end: row.end_beat,
    dest: row.dest_shape_id,
    slots: row.slot_count,
    style: row.path_style as PathStyle,
    order: row.order_mode as OrderMode,
    params:
        row.path_params == null
            ? null
            : (JSON.parse(row.path_params) as PathParams),
    // A follow-the-leader transition's trail route (R-9′, pathways step 4)
    route: row.route_id,
});

/** A route (spec v0.9 §5.2): its geometry, parsed. */
export const routeFromRow = (row: RouteDbRow): RouteRow => ({
    geometry: JSON.parse(row.geometry) as RouteGeometry,
});

/** A lane (spec v0.10 J.1): its slot, route and start offset (null for an own lane). */
export const laneFromRow = (row: LaneDbRow): LaneRow => ({
    transition: row.transition_id,
    slot: row.slot_index,
    route: row.route_id,
    offset:
        row.offset_x === null || row.offset_y === null
            ? null
            : [row.offset_x, row.offset_y],
    adjust:
        row.adjust === null ? null : (JSON.parse(row.adjust) as AdjustProfile),
});

export const assignmentFromRow = (row: AssignmentDbRow): AssignmentRow => ({
    id: row.id,
    marcher: row.marcher_id,
    transition: row.transition_id,
    slot: row.slot_index,
    start: row.start_beat,
    end: row.end_beat,
    layer: row.layer,
});

export const slotDestinationFromRow = (
    row: SlotDestinationDbRow,
): SlotDestination => ({
    transition: row.transition_id,
    slot: row.slot_index,
    xy: [row.x, row.y],
});

// ---------------------------------------------------------------------------
// Change-log row images (spec §10.2)
// ---------------------------------------------------------------------------

function field<T>(
    image: RowImage,
    key: string,
    table: string,
    check: (v: unknown) => boolean,
): T {
    const value = image[key];
    if (!check(value))
        throw new Error(
            `${table} row image has an invalid '${key}': ${JSON.stringify(image)}`,
        );
    return value as T;
}

const isNumber = (v: unknown) => typeof v === "number";
const isString = (v: unknown) => typeof v === "string";
const isXY = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number";
const isNullableNumber = (v: unknown) => v === null || typeof v === "number";

export const marcherFromImage = (image: RowImage): TimelineMarcher => {
    const home = field<[number, number]>(image, "home", "marchers", isXY);
    return {
        id: field(image, "id", "marchers", isNumber),
        home: [home[0], home[1]],
    };
};

export const shapeFromImage = (image: RowImage): ShapeRow =>
    ({
        kind: field<ShapeKind>(image, "kind", "shapes", isString),
        geometry: field(
            image,
            "geometry",
            "shapes",
            (v) => typeof v === "object" && v !== null,
        ),
    }) as ShapeRow;

/** A transition without its individual destinations; see `withPoints`. */
export const transitionFromImage = (image: RowImage): TransitionRow => {
    const t = "transitions";
    const params = image["params"] ?? null;
    return {
        id: field(image, "id", t, isNumber),
        start: field(image, "start", t, isNumber),
        end: field(image, "end", t, isNumber),
        dest: field(image, "dest", t, isNullableNumber),
        slots: field(image, "slots", t, isNumber),
        style: field<PathStyle>(image, "style", t, isString),
        order: field<OrderMode>(image, "order", t, isString),
        params: params as PathParams | null,
        route: typeof image["route"] === "number" ? image["route"] : null,
    };
};

/** A route from its change-log image `{id, geometry}` (spec v0.9 §10.2). */
export const routeFromImage = (image: RowImage): RouteRow => ({
    geometry: field<RouteGeometry>(
        image,
        "geometry",
        "routes",
        (v) => typeof v === "object" && v !== null,
    ),
});

/** A lane from its change-log image `{id, transition, slot, route, offset, adjust}` (spec v0.10). */
export const laneFromImage = (image: RowImage): LaneRow => {
    const t = "lanes";
    const offset = field<[number, number] | null>(
        image,
        "offset",
        t,
        (v) => v === null || isXY(v),
    );
    return {
        transition: field(image, "transition", t, isNumber),
        slot: field(image, "slot", t, isNumber),
        route: field(image, "route", t, isNumber),
        offset: offset === null ? null : [offset[0], offset[1]],
        adjust: (image.adjust ?? null) as AdjustProfile | null,
    };
};

export const slotDestinationFromImage = (image: RowImage): SlotDestination => {
    const t = "slot_destinations";
    return {
        transition: field(image, "transition", t, isNumber),
        slot: field(image, "slot", t, isNumber),
        xy: [field(image, "x", t, isNumber), field(image, "y", t, isNumber)],
    };
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function addSlotDestination(
    index: SlotDestinationIndex,
    destination: SlotDestination,
): void {
    let slots = index.get(destination.transition);
    if (!slots) index.set(destination.transition, (slots = new Map()));
    slots.set(destination.slot, destination.xy);
}

export function removeSlotDestination(
    index: SlotDestinationIndex,
    destination: Pick<SlotDestination, "transition" | "slot">,
): void {
    const slots = index.get(destination.transition);
    if (!slots) return;
    slots.delete(destination.slot);
    if (slots.size === 0) index.delete(destination.transition);
}

/**
 * The transition as the resolver reads it: a shapeless transition (`dest` null) carries one
 * point per slot, in slot order (D-16). A committed shapeless transition has every slot placed
 * (I-T6), so the points are dense.
 */
export function withPoints(
    transition: TransitionRow,
    destinations: SlotDestinationIndex,
): TransitionRow {
    const { points: _points, ...rest } = transition;
    if (transition.dest != null) return rest;
    const slots = destinations.get(transition.id);
    const points = slots
        ? [...slots.entries()].sort(([a], [b]) => a - b).map(([, xy]) => xy)
        : [];
    return { ...rest, points };
}

/** Everything a cold build reads: the resolver's snapshot and the destination index behind it. */
export interface TimelineTables {
    snapshot: TimelineSnapshot;
    destinations: SlotDestinationIndex;
}

/** The seven reads of a cold build, in the order a snapshot assembles them. */
function timelineTableQueries(db: DbConnection | DbTransaction) {
    return [
        db
            .select({
                id: schema.marchers.id,
                home_x: schema.marchers.home_x,
                home_y: schema.marchers.home_y,
            })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id)),
        db.select().from(schema.timeline_shapes),
        db.select().from(schema.timeline_transitions),
        db
            .select()
            .from(schema.timeline_assignments)
            .orderBy(asc(schema.timeline_assignments.id)),
        db.select().from(schema.timeline_slot_destinations),
        db.select().from(schema.timeline_routes),
        db.select().from(schema.timeline_lanes),
    ] as const;
}

type TimelineTableQueries = ReturnType<typeof timelineTableQueries>;
type RowsOf<Queries> = { -readonly [K in keyof Queries]: Awaited<Queries[K]> };
type TimelineTableRows = RowsOf<TimelineTableQueries>;

function assembleTimelineTables([
    marchers,
    shapes,
    transitions,
    assignments,
    slotDestinations,
    routes,
    lanes,
]: TimelineTableRows): TimelineTables {
    const destinations: SlotDestinationIndex = new Map();
    for (const row of slotDestinations)
        addSlotDestination(destinations, slotDestinationFromRow(row));

    const snapshot: TimelineSnapshot = {
        marchers: marchers.map(marcherFromRow),
        shapes: {},
        transitions: {},
        assignments: assignments.map(assignmentFromRow),
        routes: {},
        lanes: {},
    };
    for (const row of routes) snapshot.routes![row.id] = routeFromRow(row);
    for (const row of lanes) snapshot.lanes![row.id] = laneFromRow(row);
    for (const row of shapes) snapshot.shapes[row.id] = shapeFromRow(row);
    for (const row of transitions)
        snapshot.transitions[row.id] = withPoints(
            transitionFromRow(row),
            destinations,
        );
    return { snapshot, destinations };
}

/**
 * Reads the post-commit timeline state for a cold build (ADR 0012 §4), one statement at a time.
 * Call it where no timeline write can commit between its reads, such as inside the write lock or a
 * transaction. Anywhere else (another window, an export), use {@link readTimelineTablesSnapshot}.
 */
export async function readTimelineTables(
    db: DbConnection | DbTransaction,
): Promise<TimelineTables> {
    const [
        marchers,
        shapes,
        transitions,
        assignments,
        slotDestinations,
        routes,
        lanes,
    ] = timelineTableQueries(db);
    return assembleTimelineTables([
        await marchers,
        await shapes,
        await transitions,
        await assignments,
        await slotDestinations,
        await routes,
        await lanes,
    ]);
}

/** A connection whose `batch` runs its reads as one snapshot (the renderer's `db`). */
type BatchDb = DbConnection & {
    batch: (queries: TimelineTableQueries) => Promise<TimelineTableRows>;
};

/**
 * Reads the timeline tables as one committed state, from anywhere (#224): the five reads go to
 * main in one `db.batch`, which runs them in one synchronous call, and waits out any open
 * transaction, so neither a write committing between two reads nor a write still in progress
 * can tear the snapshot. Needs no lock, so the 3D View window (a separate renderer, outside the
 * editor's write lock) and the exports read through it.
 */
export async function readTimelineTablesSnapshot(
    db: DbConnection,
): Promise<TimelineTables> {
    if (typeof (db as Partial<BatchDb>).batch !== "function")
        throw new Error(
            "readTimelineTablesSnapshot needs a connection with batch reads",
        );
    const rows = await (db as BatchDb).batch(timelineTableQueries(db));
    return assembleTimelineTables(rows);
}
