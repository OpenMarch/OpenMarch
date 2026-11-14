/**
 * Timeline motion model (ADR 0012). Only the names fixed by the ADR (section
 * 4) are exported here; the geometry module and the resolver's test hooks stay
 * internal.
 */
import { createOracle } from "./oracle";
import type { Oracle } from "./oracle";
import type { TimelineSnapshot } from "./types";

export type {
    Beat,
    XY,
    SpanKind,
    SpanInfo,
    OrderSource,
    FtlEntryInfo,
    Explanation,
    Diagnostic,
    DiagnosticCode,
    RowImage,
    ChangeBatch,
    InvalidationReport,
    Counters,
    Resolver,
    TimelineSnapshot,
    ShapeKind,
    ShapeRow,
    ShapeGeometry,
    PathStyle,
    OrderMode,
    PathParams,
    TransitionRow,
    AssignmentRow,
    RoutePoint,
    RouteGeometry,
    RouteRow,
    LaneRow,
    AdjustAnchor,
    AdjustKey,
    AdjustProfile,
    FtlTrail,
} from "./types";
export type { Oracle } from "./oracle";
export { createResolver } from "./resolver";
export {
    routePath,
    routePoint,
    routePiecePoint,
    routePolyline,
    arcLength,
    arcPoint,
    ROUTE_ARC_SAMPLES,
    smoothHandles,
    cubicPoint,
    walkedPoint,
    groupSchedule,
    groupMemberWalk,
    groupPoint,
    makeAlongTrail,
    makeTrail,
    pointsPath,
    alongEnds,
    alongPoint,
    placed,
    adjustAt,
    anchorPlace,
    resolveAdjust,
    EPS_GEOM,
    S_MIN,
    ROUTE_CUBIC_SAMPLES,
} from "./geom";
export type {
    RoutePath,
    RoutePiece,
    RouteVertex,
    RouteEnds,
    RouteWalk,
    LaneWalk,
    GroupSchedule,
    GroupMemberWalk,
    GroupLeg,
    ResolvedAdjust,
} from "./geom";
export {
    adjustRefusal,
    anchorOfPlace,
    limitRouteEdit,
    placeAdjustKey,
    pruneZeroKeys,
    refitGeometry,
    rehomeProfile,
    removeAdjustKey,
    routeEndsChanged,
    S_MIN_WRITE,
    laneSamples,
    laneRigidPart,
} from "./adjust";
export type {
    AdjustRefusal,
    AdjustPlacement,
    RehomeResult,
    LaneSample,
} from "./adjust";
export {
    validateShapeGeometry,
    validatePathParams,
    validateDestinations,
    validateDestination,
    validateHome,
    validateRouteGeometry,
    validateLaneOffset,
    validateAdjustProfile,
    normalizeStartAngle,
    MAX_ROUTE_POINT_ID_LENGTH,
    MAX_ROUTE_TENSION,
    MAX_ROUTE_BULGE,
    isRouteBulge,
    smoothBesideArc,
    MAX_ROUTE_OFFSET,
    COORD_BOUND,
    MAX_ABS_BULGE,
} from "./validate";
export type {
    ValidationResult,
    ValidationError,
    ValidationCode,
} from "./validate";

export {
    createWalkedPaths,
    walkedPath,
    walkedPathOfMove,
    walkedPathPointAt,
    walkedPathToSvg,
    walkedPathToPolylines,
    WALKED_SAMPLE_TOLERANCE,
    WALKED_MIN_BULGE,
} from "./walkedPath";
export type {
    WalkedPath,
    WalkedSegment,
    WalkedLine,
    WalkedArc,
    WalkedCubic,
    WalkedPolyline,
    WalkedSvgOptions,
    WalkedPaths,
    WalkResolver,
} from "./walkedPath";

/** The uncached reference oracle (spec section 8), for tests and debug checks only. */
export function createTimelineOracleForTesting(host: TimelineSnapshot): Oracle {
    return createOracle(host);
}

export {
    trailCornerCounts,
    wayCorners,
    cornerCounts,
    isOnCount,
    roundCount,
    CORNER_MIN_TURN,
    CORNER_STAND_OUT,
    ON_COUNT_TOLERANCE,
} from "./trailCorners";
export type {
    WayWalk,
    WayCorner,
    CornerTurn,
    CornerCount,
    TrailEnds,
} from "./trailCorners";
