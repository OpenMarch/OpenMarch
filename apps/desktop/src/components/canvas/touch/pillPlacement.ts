/**
 * Where the floating pill goes when the user hasn't put it somewhere: the
 * candidate spot that covers the fewest marchers; at the bottom, within reach
 * of the thumbs, unless every bottom spot covers marchers; then the one that
 * covers the least of the field drawing. Positions are in the field container's pixels,
 * as `left` from its left edge and `bottom` from its bottom edge.
 */

import {
    clearSpotOf,
    NO_FIELD_OBSTACLES,
    overlapArea,
    overlaps,
    type FieldObstacles,
} from "../fieldLayers";

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

/**
 * Room left for the zoom controls in the bottom-right corner: in the touch layout they stand
 * 6 px off the bottom and about 99 px tall (a 44 px slider row over 48 px buttons,
 * `CanvasZoomControls`), so the pill clears them with a small gap. The other spots are kept off
 * the controls by `choosePillPosition`'s `controls`.
 */
export const ZOOM_CONTROLS_CLEARANCE = 112;
export const PILL_EDGE = 12;

const overlap = overlapArea;

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
 * @param controls The other layers over the field the pill must not cover (the zoom controls,
 *   the task's cards and bars, the toolbar panel: `fieldLayers.ts`), in container pixels (top-left
 *   origin). A spot over one loses to any spot that isn't.
 * @param obstacles What's dragged on the field (#933): the selection box, the open shape and their
 *   handles, with a finger's reach around them. A spot over a handle loses to any spot over none
 *   that keeps off the other layers; a spot over an area (the box, the outline) loses to one over
 *   only the field. So when no spot is free, the pill covers field rather than handles.
 */
// A spot at the top only wins when every bottom spot covers marchers: the pill
// belongs within reach of the thumbs
const TOP_PENALTY = 1e8;
const CONTROL_PENALTY = 1e15;
/** For each handle the spot covers (#933) */
const HANDLE_PENALTY = 1e13;
/** For covering the selection box or the open shape at all (#933) */
const AREA_PENALTY = 1e12;
/** Room kept between the pill and a layer it slid clear of */
const CONTROL_GAP = 4;

/**
 * How bad a spot is, lower being better: over a control is worst, then each handle it covers (#933),
 * then covering the selection box or the open shape at all, then each marcher it covers, then
 * being at the top, away from the thumbs, then how much of the field drawing it covers
 */
export function pillSpotScore(spot: {
    overControl: boolean;
    overHandles: number;
    overArea: boolean;
    covered: number;
    top: boolean;
    fieldArea: number;
}): number {
    return (
        (spot.overControl ? CONTROL_PENALTY : 0) +
        spot.overHandles * HANDLE_PENALTY +
        (spot.overArea ? AREA_PENALTY : 0) +
        spot.covered * 1e9 +
        (spot.top ? TOP_PENALTY : 0) +
        spot.fieldArea
    );
}

export function choosePillPosition(
    container: { width: number; height: number },
    pill: { width: number; height: number },
    field: Rect | null,
    marchers: { x: number; y: number }[],
    controls: readonly Rect[] = [],
    obstacles: FieldObstacles = NO_FIELD_OBSTACLES,
): PillPosition {
    const candidates = pillCandidates(container, pill);
    let best: PillPosition = candidates[0];
    let bestScore = Infinity;
    const bounds = { left: 0, top: 0, ...container };
    for (const candidate of candidates) {
        const rect: Rect = {
            left: candidate.left,
            top: container.height - candidate.bottom - pill.height,
            width: pill.width,
            height: pill.height,
        };
        // Slid clear of the layers over the field first, so one in the way of a spot (the
        // Inspector's edge tab beside the bottom-right one) moves the pill along, not elsewhere.
        // Clear of what's dragged on the field too if it can be, else of its handles at least
        const slid = clearSpotOf(
            rect,
            [
                [...controls, ...obstacles.handles, ...obstacles.areas],
                [...controls, ...obstacles.handles],
                controls,
            ],
            bounds,
            CONTROL_GAP,
        );
        rect.left = slid.left;
        rect.top = slid.top;
        const spot = {
            left: rect.left,
            bottom: container.height - rect.top - pill.height,
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
        const overControl = controls.some((c) => overlap(rect, c) > 0);
        const overHandles = obstacles.handles.filter(
            (h) => overlap(rect, h) > 0,
        ).length;
        const overArea = obstacles.areas.some((a) => overlap(rect, a) > 0);
        const score = pillSpotScore({
            overControl,
            overHandles,
            overArea,
            covered,
            top: candidate.top,
            fieldArea,
        });
        if (score < bestScore) {
            best = spot;
            bestScore = score;
        }
    }
    return best;
}

/**
 * What the pill does when the layers over the field or what's on it change (#936): it keeps its
 * spot (`"keep"`) unless that spot now covers one of `layers` or a handle, so a select, a deselect
 * or a tool being armed doesn't move it from under a finger reaching for it, or onto where the
 * user is about to draw. When it must move, it slides the least way clear: of the layers and
 * what's dragged on the field, else of the layers and the handles. `null` when no slide clears
 * them: then it finds a new spot (`choosePillPosition`).
 */
export function keepOrSlide(
    shown: Rect,
    container: { width: number; height: number },
    layers: readonly Rect[],
    obstacles: FieldObstacles = NO_FIELD_OBSTACLES,
): "keep" | PillPosition | null {
    const blocked =
        layers.some((layer) => overlaps(shown, layer)) ||
        coversHandle(shown, obstacles);
    if (!blocked) return "keep";
    const slid = clearSpotOf(
        shown,
        [
            [...layers, ...obstacles.handles, ...obstacles.areas],
            [...layers, ...obstacles.handles],
        ],
        { left: 0, top: 0, ...container },
        CONTROL_GAP,
    );
    return slid.clear
        ? {
              left: slid.left,
              bottom: container.height - slid.top - shown.height,
          }
        : null;
}

/**
 * Whether the pill at `rect` covers one of the field's handles (#933): only then does a change on
 * the field (a selection, a shape, marchers moved) give it a new spot
 */
export const coversHandle = (rect: Rect, obstacles: FieldObstacles) =>
    obstacles.handles.some((h) => overlaps(rect, h));

/** The layers over the field as a string, rounded to whole px, to tell when one really moved */
export const layersKey = (layers: readonly Rect[]): string =>
    layers
        .map(
            (r) =>
                `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`,
        )
        .join(";");
