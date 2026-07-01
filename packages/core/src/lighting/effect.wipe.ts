import { z } from "zod";
import { ColorSchema } from "./utils";

export type WipeEffectArgs = {
    color: string;
    directionDegrees: number;
};

export const defaultWipeEffectArgs: WipeEffectArgs = {
    color: "#000000",
    directionDegrees: 0,
};

export const normalizeWipeDirectionDegrees = (value: number): number =>
    ((Math.round(value) % 360) + 360) % 360;

const wipeEffectArgsInputSchema = z
    .object({
        color: ColorSchema.optional(),
        directionDegrees: z.number().optional(),
    })
    .strip();

type WipeEffectArgsInput = z.infer<typeof wipeEffectArgsInputSchema>;

export const normalizeWipeEffectArgs = (
    input: WipeEffectArgsInput,
): WipeEffectArgs => {
    return {
        color: input.color ?? defaultWipeEffectArgs.color,
        directionDegrees: normalizeWipeDirectionDegrees(
            input.directionDegrees ?? defaultWipeEffectArgs.directionDegrees,
        ),
    };
};

export const wipeEffectArgsSchema: z.ZodType<WipeEffectArgs> =
    wipeEffectArgsInputSchema.transform(normalizeWipeEffectArgs);

export const parseWipeEffectArgs = (argsJson: string): WipeEffectArgs => {
    try {
        const parsed = JSON.parse(argsJson) as unknown;
        return wipeEffectArgsSchema.parse(parsed);
    } catch {
        return defaultWipeEffectArgs;
    }
};

export type WipeRevealPoint = { x: number; y: number };

const WIPE_REVEAL_EPSILON = 1e-6;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function wipeDirectionUnitVector(directionDegrees: number): {
    x: number;
    y: number;
} {
    const radians =
        (normalizeWipeDirectionDegrees(directionDegrees) * Math.PI) / 180;
    return { x: Math.cos(radians), y: -Math.sin(radians) };
}

function dotProduct(
    point: WipeRevealPoint,
    direction: { x: number; y: number },
): number {
    return point.x * direction.x + point.y * direction.y;
}

function sortPointsAngularly(points: WipeRevealPoint[]): WipeRevealPoint[] {
    if (points.length <= 2) return points;

    const centroid = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
    );
    centroid.x /= points.length;
    centroid.y /= points.length;

    return [...points].sort((a, b) => {
        const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
        const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
        return angleA - angleB;
    });
}

function dedupePoints(points: WipeRevealPoint[]): WipeRevealPoint[] {
    const out: WipeRevealPoint[] = [];
    for (const point of points) {
        const duplicate = out.some(
            (existing) =>
                Math.abs(existing.x - point.x) < WIPE_REVEAL_EPSILON &&
                Math.abs(existing.y - point.y) < WIPE_REVEAL_EPSILON,
        );
        if (!duplicate) out.push(point);
    }
    return out;
}

/**
 * Returns a convex polygon (local coords, origin top-left) for the revealed
 * portion of a wipe at the given progress and direction.
 * 0° = left→right, 90° = bottom→top (screen Y-down).
 */
export function getWipeRevealPolygonLocal(
    width: number,
    height: number,
    progress: number,
    directionDegrees: number,
): WipeRevealPoint[] {
    const safeWidth = Math.max(0, width);
    const safeHeight = Math.max(0, height);
    if (safeWidth === 0 || safeHeight === 0) return [];

    const clampedProgress = clamp01(progress);
    if (clampedProgress <= 0) return [];

    const corners: WipeRevealPoint[] = [
        { x: 0, y: 0 },
        { x: safeWidth, y: 0 },
        { x: safeWidth, y: safeHeight },
        { x: 0, y: safeHeight },
    ];

    if (clampedProgress >= 1) return corners;

    const direction = wipeDirectionUnitVector(directionDegrees);
    const cornerDots = corners.map((corner) => dotProduct(corner, direction));
    const minDot = Math.min(...cornerDots);
    const maxDot = Math.max(...cornerDots);
    const threshold = minDot + clampedProgress * (maxDot - minDot);

    const points: WipeRevealPoint[] = [];

    for (let i = 0; i < corners.length; i++) {
        const current = corners[i]!;
        const next = corners[(i + 1) % corners.length]!;
        const currentDot = cornerDots[i]!;
        const nextDot = cornerDots[(i + 1) % corners.length]!;

        if (currentDot <= threshold + WIPE_REVEAL_EPSILON) {
            points.push(current);
        }

        const currentInside = currentDot <= threshold + WIPE_REVEAL_EPSILON;
        const nextInside = nextDot <= threshold + WIPE_REVEAL_EPSILON;
        if (currentInside !== nextInside) {
            const t = (threshold - currentDot) / (nextDot - currentDot);
            points.push({
                x: current.x + t * (next.x - current.x),
                y: current.y + t * (next.y - current.y),
            });
        }
    }

    const uniquePoints = dedupePoints(points);
    if (uniquePoints.length < 3) return [];

    return sortPointsAngularly(uniquePoints);
}
