import type { FieldFootprint, WorldPoint } from "../field/world";
import type {
    CinemaContext,
    CinemaSubject,
    SubjectBounds,
    Tightness,
} from "./types";

/**
 * What a shot frames: the circle around its subject, smoothed over time.
 *
 * Smoothing samples the subject's path over a window around the asked time
 * instead of integrating a spring frame by frame, so a time always gives the
 * same bounds whether the show plays or is scrubbed.
 */

/** A single marcher, or marchers on one dot, still frame this much ground (m). */
export const MIN_SUBJECT_RADIUS = 1.5;
/** The total smoothing window, centered on ms + lead. */
export const SMOOTH_WINDOW_MS = 1000;
export const SMOOTH_SAMPLES = 9;
/**
 * No shot frames less than this (m), however tight: a marcher with headgear
 * and a horn is about 2.2 m tall, and a smaller frame cuts the head off.
 */
export const MIN_FRAMED_RADIUS = 1.1;
/** How far ahead along the subject's path the camera looks. */
export const DEFAULT_LEAD_MS = 250;

/**
 * Tightness → radius multiplier. A close-up on marchers also aims at the
 * chest instead of the ground (see `CLOSE_UP_TARGET_HEIGHT`).
 */
export const TIGHTNESS_SCALE: Record<Tightness, number> = {
    wide: 1.6,
    // 1 is the tightest that still holds every marcher of the subject.
    medium: 1,
    tight: 0.75,
    closeUp: 0.45,
};

const footprintBounds = (footprint: FieldFootprint): SubjectBounds => ({
    cx: (footprint.minX + footprint.maxX) / 2,
    cz: (footprint.minZ + footprint.maxZ) / 2,
    radius: Math.max(
        MIN_SUBJECT_RADIUS,
        Math.hypot(
            footprint.maxX - footprint.minX,
            footprint.maxZ - footprint.minZ,
        ) / 2,
    ),
});

/**
 * Bounding circle of points: the center is the midpoint of their bounding box
 * and the radius is half its diagonal, at least {@link MIN_SUBJECT_RADIUS}.
 * No points (or none that are finite) gives the footprint's circle.
 */
export function boundsOf(
    points: readonly WorldPoint[],
    footprint: FieldFootprint,
): SubjectBounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const { x, z } of points) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    if (minX > maxX) return footprintBounds(footprint);
    return {
        cx: (minX + maxX) / 2,
        cz: (minZ + maxZ) / 2,
        radius: Math.max(
            MIN_SUBJECT_RADIUS,
            Math.hypot(maxX - minX, maxZ - minZ) / 2,
        ),
    };
}

/** {@link boundsOf}, centered on the points' centroid instead of their box. */
function centroidBounds(
    points: readonly WorldPoint[],
    footprint: FieldFootprint,
): SubjectBounds {
    const bounds = boundsOf(points, footprint);
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const { x, z } of points) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        sumX += x;
        sumZ += z;
        count++;
    }
    if (count === 0) return bounds;
    return { cx: sumX / count, cz: sumZ / count, radius: bounds.radius };
}

/** The subject's bounds at one instant, before smoothing. */
function boundsAt(
    subject: CinemaSubject,
    ms: number,
    ctx: CinemaContext,
): SubjectBounds {
    if (subject.kind === "center")
        return centroidBounds(
            ctx.subjectPoints({ kind: "band" }, ms),
            ctx.footprint,
        );
    return boundsOf(ctx.subjectPoints(subject, ms), ctx.footprint);
}

/**
 * Smoothed bounds at ms: {@link SMOOTH_SAMPLES} samples evenly spaced across
 * {@link SMOOTH_WINDOW_MS} centered on ms + leadMs, with triangular weights,
 * as the weighted mean of cx, cz and radius.
 *
 * Regions and spots do not move, so they resolve without `ctx.subjectPoints`.
 * Sample times can be negative or past the end of the show; the context
 * decides what a subject does there.
 */
export function smoothedBounds(
    subject: CinemaSubject,
    ms: number,
    ctx: CinemaContext,
    leadMs: number = DEFAULT_LEAD_MS,
): SubjectBounds {
    if (subject.kind === "spot")
        return boundsOf([{ x: subject.x, z: subject.z }], ctx.footprint);
    if (subject.kind === "region")
        return boundsOf(
            [
                { x: subject.minX, z: subject.minZ },
                { x: subject.maxX, z: subject.maxZ },
            ],
            ctx.footprint,
        );

    const middle = (SMOOTH_SAMPLES - 1) / 2;
    const center = ms + leadMs;
    let cx = 0;
    let cz = 0;
    let radius = 0;
    let total = 0;
    for (let i = 0; i < SMOOTH_SAMPLES; i++) {
        const at = center + (i / (SMOOTH_SAMPLES - 1) - 0.5) * SMOOTH_WINDOW_MS;
        const weight = middle + 1 - Math.abs(i - middle);
        const bounds = boundsAt(subject, at, ctx);
        cx += bounds.cx * weight;
        cz += bounds.cz * weight;
        radius += bounds.radius * weight;
        total += weight;
    }
    return { cx: cx / total, cz: cz / total, radius: radius / total };
}
