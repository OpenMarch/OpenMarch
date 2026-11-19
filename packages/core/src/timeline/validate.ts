/**
 * Write-path validators for the invariants SQLite cannot check (spec 5.2, 6):
 * I-S1 (shape geometry), I-T2 (path parameters), I-D2 (individual
 * destinations) and I-N2 (home coordinates). Pure functions over `unknown`
 * input, so they can guard JSON straight from an import or an IPC call.
 *
 * SQLite's `json_valid` accepts `1e999`, which parses to Infinity in JS, so
 * finiteness and the point bound are checked here (QA-DB-31).
 */
import type { PathStyle, ShapeKind } from "./types";

/** Every authored point lies in [-COORD_BOUND, COORD_BOUND]^2 (I-S1, I-T2, I-D2, I-N2). */
export const COORD_BOUND = 1e6;
/** Largest legal arc |bulge| (minor arcs only, D-15). */
export const MAX_ABS_BULGE = 0.5;
const TWO_PI = 2 * Math.PI;

/** `E-S1` shape, `E-P1` path params, `E-D2` destination, `E-N2` home, `E-R1` route (v0.9). */
export type ValidationCode = "E-S1" | "E-P1" | "E-D2" | "E-N2" | "E-R1";

/** Longest route point id (spec 5.2, I-R1). */
export const MAX_ROUTE_POINT_ID_LENGTH = 16;

/** Largest |dx| or |dy| of a lane's offset (spec J.1, v0.10): two points' difference. */
export const MAX_ROUTE_OFFSET = 2 * COORD_BOUND;

/** Roundest a smooth route point can be (spec 5.2, v0.9 step 2), as the Line's `MAX_TENSION`. */
export const MAX_ROUTE_TENSION = 2;
/** The largest bulge of an arc leg (R-14″, R-8's minor arc: a half circle) */
export const MAX_ROUTE_BULGE = 0.5;

/** Whether `k` is a stored leg bulge: a finite number with `0 < |k| <= 1/2` (R-14″). */
export const isRouteBulge = (k: unknown): k is number =>
    typeof k === "number" &&
    Number.isFinite(k) &&
    k !== 0 &&
    Math.abs(k) <= MAX_ROUTE_BULGE;

/**
 * R-14″: the first smooth point at either end of an arc leg, or -1. Leg `i` arrives at point `i`
 * (its `bulge`); the last leg arrives at `to` (`toBulge`). Such a point must be a corner.
 */
export function smoothBesideArc(
    points: readonly { tension?: number; bulge?: number }[],
    toBulge?: number,
): number {
    const arc = (leg: number) =>
        !!(leg < points.length ? points[leg]?.bulge : toBulge);
    return points.findIndex(
        (p, i) => (p.tension ?? 0) > 0 && (arc(i) || arc(i + 1)),
    );
}

export interface ValidationError {
    code: ValidationCode;
    /** Where in the input the problem is, such as `points[1][0]` or `radius` */
    path: string;
    message: string;
}

export type ValidationResult =
    | { ok: true }
    | { ok: false; errors: ValidationError[] };

/**
 * Normalize a circle start angle to [0, 2*PI): theta mod 2*PI, and 0 if
 * rounding produces exactly 2*PI (I-S1). Returns NaN for a non-finite input,
 * which the validators then reject.
 */
export function normalizeStartAngle(theta: number): number {
    if (!Number.isFinite(theta)) return NaN;
    let r = theta % TWO_PI;
    if (r < 0) r += TWO_PI;
    return r >= TWO_PI || r === 0 ? 0 : r; // r === 0 also folds -0 to +0
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Push = (path: string, message: string) => void;

function collector(code: ValidationCode) {
    const errors: ValidationError[] = [];
    const push: Push = (path, message) => errors.push({ code, path, message });
    const result = (): ValidationResult =>
        errors.length === 0 ? { ok: true } : { ok: false, errors };
    return { push, result };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inBound(n: number): boolean {
    return Math.abs(n) <= COORD_BOUND;
}

/** A finite JS number; reports and returns false otherwise. */
function finiteNumber(v: unknown, path: string, push: Push): v is number {
    if (typeof v !== "number") {
        push(path, `${path} must be a number`);
        return false;
    }
    if (!Number.isFinite(v)) {
        push(path, `${path} must be finite`);
        return false;
    }
    return true;
}

/** A finite number within the coordinate bound. */
function boundedNumber(v: unknown, path: string, push: Push): v is number {
    if (!finiteNumber(v, path, push)) return false;
    if (!inBound(v)) {
        push(path, `${path} must be within [-1e6, 1e6]`);
        return false;
    }
    return true;
}

/** An [x, y] pair of finite numbers, within the bound unless `bounded` is false. */
function pointOf(
    v: unknown,
    path: string,
    push: Push,
    bounded = true,
): [number, number] | null {
    if (!Array.isArray(v) || v.length !== 2) {
        push(path, `${path} must be an [x, y] pair`);
        return null;
    }
    const check = bounded ? boundedNumber : finiteNumber;
    const okX = check(v[0], `${path}[0]`, push);
    const okY = check(v[1], `${path}[1]`, push);
    return okX && okY ? [v[0] as number, v[1] as number] : null;
}

function noExtraKeys(
    obj: Record<string, unknown>,
    allowed: readonly string[],
    push: Push,
): void {
    for (const key of Object.keys(obj))
        if (!allowed.includes(key)) push(key, `unexpected field "${key}"`);
}

function pointList(
    v: unknown,
    path: string,
    push: Push,
): [number, number][] | null {
    if (!Array.isArray(v)) {
        push(path, `${path} must be an array of [x, y] points`);
        return null;
    }
    const out: [number, number][] = [];
    let ok = true;
    v.forEach((p, i) => {
        const pt = pointOf(p, `${path}[${i}]`, push);
        if (pt) out.push(pt);
        else ok = false;
    });
    return ok ? out : null;
}

// ---------------------------------------------------------------------------
// Shape geometry (I-S1)
// ---------------------------------------------------------------------------

/** Validate a shape's geometry JSON for its kind (I-S1). Errors are `E-S1`. */
export function validateShapeGeometry(
    kind: ShapeKind,
    geometry: unknown,
): ValidationResult {
    const { push, result } = collector("E-S1");
    if (!isRecord(geometry)) {
        push("", `geometry for a ${kind} must be an object`);
        return result();
    }
    switch (kind) {
        case "line":
        case "freehand": {
            noExtraKeys(geometry, ["points"], push);
            const pts = pointList(geometry.points, "points", push);
            if (!pts) break;
            if (kind === "line") {
                const [a, b] = pts;
                if (pts.length !== 2 || !a || !b)
                    push("points", "a line has exactly 2 points");
                else if (a[0] === b[0] && a[1] === b[1])
                    push("points", "line endpoints must be distinct");
            } else if (pts.length < 2) {
                push("points", "a freehand path has at least 2 points");
            } else {
                let len = 0;
                for (let i = 1; i < pts.length; i++) {
                    const p = pts[i]!;
                    const q = pts[i - 1]!;
                    len += Math.hypot(p[0] - q[0], p[1] - q[1]);
                }
                if (!(len > 0))
                    push("points", "a freehand path must have positive length");
            }
            break;
        }
        case "box": {
            noExtraKeys(geometry, ["origin", "width", "height"], push);
            const o = pointOf(geometry.origin, "origin", push);
            const w = finiteNumber(geometry.width, "width", push)
                ? geometry.width
                : null;
            const h = finiteNumber(geometry.height, "height", push)
                ? geometry.height
                : null;
            if (w !== null && !(w > 0)) push("width", "width must be > 0");
            if (h !== null && !(h > 0)) push("height", "height must be > 0");
            // The far corner is (x + w, y + h); origin is already bounded.
            if (o && w !== null && w > 0 && !inBound(o[0] + w))
                push("width", "box far corner x is outside [-1e6, 1e6]");
            if (o && h !== null && h > 0 && !inBound(o[1] + h))
                push("height", "box far corner y is outside [-1e6, 1e6]");
            break;
        }
        case "circle": {
            noExtraKeys(
                geometry,
                ["center", "radius", "start_angle", "clockwise"],
                push,
            );
            const c = pointOf(geometry.center, "center", push);
            const r = finiteNumber(geometry.radius, "radius", push)
                ? geometry.radius
                : null;
            if (r !== null && !(r > 0 && r <= COORD_BOUND))
                push("radius", "radius must be in (0, 1e6]");
            // The whole perimeter lies within center +/- radius on each axis.
            if (c && r !== null && r > 0 && r <= COORD_BOUND) {
                if (!inBound(c[0] - r) || !inBound(c[0] + r))
                    push("radius", "circle extends outside [-1e6, 1e6] in x");
                if (!inBound(c[1] - r) || !inBound(c[1] + r))
                    push("radius", "circle extends outside [-1e6, 1e6] in y");
            }
            if (finiteNumber(geometry.start_angle, "start_angle", push)) {
                if (
                    !(
                        geometry.start_angle >= 0 &&
                        geometry.start_angle < TWO_PI
                    )
                )
                    push("start_angle", "start_angle must be in [0, 2*PI)");
            }
            if (typeof geometry.clockwise !== "boolean")
                push("clockwise", "clockwise must be a boolean");
            break;
        }
        case "block": {
            noExtraKeys(geometry, ["origin", "rows", "cols", "spacing"], push);
            const o = pointOf(geometry.origin, "origin", push);
            const s = pointOf(geometry.spacing, "spacing", push, false);
            const dim = (key: "rows" | "cols"): number | null => {
                const v = geometry[key];
                if (!finiteNumber(v, key, push)) return null;
                if (!Number.isInteger(v) || v < 1) {
                    push(key, `${key} must be an integer >= 1`);
                    return null;
                }
                return v;
            };
            const rows = dim("rows");
            const cols = dim("cols");
            // The grid is affine in (row, col), so its extreme points are the
            // four corners; checking them bounds every one of rows*cols points.
            if (o && s && rows !== null && cols !== null) {
                const farX = o[0] + (cols - 1) * s[0];
                const farY = o[1] + (rows - 1) * s[1];
                if (!inBound(farX))
                    push("cols", "block grid extends outside [-1e6, 1e6] in x");
                if (!inBound(farY))
                    push("rows", "block grid extends outside [-1e6, 1e6] in y");
            }
            break;
        }
        default:
            push("", `unknown shape kind "${String(kind)}"`);
    }
    return result();
}

// ---------------------------------------------------------------------------
// Path parameters (I-T2)
// ---------------------------------------------------------------------------

/** Validate a transition's `path_params` for its style (I-T2). Errors are `E-P1`. */
export function validatePathParams(
    style: PathStyle,
    params: unknown,
): ValidationResult {
    const { push, result } = collector("E-P1");
    switch (style) {
        case "direct":
            if (params !== null) push("", "direct path_params must be null");
            break;
        case "arc": {
            if (!isRecord(params)) {
                push("", "arc path_params must be an object {bulge}");
                break;
            }
            noExtraKeys(params, ["bulge"], push);
            if (finiteNumber(params.bulge, "bulge", push)) {
                if (Math.abs(params.bulge) > MAX_ABS_BULGE)
                    push("bulge", "|bulge| must be <= 1/2");
            }
            break;
        }
        case "follow_the_leader": {
            if (!isRecord(params)) {
                push("", "follow_the_leader path_params must be {waypoints}");
                break;
            }
            // `reverse` (R-12′, pathways step 4): true, or absent
            // `ends` (R-13″, pathways step 4b): "along", or absent
            noExtraKeys(params, ["waypoints", "reverse", "ends"], push);
            pointList(params.waypoints, "waypoints", push);
            if (params.reverse !== undefined && params.reverse !== true)
                push("reverse", "reverse must be true or absent");
            if (params.ends !== undefined && params.ends !== "along")
                push("ends", 'ends must be "along" or absent');
            break;
        }
        default:
            push("", `unknown path style "${String(style)}"`);
    }
    return result();
}

// ---------------------------------------------------------------------------
// Destinations (I-D2) and homes (I-N2)
// ---------------------------------------------------------------------------

/**
 * Validate the individual destinations of a shapeless transition: exactly one
 * finite in-bounds point per slot (I-D2, D-16). Errors are `E-D2`.
 */
export function validateDestinations(
    points: unknown,
    slotCount: number,
): ValidationResult {
    const { push, result } = collector("E-D2");
    if (!Number.isInteger(slotCount) || slotCount < 1)
        push("slotCount", "slotCount must be an integer >= 1");
    if (!Array.isArray(points)) {
        push("", "destinations must be an array of [x, y] points");
        return result();
    }
    if (Number.isInteger(slotCount) && points.length !== slotCount)
        push("", `expected ${slotCount} destinations, got ${points.length}`);
    points.forEach((p, i) => pointOf(p, `[${i}]`, push));
    return result();
}

/** Validate one individual destination point (I-D2). Errors are `E-D2`. */
export function validateDestination(point: unknown): ValidationResult {
    const { push, result } = collector("E-D2");
    pointOf(point, "point", push);
    return result();
}

/** Validate a marcher home coordinate: finite, |x|, |y| <= 1e6 (I-N2). Errors are `E-N2`. */
export function validateHome(home: unknown): ValidationResult {
    const { push, result } = collector("E-N2");
    pointOf(home, "home", push);
    return result();
}

/**
 * Validate a lane's start offset (spec v0.10 J.1): null for an own lane, or `[dx, dy]`, each
 * finite and within `[-2e6, 2e6]`. Errors are `E-P1`.
 */
export function validateLaneOffset(offset: unknown): ValidationResult {
    const { push, result } = collector("E-P1");
    if (offset === null) return result();
    if (!Array.isArray(offset) || offset.length !== 2) {
        push("offset", "offset must be an [dx, dy] pair");
        return result();
    }
    offset.forEach((n, i) => {
        if (
            finiteNumber(n, `offset[${i}]`, push) &&
            Math.abs(n) > MAX_ROUTE_OFFSET
        )
            push(`offset[${i}]`, `offset[${i}] must be within [-2e6, 2e6]`);
    });
    return result();
}

// ---------------------------------------------------------------------------
// Adjust profiles (spec J.2, pathways step 3b)
// ---------------------------------------------------------------------------

/**
 * Validate an Adjust profile's shape (spec J.2, part of I-J3): version 1, one key or more, each
 * with point-id or end anchors, `f` in `[0, 1]` and a bounded finite `d`. Spacing and place (I-J4)
 * need the route: `adjustRefusal` in `adjust.ts` checks them.
 */
export function validateAdjustProfile(profile: unknown): ValidationResult {
    const { push, result } = collector("E-P1");
    if (typeof profile !== "object" || profile === null) {
        push("", "an Adjust profile must be an object {v, keys}");
        return result();
    }
    const { v, keys } = profile as { v?: unknown; keys?: unknown };
    if (v !== 1) push("v", "an Adjust profile's version must be 1");
    if (!Array.isArray(keys) || keys.length === 0) {
        push("keys", "an Adjust profile needs at least one key");
        return result();
    }
    keys.forEach((entry: unknown, i: number) => {
        const path = `keys[${i}]`;
        if (typeof entry !== "object" || entry === null) {
            push(path, "an Adjust key must be an object {a, b, f, d}");
            return;
        }
        const key = entry as Record<string, unknown>;
        for (const end of ["a", "b"] as const) {
            const id = key[end];
            if (
                typeof id !== "string" ||
                id.length === 0 ||
                id.length > MAX_ROUTE_POINT_ID_LENGTH
            )
                push(`${path}.${end}`, "an anchor names a point id or an end");
        }
        const f = key.f;
        if (typeof f !== "number" || !Number.isFinite(f) || f < 0 || f > 1)
            push(`${path}.f`, "an anchor's f must be between 0 and 1");
        const d = key.d;
        if (
            !Array.isArray(d) ||
            d.length !== 2 ||
            d.some(
                (n) =>
                    typeof n !== "number" ||
                    !Number.isFinite(n) ||
                    Math.abs(n) > MAX_ROUTE_OFFSET,
            )
        )
            push(`${path}.d`, "a key's d must be two bounded finite numbers");
    });
    return result();
}

// ---------------------------------------------------------------------------
// Routes (I-R1, v0.9 step 1)
// ---------------------------------------------------------------------------

/**
 * Validate a route's `geometry` (spec 5.2, I-R1): version 1, `from`, `to` and every point
 * finite and within the bound, point ids non-empty strings of at most 16 characters and unique,
 * and every point `{id, at}` with an optional `tension` in (0, 2] (a smooth point, step 2) and
 * an optional `bulge` with `0 < |bulge| <= 1/2` (its arriving leg is an arc, step 10a), and an
 * optional `toBulge` likewise for the last leg; a point beside an arc leg is a corner (R-14″).
 * Errors are `E-R1`.
 */
export function validateRouteGeometry(geometry: unknown): ValidationResult {
    const { push, result } = collector("E-R1");
    if (!isRecord(geometry)) {
        push("", "route geometry must be an object {v, from, to, points}");
        return result();
    }
    noExtraKeys(geometry, ["v", "from", "to", "points", "toBulge"], push);
    const bulgeMessage = (where: string) =>
        `${where} must be a number other than 0, at most ${MAX_ROUTE_BULGE} either way`;
    if ("toBulge" in geometry && !isRouteBulge(geometry.toBulge))
        push("toBulge", bulgeMessage("toBulge"));
    if (geometry.v !== 1) push("v", "route geometry version must be 1");
    pointOf(geometry.from, "from", push);
    pointOf(geometry.to, "to", push);
    if (!Array.isArray(geometry.points)) {
        push("points", "points must be an array");
        return result();
    }
    const ids = new Set<string>();
    geometry.points.forEach((pt: unknown, i: number) => {
        const path = `points[${i}]`;
        if (!isRecord(pt)) {
            push(path, `${path} must be an object {id, at}`);
            return;
        }
        for (const key of Object.keys(pt))
            if (
                key !== "id" &&
                key !== "at" &&
                key !== "tension" &&
                key !== "bulge"
            )
                push(`${path}.${key}`, `unexpected field "${key}"`);
        if (
            "tension" in pt &&
            !(
                typeof pt.tension === "number" &&
                Number.isFinite(pt.tension) &&
                pt.tension > 0 &&
                pt.tension <= MAX_ROUTE_TENSION
            )
        )
            push(
                `${path}.tension`,
                `${path}.tension must be a number above 0 and at most ${MAX_ROUTE_TENSION}`,
            );
        if ("bulge" in pt && !isRouteBulge(pt.bulge))
            push(`${path}.bulge`, bulgeMessage(`${path}.bulge`));
        const id = pt.id;
        if (
            typeof id !== "string" ||
            id.length === 0 ||
            id.length > MAX_ROUTE_POINT_ID_LENGTH
        )
            push(
                `${path}.id`,
                `${path}.id must be a string of 1 to 16 characters`,
            );
        else if (ids.has(id))
            push(`${path}.id`, `point id "${id}" is repeated`);
        else ids.add(id);
        pointOf(pt.at, `${path}.at`, push);
    });
    // R-14″: a point at either end of an arc leg is a corner
    const points = geometry.points.filter(isRecord) as {
        tension?: number;
        bulge?: number;
    }[];
    if (points.length === geometry.points.length) {
        const i = smoothBesideArc(
            points,
            typeof geometry.toBulge === "number" ? geometry.toBulge : undefined,
        );
        if (i >= 0)
            push(
                `points[${i}].tension`,
                `points[${i}] is beside an arc leg, so it must be a corner`,
            );
    }
    return result();
}
