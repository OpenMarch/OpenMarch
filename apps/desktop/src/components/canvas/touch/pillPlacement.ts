/**
 * Where the floating pill goes when the user hasn't put it somewhere: the
 * candidate spot that covers the fewest marchers; at the bottom, within reach
 * of the thumbs, unless every bottom spot covers marchers; then the one that
 * covers the least of the field drawing. Positions are in the field container's pixels,
 * as `left` from its left edge and `bottom` from its bottom edge.
 */

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface PillPosition {
    left: number;
    bottom: number;
}

interface Candidate extends PillPosition {
    /** At the top of the field area, away from the thumbs */
    top: boolean;
}

/** Room left for the zoom buttons in the bottom-right corner */
export const ZOOM_CONTROLS_CLEARANCE = 76;
export const PILL_EDGE = 12;

const overlap = (a: Rect, b: Rect) => {
    const w =
        Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    const h =
        Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
};

/** Candidate spots, in order of preference */
export function pillCandidates(
    container: { width: number; height: number },
    pill: { width: number; height: number },
): Candidate[] {
    const right = container.width - pill.width - PILL_EDGE;
    const top = container.height - pill.height - PILL_EDGE;
    return [
        { left: right, bottom: ZOOM_CONTROLS_CLEARANCE, top: false },
        { left: PILL_EDGE, bottom: PILL_EDGE, top: false },
        {
            left: (container.width - pill.width) / 2,
            bottom: PILL_EDGE,
            top: false,
        },
        { left: PILL_EDGE, bottom: top, top: true },
        { left: right, bottom: top, top: true },
    ].map((p) => ({
        left: Math.max(0, p.left),
        bottom: Math.max(0, Math.min(p.bottom, top)),
        top: p.top,
    }));
}

/**
 * The best default spot.
 *
 * @param field The field drawing, in container pixels (top-left origin)
 * @param marchers Marcher dots, in container pixels
 */
// A spot at the top only wins when every bottom spot covers marchers: the pill
// belongs within reach of the thumbs
const TOP_PENALTY = 1e8;

export function choosePillPosition(
    container: { width: number; height: number },
    pill: { width: number; height: number },
    field: Rect | null,
    marchers: { x: number; y: number }[],
): PillPosition {
    const candidates = pillCandidates(container, pill);
    let best: PillPosition = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
        const rect: Rect = {
            left: candidate.left,
            top: container.height - candidate.bottom - pill.height,
            width: pill.width,
            height: pill.height,
        };
        // A margin around the pill, so a marcher right next to it counts too
        const padded: Rect = {
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
        };
        const covered = marchers.filter(
            (m) =>
                m.x >= padded.left &&
                m.x <= padded.left + padded.width &&
                m.y >= padded.top &&
                m.y <= padded.top + padded.height,
        ).length;
        const fieldArea = field ? overlap(rect, field) : 0;
        const score =
            covered * 1e9 + (candidate.top ? TOP_PENALTY : 0) + fieldArea;
        if (score < bestScore) {
            best = { left: candidate.left, bottom: candidate.bottom };
            bestScore = score;
        }
    }
    return best;
}
