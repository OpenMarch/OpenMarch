import { fieldToFrame, frameToField } from "../frame/frame";
import { distribute, gridSpacing, spreadScale } from "../distribute/distribute";
import {
    DEFAULT_ODD_GAP,
    distributionFor,
    storedDistribution,
    type Distribution,
    type DistributionMode,
} from "../distribute/distribution";
import {
    polygonRegion,
    type ClosedShape,
    type Region,
} from "../distribute/region";
import type { ToolEnv } from "../tool/toolKind";
import type { Slot } from "../types";
import {
    closedOutline,
    isClosed,
    lineFrame,
    lineSpots,
    scaled,
    withGroups,
    type LineParams,
} from "./lineGeometry";

/**
 * A closed Line filled by the host (#529, spec #522): its outline as drawn makes a closed region,
 * and the host's distributor lays out Grid and Spread (with its Edge) over it. Outline is the line itself,
 * its corners and spacing as an open line has them (`lineSpots`), so it isn't the distributor's.
 * The drawn outline is the shape: the spacing in Grid and Spread is whatever fits the marchers in
 * it. Everything here is pure.
 */

/** The ways a closed Line can be filled, in the mode switch's order */
export const LINE_MODES: readonly DistributionMode[] = [
    "files",
    "outline",
    "spread",
];

/** How a closed Line is filled until another mode is picked: as its outline */
const OUTLINE: Distribution = { mode: "outline", oddGap: DEFAULT_ODD_GAP };

/** How the line is filled: its stored distribution, else Outline */
export function lineDistribution(p: LineParams): Distribution {
    const d = isClosed(p) ? storedDistribution(p, 1) : undefined;
    return d && LINE_MODES.includes(d.mode) ? d : OUTLINE;
}

/** Whether the line is filled by the distributor: closed, in Grid or Spread */
export const isFilled = (p: LineParams): boolean =>
    isClosed(p) && lineDistribution(p).mode !== "outline";

/**
 * The closed line's region in its frame: its outline as drawn, a curve in short pieces
 * (`closedOutline`), so Grid, Spread and Edge fill the curve rather than the points' polygon.
 * Only its corners (tension 0) are corners of the region, where Edge's sides start.
 */
export function lineRegion(p: LineParams): Region {
    const frame = lineFrame(p);
    const { points, corners } = closedOutline(p);
    return polygonRegion(
        points.map((q) => fieldToFrame(frame, q)),
        corners,
    );
}

/**
 * The spacing a filled line's marchers have, in field units: Grid's square grid that fits the
 * outline, or Spread's closest pair when it fills the outline
 */
export function fillInterval(p: LineParams, n: number): number {
    const region = lineRegion(p);
    const d = lineDistribution(p);
    if (d.mode === "files") return gridSpacing(region, n);
    if (d.mode !== "spread") return 0;
    const size = spreadScale(region, n, d, 1);
    return size > 0 ? 1 / size : 0;
}

/** A filled line's spots on the field, from the distributor */
export function fillSpots(p: LineParams, n: number): Slot[] {
    if (n <= 0) return [];
    const frame = lineFrame(p);
    const across = fillInterval(p, n);
    return distribute({
        region: lineRegion(p),
        n,
        distribution: lineDistribution(p),
        across,
        deep: across,
    }).map((s) => ({ ...frameToField(frame, s), row: s.row, col: s.col }));
}

/** The line's spots however it's filled */
export const lineFillSpots = (
    p: LineParams,
    n: number,
    stepPx?: number,
): Slot[] => {
    // One marcher on a closed line has no gap to lay out: it stands on the first point
    if (n === 1 && isClosed(p)) {
        const { x, y } = p.points[0]!;
        return [{ x, y, s: 0 }];
    }
    return isFilled(p) ? fillSpots(p, n) : lineSpots(p, n, stepPx);
};

/**
 * A filled line with its spacing set to `interval` (field units): the outline grown or shrunk
 * from its pivot, as the spacing follows its size; null where it has none to set
 */
export function withFillInterval(
    p: LineParams,
    n: number,
    interval: number,
    env: ToolEnv,
): LineParams | null {
    const was = fillInterval(p, n);
    if (!(was > 0) || !(interval > 0)) return null;
    return scaled(p, interval / was, env);
}

/** What a closed Line declares so the host can fill it (spec #385) */
export const lineClosed: ClosedShape<LineParams> = {
    when: (p) => isClosed(p),
    modes: LINE_MODES,
    region: (p) => lineRegion(p),
    distribution: (p) => lineDistribution(p),
    startMode: (_p, n, mode) => distributionFor(mode, 1, n),
    // The outline drawn is kept in every mode, its spacing following, except in Outline with a
    // kept spacing: there the outline follows its spacing, so a new count (Close up) grows or
    // shrinks it from its pivot and keeps every gap as typed rather than leaving the hole
    withDistribution(p, n, distribution, env) {
        const next = { ...p, distribution };
        if (distribution.mode !== "outline" || p.spacing.mode !== "keep")
            return next;
        return withGroups(next, n, p.spacing.groups, env);
    },
};
