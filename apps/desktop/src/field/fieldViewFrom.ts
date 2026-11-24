import type { PositionSource } from "@/timeline/positionBuffer";

/**
 * Which side an export shows the field from (#1268, #1265).
 *
 * - `audience`: from the front, the front sideline at the bottom and side 1 on the left, as the
 *   editor draws it.
 * - `performer`: from the back, as performers see the field when they face the front. The field
 *   is turned half a turn, so the front sideline is at the top and side 1 on the right.
 *
 * Turning moves everything on the field (lines, painted yard numbers, the field image, dots,
 * pathways). Text that isn't painted on the field, such as the checkpoint labels around it and
 * drill numbers, moves with its point but stays upright.
 */
export type FieldViewFrom = "audience" | "performer";

export const FIELD_VIEWS_FROM: readonly FieldViewFrom[] = [
    "audience",
    "performer",
];

/** The field's size in field units: what a point is turned within. */
export type FieldSize = { width: number; height: number };

/** A field point seen from `viewFrom`: turned half a turn about the field's center from the back. */
export function pointSeenFrom<T extends { x: number; y: number }>(
    viewFrom: FieldViewFrom,
    size: FieldSize,
    point: T,
): T {
    if (viewFrom === "audience") return point;
    return { ...point, x: size.width - point.x, y: size.height - point.y };
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

// Each match is one command letter and its numbers. Only absolute commands are written by the
// field plan and `walkedPathToSvg`.
const PATH_COMMAND = /([MLQCAZ])([^MLQCAZ]*)/g; // cspell:disable-line

/**
 * SVG path data turned half a turn about the field's center. Takes the absolute `M`, `L`, `Q`,
 * `C`, `A` and `Z` commands the field plan and the walked paths write; an arc keeps its radii,
 * angle and flags, since a half turn changes neither its shape nor its direction.
 */
export function turnPathData(d: string, size: FieldSize): string {
    const out: string[] = [];
    for (const [, command, args] of d.matchAll(PATH_COMMAND)) {
        const n = args!
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number);
        if (command === "A") {
            for (let i = 0; i + 6 < n.length; i += 7) {
                n[i + 5] = size.width - n[i + 5]!;
                n[i + 6] = size.height - n[i + 6]!;
            }
        } else {
            for (let i = 0; i + 1 < n.length; i += 2) {
                n[i] = size.width - n[i]!;
                n[i + 1] = size.height - n[i + 1]!;
            }
        }
        out.push(n.length ? `${command} ${n.map(num).join(" ")}` : command!);
    }
    return out.join(" ");
}

/** A position source whose positions are seen from the performers' side. */
export function turnedPositionSource(
    source: PositionSource,
    size: FieldSize,
): PositionSource {
    return {
        marcherIds: () => source.marcherIds(),
        positionsAt(beat, out) {
            if (!source.positionsAt(beat, out)) return false;
            for (let i = 0; i + 1 < out.length; i += 2) {
                out[i] = size.width - out[i]!;
                out[i + 1] = size.height - out[i + 1]!;
            }
            return true;
        },
    };
}
