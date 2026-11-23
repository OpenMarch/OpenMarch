/**
 * Adjust's rules, pure (pathways step 3b; spec v0.10 AP-H1, AP-R11, I-J4 and decisions A to C in
 * Appendix J.8): where a lane drag puts its keys, how a route edit re-homes them, how Re-fit
 * stretches a route, and how far a point drag may go. The write path and the live preview on the
 * field call the same functions, so what is shown while dragging is what is saved.
 *
 * Evaluation lives in `geom.ts` (R-14′ item 6), which the resolver and the oracle share.
 */
import {
    adjustAt,
    anchorPlace,
    clamp01,
    dist,
    EPS_GEOM,
    groupSchedule,
    placed,
    routePiecePoint,
    ROUTE_ARC_SAMPLES,
    ROUTE_CUBIC_SAMPLES,
    S_MIN,
    type GroupMemberWalk,
    type GroupSchedule,
    type RouteWalk,
} from "./geom";
import type {
    AdjustAnchor,
    AdjustKey,
    AdjustProfile,
    RouteGeometry,
    RoutePoint,
    XY,
} from "./types";

/**
 * The spacing the app writes: a hair over `s_min`, so rounding in `f` can't take two generated
 * keys under the commit view's exact `s_min` (E-J5).
 */
export const S_MIN_WRITE = S_MIN + 1e-6;

/** Why a profile or a lane drag is refused (AP-R11); each has its own message in the app. */
export type AdjustRefusal = "tooShort" | "outside" | "tooClose";

type IdentifiedPoint = { readonly id?: string };

const scheduleOfGeometry = (g: RouteGeometry): GroupSchedule =>
    groupSchedule(g as unknown as RouteWalk);

/** The kept stretch of the reference walk holding `x`: `k` in `0..m`, `D[k] <= x` */
function stretchAt(D: readonly number[], m: number, x: number): number {
    let k = 0;
    while (k < m && D[k + 1]! <= x) k++;
    return k;
}

/**
 * The anchor naming place `x` (spec J.2), inside its kept stretch: from the kept point at or
 * before it to the next, or `from` and `to` at the ends.
 */
export function anchorOfPlace(
    schedule: GroupSchedule,
    points: readonly IdentifiedPoint[],
    x: number,
): AdjustAnchor {
    const { W } = schedule;
    const m = W.V.length - 2;
    const k = stretchAt(W.D, m, x);
    const idAt = (j: number) => points[W.source[j]!]!.id!;
    const span = W.D[k + 1]! - W.D[k]!;
    return {
        a: k === 0 ? "from" : idAt(k),
        b: k === m ? "to" : idAt(k + 1),
        f: span > 0 ? clamp01((x - W.D[k]!) / span) : 0,
    };
}

/**
 * A profile's keys that still mean something: a zero key stays only beside a key that displaces
 * (it is the end of that bulge). Null when nothing displaces any more.
 */
export function pruneZeroKeys(keys: readonly AdjustKey[]): AdjustKey[] | null {
    const moves = (k: AdjustKey | undefined) =>
        !!k && (k.d[0] !== 0 || k.d[1] !== 0);
    if (!keys.some(moves)) return null;
    return keys.filter(
        (k, i) => moves(k) || moves(keys[i - 1]) || moves(keys[i + 1]),
    );
}

/** Each key's place, in stored order */
const placesOf = (
    schedule: GroupSchedule,
    points: readonly IdentifiedPoint[],
    keys: readonly AdjustAnchor[],
): number[] => keys.map((k) => anchorPlace(schedule.W, points, k).x);

/**
 * I-J4 for a whole profile on a route: why it can't be written, or null. Keys must lie inside the
 * lane's shared part and at least `s_min` apart.
 */
export function adjustRefusal(
    schedule: GroupSchedule,
    points: readonly IdentifiedPoint[],
    keys: readonly AdjustAnchor[],
): AdjustRefusal | null {
    const { W } = schedule;
    const m = W.V.length - 2;
    if (m < 1) return "outside";
    const places = placesOf(schedule, points, keys).sort((p, q) => p - q);
    if (
        places[0]! < W.D[1]! - EPS_GEOM ||
        places[places.length - 1]! > W.D[m]! + EPS_GEOM
    )
        return "outside";
    for (let i = 1; i < places.length; i++)
        if (places[i]! - places[i - 1]! < S_MIN - EPS_GEOM) return "tooClose";
    return null;
}

export type AdjustPlacement =
    | { ok: true; profile: AdjustProfile | null }
    | { ok: false; reason: AdjustRefusal };

const profileOf = (keys: AdjustKey[] | null): AdjustProfile | null =>
    keys ? { v: 1, keys } : null;

/**
 * AP-R11 (as amended by decision C, spec J.8): the profile after a lane is dragged at place `x`,
 * so that its displacement there becomes `d`.
 *
 * - A rigid part shorter than `2·s_min` is refused (`tooShort`); `x` off it, on a leg, `outside`.
 * - Closer than `s_min` to a key: that key takes `d`.
 * - Closer than `s_min` to an end of the rigid part: the key goes on the end itself. A zero key
 *   beyond it couldn't keep its distance, and within a step of a corner it is that corner the
 *   designer grabbed.
 * - Otherwise a new key, and on each side with no key in its kept stretch a zero key, at the
 *   stretch's end or `s_min` away, whichever is farther, clamped into the rigid part, so the bulge
 *   stays local. A zero key that would land within `s_min` of another key isn't written: that key
 *   already bounds the bulge.
 */
export function placeAdjustKey({
    schedule,
    points,
    profile,
    x,
    d,
}: {
    schedule: GroupSchedule;
    points: readonly IdentifiedPoint[];
    profile: AdjustProfile | null;
    x: number;
    d: XY;
}): AdjustPlacement {
    const { W } = schedule;
    const m = W.V.length - 2;
    if (m < 1) return { ok: false, reason: "outside" };
    const lo = W.D[1]!;
    const hi = W.D[m]!;
    if (hi - lo < 2 * S_MIN) return { ok: false, reason: "tooShort" };
    if (x < lo - EPS_GEOM || x > hi + EPS_GEOM)
        return { ok: false, reason: "outside" };
    const place = Math.min(hi, Math.max(lo, x));
    const keys = profile?.keys ?? [];
    const places = placesOf(schedule, points, keys);

    let nearest = -1;
    places.forEach((p, i) => {
        if (
            Math.abs(p - place) < S_MIN_WRITE &&
            (nearest < 0 ||
                Math.abs(p - place) < Math.abs(places[nearest]! - place))
        )
            nearest = i;
    });
    if (nearest >= 0)
        return {
            ok: true,
            profile: profileOf(
                pruneZeroKeys(
                    keys.map((k, i) =>
                        i === nearest ? { ...k, d: [d[0], d[1]] } : k,
                    ),
                ),
            ),
        };

    const at =
        place - lo < S_MIN_WRITE ? lo : hi - place < S_MIN_WRITE ? hi : place;
    const k = Math.min(stretchAt(W.D, m, at), m - 1);
    const stretch = { from: W.D[k]!, to: W.D[k + 1]! };
    const clear = (p: number) =>
        places.every((q) => Math.abs(q - p) >= S_MIN_WRITE);
    const added: { x: number; d: XY }[] = [{ x: at, d: [d[0], d[1]] }];
    if (at > lo && !places.some((p) => p >= stretch.from && p < at)) {
        const zero = Math.max(lo, Math.min(stretch.from, at - S_MIN_WRITE));
        if (clear(zero)) added.push({ x: zero, d: [0, 0] });
    }
    if (at < hi && !places.some((p) => p > at && p <= stretch.to)) {
        const zero = Math.min(hi, Math.max(stretch.to, at + S_MIN_WRITE));
        if (clear(zero)) added.push({ x: zero, d: [0, 0] });
    }
    const next = [
        ...keys.map((key, i) => ({ x: places[i]!, key })),
        ...added.map(({ x: px, d: pd }) => ({
            x: px,
            key: { ...anchorOfPlace(schedule, points, px), d: pd },
        })),
    ]
        .sort((p, q) => p.x - q.x)
        .map((e) => e.key);
    const refusal = adjustRefusal(schedule, points, next);
    if (refusal) return { ok: false, reason: refusal };
    return { ok: true, profile: profileOf(pruneZeroKeys(next)) };
}

/** The profile without key `index`; null when nothing is left that displaces. */
export function removeAdjustKey(
    profile: AdjustProfile,
    index: number,
): AdjustProfile | null {
    return profileOf(pruneZeroKeys(profile.keys.filter((_, i) => i !== index)));
}

/** What AP-H1 did to one profile. */
export interface RehomeResult {
    /** The profile to store; null when no key is left */
    profile: AdjustProfile | null;
    /** Whether any key's anchor was rewritten or any key dropped */
    changed: boolean;
    /** How many keys this edit dropped */
    dropped: number;
}

/**
 * AP-H1 on one profile (spec J.8, decision B), from route geometry `old` to `next`.
 *
 * An anchor naming a point that survives is left alone. One naming a gone point moves to the
 * nearest surviving points around its old place, by fraction. Then, on the new geometry, keys are
 * clamped into the rigid part. Displacing keys are scanned in place order keeping the first: one
 * closer than `s_min` to the last kept drops whichever of the two moved in this edit, and if both
 * or neither did, the earlier in stored order. A key moved when its anchor was rewritten or its
 * place changed (decision B: a stretch changes distances with no anchor renamed). A zero key never
 * costs a displacing key its place: squeezed against one, it steps back to `s_min` from it on its
 * own side, or goes when there is no room, so a bend keeps its peak. With no rigid part left the
 * whole profile goes, and the caller says so.
 *
 * Not here on purpose: handoff ramps (step 25), pins and holds (step 5), linked Adjusts (step 26).
 * Each is written by its own step and adds its own pass beside this one.
 */
export function rehomeProfile(
    old: RouteGeometry,
    next: RouteGeometry,
    profile: AdjustProfile,
): RehomeResult {
    const before = scheduleOfGeometry(old);
    const after = scheduleOfGeometry(next);
    const m = after.W.V.length - 2;
    if (m < 1)
        return { profile: null, changed: true, dropped: profile.keys.length };
    const alive = new Set(next.points.map((p) => p.id));
    const survives = (id: string, end: string) => id === end || alive.has(id);
    const lo = after.W.D[1]!;
    const hi = after.W.D[m]!;

    const entries = profile.keys.map((key, stored) => {
        const xOld = anchorPlace(before.W, old.points, key).x;
        const untouched = survives(key.a, "from") && survives(key.b, "to");
        const anchored: AdjustKey = untouched
            ? key
            : { ...rehomeAnchor(before, old.points, alive, xOld), d: key.d };
        const placed_ = anchorPlace(after.W, next.points, anchored).x;
        const x = Math.min(hi, Math.max(lo, placed_));
        return {
            stored,
            x,
            key:
                x === placed_
                    ? anchored
                    : { ...anchorOfPlace(after, next.points, x), d: key.d },
            rewritten: !untouched || x !== placed_,
            moved: !untouched || Math.abs(x - xOld) > EPS_GEOM,
        };
    });
    type Entry = (typeof entries)[number];

    const displaces = (e: Entry) => e.key.d[0] !== 0 || e.key.d[1] !== 0;
    const inOrder = [...entries].sort(
        (p, q) => p.x - q.x || p.stored - q.stored,
    );
    // Displacing keys first, among themselves: they are what the designer made
    const kept: Entry[] = [];
    for (const entry of inOrder.filter(displaces)) {
        const last = kept[kept.length - 1];
        if (!last || entry.x - last.x >= S_MIN) {
            kept.push(entry);
            continue;
        }
        const dropEntry =
            entry.moved !== last.moved
                ? entry.moved
                : entry.stored < last.stored;
        if (!dropEntry) kept[kept.length - 1] = entry;
    }
    // Then the zero keys, which only say where a bend ends: one squeezed against a displacing
    // key steps back to a step from it, on its own side, so the bend keeps its peak and its end.
    // With no room there (the rigid part's end, or another key) it goes, and the profile runs
    // on from the peak as it would with no end key.
    const clearOf = (x: number, but?: Entry) =>
        kept.every((k) => k === but || Math.abs(k.x - x) >= S_MIN);
    for (const entry of inOrder.filter((e) => !displaces(e))) {
        if (clearOf(entry.x)) {
            kept.push(entry);
            continue;
        }
        const near = kept
            .filter((k) => displaces(k) && Math.abs(k.x - entry.x) < S_MIN)
            .sort(
                (p, q) => Math.abs(p.x - entry.x) - Math.abs(q.x - entry.x),
            )[0];
        if (!near) continue;
        const before =
            entry.x < near.x ||
            (entry.x === near.x && entry.stored < near.stored);
        const x = before ? near.x - S_MIN_WRITE : near.x + S_MIN_WRITE;
        if (x < lo || x > hi || !clearOf(x, near)) continue;
        kept.push({
            ...entry,
            x,
            key: { ...anchorOfPlace(after, next.points, x), d: entry.key.d },
            rewritten: true,
            moved: true,
        });
    }
    kept.sort((p, q) => p.x - q.x || p.stored - q.stored);
    const dropped = entries.length - kept.length;
    const changed = dropped > 0 || kept.some((e) => e.rewritten);
    if (!changed) return { profile, changed: false, dropped: 0 };
    const keys = pruneZeroKeys(kept.map((e) => e.key));
    return {
        profile: keys ? { v: 1, keys, rehomed: true } : null,
        changed: true,
        // Counted on what is stored: pruning can take a zero key the scan kept
        dropped: profile.keys.length - (keys?.length ?? 0),
    };
}

/** AP-H1 steps 1 to 3 and 5: an anchor at old place `x` between the nearest surviving points. */
function rehomeAnchor(
    before: GroupSchedule,
    points: readonly RoutePoint[],
    alive: ReadonlySet<string>,
    x: number,
): AdjustAnchor {
    const { W } = before;
    const placeOf = (id: string) =>
        anchorPlace(W, points, { a: id, b: "to", f: 0 }).x;
    let a = "from";
    let lastBefore = -1;
    points.forEach((p, i) => {
        if (alive.has(p.id) && placeOf(p.id) <= x) {
            a = p.id;
            lastBefore = i;
        }
    });
    let b = "to";
    for (let i = lastBefore + 1; i < points.length; i++) {
        const p = points[i]!;
        if (alive.has(p.id) && placeOf(p.id) > x) {
            b = p.id;
            break;
        }
    }
    const da = a === "from" ? 0 : placeOf(a);
    const db = b === "to" ? W.L : placeOf(b);
    return { a, b, f: db > da ? clamp01((x - da) / (db - da)) : 0 };
}

/** The smallest gap between consecutive places, Infinity with fewer than two */
const smallestGap = (places: readonly number[]): number => {
    const sorted = [...places].sort((p, q) => p - q);
    let gap = Infinity;
    for (let i = 1; i < sorted.length; i++)
        gap = Math.min(gap, sorted[i]! - sorted[i - 1]!);
    return gap;
};

/** How many samples `limitRouteEdit` tries along the way, then how many times it halves the gap */
const LIMIT_SCAN = 32;
const LIMIT_REFINE = 24;

/**
 * AP-R11's point drags: `next` as far along the way from `old` as keeps every profile's keys at
 * least `s_min` apart ("stops short, as a resize stops at a pin"). Point ids and order must match,
 * or `next` comes back as it is. Spacing a profile already had tighter than `s_min` may stay, but
 * not shrink further. `stopped` says the edit didn't get all the way.
 */
export function limitRouteEdit(
    old: RouteGeometry,
    next: RouteGeometry,
    profiles: readonly AdjustProfile[],
): { geometry: RouteGeometry; stopped: boolean } {
    const free = { geometry: next, stopped: false };
    if (
        profiles.length === 0 ||
        old.points.length !== next.points.length ||
        old.points.some((p, i) => p.id !== next.points[i]!.id)
    )
        return free;
    const start = scheduleOfGeometry(old);
    const floors = profiles.map((p) =>
        Math.min(S_MIN_WRITE, smallestGap(placesOf(start, old.points, p.keys))),
    );
    const lerpXY = (a: XY, b: XY, t: number): XY => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
    ];
    // A bulge goes along with the rest (R-14″), and is dropped where it passes 0
    const between = (a: number | undefined, b: number | undefined, t: number) =>
        (a ?? 0) + ((b ?? 0) - (a ?? 0)) * t;
    const at = (t: number): RouteGeometry => {
        const toBulge = between(old.toBulge, next.toBulge, t);
        return {
            v: 1,
            from: lerpXY(old.from, next.from, t),
            to: lerpXY(old.to, next.to, t),
            ...(toBulge !== 0 ? { toBulge } : {}),
            points: next.points.map((p, i) => {
                const was = old.points[i]!;
                const tension = between(was.tension, p.tension, t);
                const bulge = between(was.bulge, p.bulge, t);
                return {
                    id: p.id,
                    at: lerpXY(was.at, p.at, t),
                    ...(tension > 0 ? { tension } : {}),
                    ...(bulge !== 0 ? { bulge } : {}),
                };
            }),
        };
    };
    const fits = (g: RouteGeometry) => {
        const s = scheduleOfGeometry(g);
        return profiles.every(
            // Within rounding: a gap written at exactly the floor reads a hair under it
            (p, i) =>
                smallestGap(placesOf(s, g.points, p.keys)) >=
                floors[i]! - EPS_GEOM,
        );
    };
    if (fits(next)) return free;
    let good = 0;
    let bad = 1;
    for (let i = 1; i <= LIMIT_SCAN; i++) {
        const t = i / LIMIT_SCAN;
        if (!fits(at(t))) {
            bad = t;
            break;
        }
        good = t;
    }
    for (let i = 0; i < LIMIT_REFINE; i++) {
        const t = (good + bad) / 2;
        if (fits(at(t))) good = t;
        else bad = t;
    }
    return { geometry: good === 0 ? old : at(good), stopped: true };
}

/** Whether the ends now differ from the stored ones by more than `EPS_GEOM` (Re-fit's "changed"). */
export const routeEndsChanged = (
    stored: { from: XY; to: XY },
    now: { from: XY; to: XY },
): boolean =>
    dist(stored.from, now.from) > EPS_GEOM ||
    dist(stored.to, now.to) > EPS_GEOM;

/**
 * Re-fit (decision A, spec J.8): the route with its ends at `from` and `to`, each inner point
 * moved by `(1 − t)·ΔF + t·ΔG`, `t` its along-path fraction on the old route. Point ids never
 * change. When `ΔF = ΔG` it is exactly the translation.
 */
export function refitGeometry(
    old: RouteGeometry,
    from: XY,
    to: XY,
): RouteGeometry {
    const { W } = scheduleOfGeometry(old);
    const dF: XY = [from[0] - old.from[0], from[1] - old.from[1]];
    const spread: XY = [to[0] - old.to[0] - dF[0], to[1] - old.to[1] - dF[1]];
    // Each point keeps its bulge (`...p`) and the last leg its `toBulge` (R-14″: Re-fit keeps a
    // leg's bulge; a bulge is a ratio, so the arc stretches with its chord)
    return {
        v: 1,
        from: [from[0], from[1]],
        to: [to[0], to[1]],
        ...(old.toBulge === undefined ? {} : { toBulge: old.toBulge }),
        points: old.points.map((p) => {
            const D = anchorPlace(W, old.points, {
                a: p.id,
                b: "to",
                f: 0,
            }).x;
            const t = W.L > 0 ? D / W.L : 0;
            return {
                ...p,
                at: [
                    p.at[0] + dF[0] + t * spread[0],
                    p.at[1] + dF[1] + t * spread[1],
                ],
            };
        }),
    };
}

/** One point of a lane's rigid part and its place along the reference walk. */
export interface LaneSample {
    x: number;
    at: XY;
}

/**
 * The lane `walk` between its first and last kept points, sampled where its motion can bend: every
 * kept point and key place, and a cubic piece's own samples (R-14's). Between samples it runs
 * straight, or as near as the path's own measure does. For drawing, hit tests and Big steps.
 */
export function laneSamples(walk: GroupMemberWalk): LaneSample[] {
    const { schedule, offset, adjust } = walk;
    const { W } = schedule;
    const m = W.V.length - 2;
    if (m < 1) return [];
    const point = (j: number, x: number): LaneSample => {
        const q = placed(routePiecePoint(W, j, x - W.D[j]!), offset);
        return { x, at: adjust ? placed(q, adjustAt(adjust, x)) : q };
    };
    const atKept = (k: number): LaneSample => {
        const x = W.D[k]!;
        const q = placed(W.V[k]!, offset);
        return { x, at: adjust ? placed(q, adjustAt(adjust, x)) : q };
    };
    const out: LaneSample[] = [atKept(1)];
    for (let j = 1; j < m; j++) {
        const piece = W.pieces[j]!;
        const start = W.D[j]!;
        const end = W.D[j + 1]!;
        const places = new Set<number>(
            adjust?.xs.filter((x) => x > start && x < end) ?? [],
        );
        if (piece.kind === "cubic")
            for (let i = 1; i < ROUTE_CUBIC_SAMPLES; i++)
                places.add(start + piece.e[i]!);
        else if (piece.kind === "arc")
            // R-14″: an arc's places are even along it (its length is exact)
            for (let i = 1; i < ROUTE_ARC_SAMPLES; i++)
                places.add(start + ((end - start) * i) / ROUTE_ARC_SAMPLES);
        for (const x of [...places].sort((p, q) => p - q))
            out.push(point(j, x));
        out.push(atKept(j + 1));
    }
    return out;
}

/** The lane's rigid part as places: `[D_1, D_m]`, or null when the route has no kept point. */
export function laneRigidPart(
    schedule: GroupSchedule,
): { from: number; to: number } | null {
    const m = schedule.W.V.length - 2;
    return m < 1 ? null : { from: schedule.W.D[1]!, to: schedule.W.D[m]! };
}
