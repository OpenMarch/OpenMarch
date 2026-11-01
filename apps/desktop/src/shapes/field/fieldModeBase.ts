import type { FieldCursor, FieldModeDrawing } from "@/field/editor/fieldEditor";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import type { XY } from "../types";
import {
    frameControls,
    shapeOutline,
    type ShapeGesture,
    type ShapeTarget,
} from "../frame/gestures";
import { edgeGuides } from "../frame/edgeGuides";
import { lineCoordinate } from "./lineCoordinate";
import { pivotPoint, rotationDegrees } from "../frame/frame";
import { useShapePointerStore } from "./shapePointer";
import { lengthReadout } from "../frame/scale";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeField } from "./shapeField";

/** A handle's cursor from a shape kind, as the field shows it */
export const asCursor = (cursor: string): FieldCursor => cursor as FieldCursor;

/** The cursor over what a press would grab on a shape */
export function shapeCursor(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    target: ShapeTarget,
): FieldCursor {
    switch (target.type) {
        case "move":
        case "center":
        case "pivot":
            return "move";
        case "rotate":
            return "grab";
        case "handle": {
            const handle = kind
                .handles(params, n)
                .find((h) => h.key === target.key);
            return handle ? asCursor(handle.cursor) : "default";
        }
    }
}

/** Spot labels show up to this many marchers; above it they pile up (08) */
export const SPOT_LABEL_LIMIT = 24;

/** The marchers' drill numbers by id, for spot labels */
export function drillNumbers(field: ShapeField): Map<number, string> {
    return new Map(field.marchers().map((m) => [m.id, m.drill_number]));
}

/** Where `p` is in drill terms, tersely: "S1: 3.5 in 45 · 8 FH" */
export function drillTerms(p: XY): string | null {
    try {
        const coords = new ReadableCoords({
            x: p.x,
            y: p.y,
            roundingDenominator: 4,
        });
        return `${coords.toTerseStringX()} · ${coords.toTerseStringY()}`;
    } catch {
        // No field properties yet
        return null;
    }
}

type FrameDrawing = Pick<
    FieldModeDrawing,
    "knob" | "centerDot" | "pivotMark" | "pivotPreview" | "pivot" | "tip"
>;

/**
 * What every open or selected shape draws for its frame (08, "Handles and gestures"): the knob,
 * the center dot and the pivot once it's out of the center (#350), and during a gesture its
 * guide: the pivot and the angle while turning, where the center is in drill terms while moving,
 * its length and spacing while stretching.
 */
export function frameDrawing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    gesture: ShapeGesture | null,
    pointer: XY | null,
    env: ToolEnv,
): FrameDrawing {
    const controls = frameControls(kind, params, n, env);
    // The pivot a cell of the editor's pivot menu points at (#437)
    const preview = useShapePointerStore.getState().pivotPreview;
    const out: FrameDrawing = {
        knob: { at: controls.knob, stem: controls.stem },
        centerDot: controls.center,
        ...(controls.pivot ? { pivotMark: controls.pivot } : {}),
        ...(preview
            ? {
                  pivotPreview: pivotPoint(kind.frameOf(params, n), preview),
              }
            : {}),
    };
    if (!gesture || !pointer) return out;
    if (gesture.type === "rotate") {
        const degrees = rotationDegrees(kind.frameOf(params, n).rotation);
        return {
            ...out,
            pivot: { at: gesture.pivot, to: pointer },
            tip: { at: pointer, text: `${degrees}°` },
        };
    }
    if (gesture.type === "handle") {
        // How long the shape is and how far apart, so a long one shows where the next snap lands
        const text = lengthReadout(kind, params, n, env);
        return text ? { ...out, tip: { at: pointer, text } } : out;
    }
    if (gesture.type === "center" || gesture.type === "move") {
        const text = drillTerms(controls.center);
        return text ? { ...out, tip: { at: pointer, text } } : out;
    }
    return out;
}

/**
 * While a draw, a handle drag or a move has the shape's snap points on the field's lines (#425,
 * #444, #446): a guide along each, named as the coordinate sheet writes it (#427), the shape's
 * sides on it drawn thicker, a point on it with no such side ringed, and its spots tinted. The
 * points are the kind's corners, and its center while it's moved or a spacing is dragged (it's
 * pulled only then).
 * Nothing during any other gesture, for a kind with no snap points, or with none on a line.
 */
export function guideDrawing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    spots: readonly XY[],
    gesture: { readonly type: string } | null | undefined,
    env: ToolEnv,
    field: ShapeField,
): Pick<FieldModeDrawing, "guides" | "guideEdges" | "guideMarks" | "onGuides"> {
    const type = gesture?.type;
    // A spacing drag grows the shape from its pivot, so its center can land on a line too (#452)
    const moving = type === "move" || type === "center" || type === "scrub";
    if (type !== "draw" && type !== "handle" && !moving) return {};
    if (!kind.snapPoints) return {};
    const { fieldProperties } = field;
    const { width, height } = fieldProperties;
    const outline = shapeOutline(kind, params, n);
    const { guides, edges, marks, on } = edgeGuides(
        outline,
        // A move lands its center on a line too (#444)
        moving ? kind.snapPoints(params, n) : outline,
        spots,
        env.fieldLines,
        { width, height },
    );
    if (guides.length === 0) return {};
    // Named as the coordinate sheet would write a spot on the line (owner, #427)
    const named = guides.map((g) => {
        const label = lineCoordinate(g.axis, g.at);
        return { from: g.from, to: g.to, ...(label ? { label } : {}) };
    });
    return {
        guides: named,
        guideEdges: edges,
        ...(marks.length > 0 ? { guideMarks: marks } : {}),
        onGuides: on,
    };
}

/**
 * A drawing worked out once per state: the overlay reads it as a snapshot, so the same state
 * must give the same object.
 */
export function memoDrawing<S>(
    draw: (state: S) => FieldModeDrawing | null,
): (state: S | null) => FieldModeDrawing | null {
    let last: { state: S; drawing: FieldModeDrawing | null } | null = null;
    return (state) => {
        if (state === null) return null;
        if (last?.state !== state) last = { state, drawing: draw(state) };
        return last.drawing;
    };
}
