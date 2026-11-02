import { useEffect, useMemo } from "react";
import { rgbaToString, type FieldTheme } from "@openmarch/core";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import tolgee from "@/global/singletons/Tolgee";
import { fieldToElement, useFieldViewStore } from "@/field/three/fieldView";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { frameCorners } from "../frame/frame";
import { shapeOutline } from "../frame/gestures";
import { useShapeToolStore } from "../tool/shapeToolStore";
import type { XY } from "../types";
import { useBoxSelectionStore } from "./boxSelectionStore";
import type { PlacedBox } from "./placedBox";
import { placedNumbers } from "./placedBoxText";
import {
    followPlacedBoxChanges,
    invalidatePlacedBoxes,
    placedBoxesAt,
    usePlacedBoxStore,
    usePlacedBoxBeat,
} from "./placedBoxStore";
import { closedOf } from "../distribute/modes";

/** One placed shape as the field outlines it, in field units */
export interface PlacedBoxDrawing {
    readonly id: number;
    /** The rectangle around its outline, half a step out so it doesn't cut the dots */
    readonly rect: {
        readonly left: number;
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
    };
    /** Its outline as drawn, half a step out, turned with it: a box's back-left corner first */
    readonly corners: readonly { readonly x: number; readonly y: number }[];
    readonly label: string;
}

/** The label's size, and how far it stands above the box's back edge (over the back rank's own labels), in CSS px */
const LABEL_PX = 11;
const LABEL_GAP_PX = 30;

/**
 * "Box 5 × 4 · 2 steps" (or "· 2 × 1½ steps" when the intervals differ), "Circle · 2 steps": the
 * kind and the numbers it declares, as the field shows them
 */
export function boxLabel(box: PlacedBox, stepPx: number): string {
    const { counts, intervals } = placedNumbers(box, stepPx);
    const name = counts
        ? `${box.kind.shape.label} ${counts}`
        : box.kind.shape.label;
    return intervals === null
        ? name
        : tolgee.t("shapes.placed.label", "{name} · {interval} steps", {
              name,
              interval: intervals,
          });
}

/**
 * The shape's outline `pad` further out. A shape with corners (or none of its own) grows its
 * frame, so every edge moves out the same; a round one grows from its center.
 */
function outlineOut(box: PlacedBox, pad: number): XY[] {
    const { kind, params, spots } = box;
    const frame = kind.frameOf(params, spots);
    const round =
        kind.outline !== undefined &&
        closedOf(kind, params, spots)?.region(params, spots).corners.length ===
            0;
    if (!round)
        return frameCorners({
            ...frame,
            halfWidth: frame.halfWidth + pad,
            halfDepth: frame.halfDepth + pad,
        });
    const c = frame.center;
    return shapeOutline(kind, params, spots).map((p) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        const k = d > 0 ? (d + pad) / d : 1;
        return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
    });
}

/** The field-aligned rectangle around the shape's outline, however it's turned */
function boundsOf(box: PlacedBox) {
    const outline = shapeOutline(box.kind, box.params, box.spots);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
    };
}

let drawn: readonly PlacedBoxDrawing[] = [];

/** The placed boxes outlined on the field now, for the field test API */
export const drawnPlacedBoxes = (): readonly PlacedBoxDrawing[] => drawn;

/**
 * Placed shapes on the field (docs/timeline/research/shapes/07-placed-boxes.md), by the View tab's
 * **Shapes** setting: while any member is selected (the default), always, or never. A thin
 * outline through each shape's edge marchers, half a step out, and its label above it, in the
 * theme's shape color. Hidden during playback and while the Shape tool is open, which draws its
 * own; the selected box draws its own outline and handles (`LiveBoxMode`). Few boxes, so SVG
 * over the field, like the editor's overlay. It takes no pointer events, and exports don't draw
 * it.
 */
export function PlacedBoxesOverlay({
    isPlaying,
    theme,
    stepPx,
}: {
    isPlaying: boolean;
    theme: FieldTheme;
    stepPx: number;
}) {
    const mode = useUiSettingsStore((s) => s.uiSettings.shapes ?? "selected");
    const recipes = usePlacedBoxStore((s) => s.recipes);
    const version = useTimelineResolverStore((s) => s.version);
    const beat = usePlacedBoxBeat();
    const ends = usePlacedBoxStore((s) => s.ends);
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const editing = useBoxSelectionStore((s) => s.selected?.recipe.id ?? null);
    const selected = useSelectedMarchers()?.selectedMarchers;
    const view = useFieldViewStore();

    // The recipes change with the show: every resolver change re-reads them, and so does every
    // undoable edit, undo and redo, for those that change only a recipe
    useEffect(() => {
        invalidatePlacedBoxes();
    }, [version]);
    useEffect(() => followPlacedBoxChanges(), []);

    const drawings = useMemo(() => {
        if (mode === "off" || isPlaying || toolOpen) return [];
        const ids = new Set((selected ?? []).map((m) => m.id));
        const pad = stepPx / 2;
        return placedBoxesAt(beat, recipes)
            .filter(
                (box) =>
                    box.recipe.id !== editing &&
                    (mode === "always" ||
                        box.recipe.members.some((m) => ids.has(m.marcherId))),
            )
            .map((box): PlacedBoxDrawing => {
                const corners = outlineOut(box, pad);
                const f = boundsOf(box);
                return {
                    id: box.recipe.id,
                    rect: {
                        left: f.left - pad,
                        top: f.top - pad,
                        right: f.right + pad,
                        bottom: f.bottom + pad,
                    },
                    corners,
                    label: boxLabel(box, stepPx),
                };
            });
        // placedBoxesAt reads the resolver and the move end beats, which these stand for
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mode,
        isPlaying,
        toolOpen,
        selected,
        recipes,
        beat,
        version,
        ends,
        editing,
        stepPx,
    ]);
    useEffect(() => {
        drawn = drawings;
        return () => {
            drawn = [];
        };
    }, [drawings]);

    if (drawings.length === 0) return null;
    const color = rgbaToString(theme.shape);
    return (
        <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-testid="placedBoxes"
        >
            {drawings.map(({ id, corners, label }) => {
                const points = corners.map((c) =>
                    fieldToElement(view, c.x, c.y),
                );
                // The label sits over the corner highest on screen
                const a = points.reduce((top, p) => (p.y < top.y ? p : top));
                return (
                    <g key={id} data-testid="placedBox">
                        <polygon
                            points={points
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                            fill="none"
                            stroke={color}
                            strokeWidth={1}
                        />
                        <text
                            x={a.x}
                            y={a.y - LABEL_GAP_PX}
                            fontSize={LABEL_PX}
                            fontFamily="DM Sans, sans-serif"
                            fill={color}
                            dominantBaseline="hanging"
                        >
                            {label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}
