/**
 * Timeline motion model (ADR 0001). Only the names fixed by the ADR (section
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
} from "./types";
export type { Oracle } from "./oracle";
export { createResolver } from "./resolver";
export {
    validateShapeGeometry,
    validatePathParams,
    validateDestinations,
    validateDestination,
    validateHome,
    normalizeStartAngle,
    COORD_BOUND,
    MAX_ABS_BULGE,
} from "./validate";
export type {
    ValidationResult,
    ValidationError,
    ValidationCode,
} from "./validate";

/** The uncached reference oracle (spec section 8), for tests and debug checks only. */
export function createTimelineOracleForTesting(host: TimelineSnapshot): Oracle {
    return createOracle(host);
}
