/**
 * The one place a route's geometry is rewritten (pathways step 3b, spec v0.10 AP-H1): every path
 * edit, redraw, cut and Re-fit goes through `writeRouteGeometryInTransaction`, so a key anchored on
 * a point that went is re-homed in the same edit and never dropped silently. A new route has
 * nothing anchored on it, so inserting one doesn't come here.
 *
 * What AP-H1 also names and doesn't exist yet plugs in here beside the lanes' profiles: handoff
 * ramps (step 25), pins and holds (step 5) and linked Adjusts (step 26). AP-R21's merge and join
 * (still refused, AP-R6) write through this helper when they arrive.
 */
import {
    isRouteBulge,
    limitRouteEdit,
    rehomeProfile,
    smoothBesideArc,
    validateRouteGeometry,
    type AdjustProfile,
    type RouteGeometry,
} from "@openmarch/core";
import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { text } from "@/timeline/timelineText";
import type { DbTransaction } from "./types";
import { assertValid, refuse } from "./timelineErrors";
import { lanesOfRoute, markArcModelInTransaction } from "./timelineLanes";

/** R-14″'s refusals, with the reasons the app shows */
export const arcRefusal = {
    /** A bulge past a half circle, or not a number */
    tooRound: () => text.t("timeline.refusals.route.arcTooRound"),
    /** A smooth point at an end of an arc leg */
    smoothBesideArc: () => text.t("timeline.refusals.route.smoothBesideArc"),
};

/**
 * R-14″: refuses (`E-ARGS`, with the reason) a geometry with a bulge outside `0 < |bulge| <= 1/2`
 * or a smooth point at an end of an arc leg, before anything is written. The validator's E-R1
 * says the same of a file; this is the app's own refusal.
 */
export function refuseArcRules(geometry: RouteGeometry): void {
    const bulges = [
        ...geometry.points.flatMap((p) =>
            "bulge" in p ? [p.bulge as unknown] : [],
        ),
        ...("toBulge" in geometry ? [geometry.toBulge as unknown] : []),
    ];
    if (bulges.some((k) => !isRouteBulge(k))) refuse(arcRefusal.tooRound());
    if (smoothBesideArc(geometry.points, geometry.toBulge) >= 0)
        refuse(arcRefusal.smoothBesideArc());
}

/** Whether a route has an arc leg (R-14″) */
export const hasArcs = (geometry: RouteGeometry): boolean =>
    geometry.toBulge !== undefined ||
    geometry.points.some((p) => p.bulge !== undefined);

/**
 * Writes file version 14 when `geometry` has an arc leg (R-14″, Appendix L Storage): a build that
 * doesn't know arcs would walk them straight. A file without one stays at its version.
 */
export async function markArcsInTransaction(
    tx: DbTransaction,
    geometry: RouteGeometry,
): Promise<void> {
    if (hasArcs(geometry)) await markArcModelInTransaction(tx);
}

/** What a geometry edit did to the Adjusts on the route, for the badge and the toast. */
export interface RehomeReport {
    /** Spots whose Adjust had a key re-homed or dropped and still has keys */
    rehomedSpots: number;
    /** Keys dropped, over every spot */
    droppedKeys: number;
    /** Spots whose Adjust went altogether */
    clearedSpots: number;
    /** A point drag stopped short to keep keys a step apart (AP-R11) */
    stoppedShort: boolean;
}

export const NOTHING_REHOMED: RehomeReport = {
    rehomedSpots: 0,
    droppedKeys: 0,
    clearedSpots: 0,
    stoppedShort: false,
};

/**
 * The last leg's bulge an edit writes (R-14″): `toBulge` a number sets it, null clears it, and
 * undefined keeps `current`'s. As a spread onto a geometry.
 */
export const lastLegBulge = (
    current: RouteGeometry | null,
    toBulge: number | null | undefined,
): { toBulge?: number } => {
    const k = toBulge === undefined ? current?.toBulge : toBulge;
    return k === undefined || k === null || k === 0 ? {} : { toBulge: k };
};

/** Reads a lane's stored profile. */
export const profileOfLane = (lane: {
    adjust: string | null;
}): AdjustProfile | null =>
    lane.adjust === null ? null : (JSON.parse(lane.adjust) as AdjustProfile);

/**
 * Writes route `routeId`'s geometry, then AP-H1 on every Adjust of its lanes. With `drag`, the
 * edit is a point drag: it goes only as far as keeps every profile's keys a step apart (AP-R11).
 * Any other edit re-homes, and drops by AP-H1's rule.
 */
export async function writeRouteGeometryInTransaction(
    tx: DbTransaction,
    routeId: number,
    next: RouteGeometry,
    { drag = false }: { drag?: boolean } = {},
): Promise<RehomeReport> {
    const R = schema.timeline_routes;
    const L = schema.timeline_lanes;
    const row = await tx.select().from(R).where(eq(R.id, routeId)).get();
    if (!row) refuse(`route ${routeId} does not exist`);
    refuseArcRules(next);
    const old = JSON.parse(row.geometry) as RouteGeometry;
    const adjusted = (await lanesOfRoute(tx, routeId)).flatMap((lane) => {
        const profile = profileOfLane(lane);
        return profile ? [{ lane, profile }] : [];
    });
    const limited = drag
        ? limitRouteEdit(
              old,
              next,
              adjusted.map((a) => a.profile),
          )
        : { geometry: next, stopped: false };
    refuseArcRules(limited.geometry);
    assertValid(validateRouteGeometry(limited.geometry), "route");
    await tx
        .update(R)
        .set({ geometry: JSON.stringify(limited.geometry) })
        .where(eq(R.id, routeId));
    await markArcsInTransaction(tx, limited.geometry);
    const report = { ...NOTHING_REHOMED, stoppedShort: limited.stopped };
    for (const { lane, profile } of adjusted) {
        const out = rehomeProfile(old, limited.geometry, profile);
        if (!out.changed) continue;
        await tx
            .update(L)
            .set({ adjust: out.profile ? JSON.stringify(out.profile) : null })
            .where(eq(L.id, lane.id));
        report.droppedKeys += out.dropped;
        if (out.profile) report.rehomedSpots++;
        else report.clearedSpots++;
    }
    return report;
}
