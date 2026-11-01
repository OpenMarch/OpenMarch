import { memo, useCallback, useMemo, useSyncExternalStore } from "react";
import { GlyphText } from "@/shapes/editor/GlyphText";
import { rgbaToString, type FieldTheme } from "@openmarch/core";
import type { FieldEditor, FieldModeDrawing } from "@/field/editor/fieldEditor";
import type { AreaShape } from "@/field/editor/areaGestures";
import { HANDLE_SIZE, type HandleId } from "@/field/editor/groupTransform";
import type { FieldRect } from "@/field/editor/selectionArea";
import type { PropToolShape } from "@/field/editor/propTool";
import type { FieldMarchers } from "./fieldMarchers";
import type { FieldItems } from "./fieldItems";
import { fieldToElement, useFieldViewStore } from "./fieldView";
import {
    drawnSelectionBox,
    selectionHandles,
    type DrawnSelectionBox,
} from "./selectionFrame";
import { dotSizes, SELECTION_COLOR } from "./selectionRing";
import { DOT_RADIUS } from "@/field/editor/hitTest";
import { resolveMarcherLook } from "@/entity-components/appearance";
import { GUIDE_INK, GUIDE_INK_TEXT } from "./guideInk";
import HeldRolesChip, { HeldRolesChipBelowTip } from "./HeldRolesChip";

/** The selection border width, in CSS px. */
const BOX_WIDTH = 2;
/** The marquee border width, in CSS px. */
const MARQUEE_WIDTH = 2;
/** The lasso stroke: 2 CSS px, dashed 5 on, 5 off. */
const LASSO_WIDTH = 2;
const LASSO_DASH = "5 5";
/**
 * A marquee or lasso that subtracts (Alt at the press) is told apart by its line: the marquee's
 * border dashed as a lasso's is, with a fainter fill, and the lasso dotted.
 */
const SUBTRACT_LASSO_DASH = "2 4";
/**
 * A mode's look (the shape tool, a selected placed box): the outline 1 CSS px
 * wide, dashed 6 on, 4 off; spots of radius 4 field units, 1.5 wide; walks 1
 * field unit wide; handles 9 CSS px squares with a 1.5 px rim. As on Fabric.
 */
const SHAPE_OUTLINE_WIDTH = 1;
const SHAPE_OUTLINE_DASH = "6 4";
const SPOT_RADIUS = 4;
const SPOT_WIDTH = 1.5;
const WALK_WIDTH = 1;
const SHAPE_HANDLE_SIZE = 9;
const SHAPE_HANDLE_WIDTH = 1.5;

/** The prop tool's line while drawing, in CSS px. */
const PROP_PREVIEW_WIDTH = 2;

/** The rotate handle's connecting line, in CSS px. */
const ROTATE_LINE_WIDTH = 1;
/** A shape's rotate knob, center dot and pivot, in CSS px (08-shape-system-ux.md). */
const KNOB_RADIUS = 5;
const CENTER_DOT_RADIUS = 5;
const CENTER_DOT_RING = 2.5;
const PIVOT_RADIUS = 4;
const PIVOT_COLOR = "#facc15";
/** The pivot's crosshair once it's out of the center (#350): its arms and ring, in CSS px */
const PIVOT_MARK_ARM = 9;
const PIVOT_MARK_RING = 5;
/**
 * The guide along a field line a shape's edge is on (#425, #427): a solid line across the whole
 * canvas at any zoom, named at the canvas edge, over a dark edge that carries it on turf and
 * images; the shape's side on it 2½ times the outline, so a snap is plain to see. In the guide
 * ink (`guideInk.ts`).
 */
const GUIDE_WIDTH = 1.5;
const GUIDE_CASING = "rgba(0, 0, 0, 0.35)";
const GUIDE_CASING_WIDTH = GUIDE_WIDTH + 2;
const GUIDE_EDGE_WIDTH = 2.5 * SHAPE_OUTLINE_WIDTH;
/** A corner or center on a guide with no side along it (#446): a ring in CSS px, as the pivot's */
const GUIDE_MARK_RADIUS = 6;
const GUIDE_MARK_WIDTH = GUIDE_EDGE_WIDTH;
/** A guide's name tag at the canvas edge, in CSS px */
const GUIDE_LABEL_PX = 12;
const GUIDE_LABEL_HEIGHT = 20;
const GUIDE_LABEL_INSET = 6;
/** How strong an open shape's controls are while the pointer is away from it (#403) */
const CALM_CONTROLS_OPACITY = 0.25;
/** Spot labels and the pointer tip, in CSS px. */
const SPOT_LABEL_PX = 10;
const TIP_PX = 12;
const TIP_OFFSET_PX = 14;
/** Room for the tip's pill; it lays itself out inside, from the top left */
const TIP_BOX = { width: 360, height: 32 };

/**
 * The SVG overlay over the field (ADR 0005 D-2): what the editor draws on top
 * of the WebGL field in screen space. The selection box around a selection of
 * two or more marchers (#193) with its scale and rotate handles (#198), the
 * marquee and lasso while one is drawn (#195), and what a mode draws: the
 * shape tool's box, or a selected placed box's (#204).
 *
 * It reads the camera from the view store, as the WebGL camera does, and
 * re-renders only when what it draws changes: with no box, playback doesn't
 * render it. During a marquee, lasso or handle drag it re-renders on every
 * pointer move; nothing else in the app does. It takes no pointer events: the
 * field under it does, and the editor hit-tests the handles as it does the
 * marchers.
 */
export default function FieldOverlay({
    marchers,
    items,
    editor,
    theme,
}: {
    marchers: FieldMarchers;
    items: FieldItems;
    editor: FieldEditor;
    theme: FieldTheme;
}) {
    const subscribeEditor = useCallback(
        (listener: () => void) => editor.subscribe(listener),
        [editor],
    );
    // The box as a string, so an unchanged box is an unchanged snapshot
    const box = useSyncExternalStore(
        useCallback(
            (listener: () => void) => {
                const off = [
                    marchers.subscribe(listener),
                    items.subscribe(listener),
                    subscribeEditor(listener),
                ];
                return () => off.forEach((unsubscribe) => unsubscribe());
            },
            [marchers, items, subscribeEditor],
        ),
        () => JSON.stringify(drawnSelectionBox(marchers, editor, items)),
    );
    const area = useSyncExternalStore(subscribeEditor, () =>
        editor.areaShape(),
    );
    const modeDrawing = useSyncExternalStore(subscribeEditor, () =>
        editor.modeDrawing(),
    );
    const propTool = useSyncExternalStore(subscribeEditor, () =>
        editor.propToolShape(),
    );

    return (
        <>
            <HeldRolesChip belowTip={modeDrawing?.tip !== undefined} />
            <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                data-testid="fieldOverlay"
            >
                <SelectionBox
                    frame={JSON.parse(box) as DrawnSelectionBox | null}
                />
                {area?.kind === "marquee" && (
                    <Marquee
                        rect={area.rect}
                        subtract={area.subtract}
                        theme={theme}
                    />
                )}
                {area?.kind === "lasso" && <Lasso lasso={area} theme={theme} />}
                {modeDrawing && (
                    <ModeDrawing
                        drawing={modeDrawing}
                        theme={theme}
                        marchers={marchers}
                    />
                )}
                {propTool && <PropToolPreview tool={propTool} theme={theme} />}
            </svg>
        </>
    );
}

/**
 * The box around a multi-selection, clear of the selection rings, with its
 * handles (#198): squares on the corners and middles, and the rotate handle
 * above the top middle, joined to it by a line. Turned with the marchers
 * while a rotation is dragged.
 */
function SelectionBox({ frame }: { frame: DrawnSelectionBox | null }) {
    const view = useFieldViewStore();
    if (!frame) return null;
    const screen = Object.fromEntries(
        Object.entries(selectionHandles(frame, view.zoom)).map(([id, at]) => [
            id,
            fieldToElement(view, at.x, at.y),
        ]),
    ) as Record<HandleId, { x: number; y: number }>;
    const corners = [screen.nw, screen.ne, screen.se, screen.sw]
        .map(({ x, y }) => `${x},${y}`)
        .join(" ");
    const half = HANDLE_SIZE / 2;
    return (
        <g data-testid="fieldSelectionBox">
            <polygon
                points={corners}
                fill="none"
                stroke={SELECTION_COLOR}
                strokeWidth={BOX_WIDTH}
            />
            <line
                x1={screen.n.x}
                y1={screen.n.y}
                x2={screen.rot.x}
                y2={screen.rot.y}
                stroke={SELECTION_COLOR}
                strokeWidth={ROTATE_LINE_WIDTH}
            />
            {(Object.keys(screen) as HandleId[]).map((id) =>
                id === "rot" ? (
                    <circle
                        key={id}
                        cx={screen.rot.x}
                        cy={screen.rot.y}
                        r={half}
                        fill="white"
                        stroke={SELECTION_COLOR}
                        strokeWidth={1}
                    />
                ) : (
                    <rect
                        key={id}
                        x={-half}
                        y={-half}
                        width={HANDLE_SIZE}
                        height={HANDLE_SIZE}
                        transform={`translate(${screen[id].x} ${screen[id].y}) rotate(${frame.angle})`}
                        fill="white"
                        stroke={SELECTION_COLOR}
                        strokeWidth={1}
                    />
                ),
            )}
        </g>
    );
}

/**
 * The prop tool's Outline as it's drawn (C2.1): the theme's line color,
 * filled at 30% when it's a closed shape.
 */
function PropToolPreview({
    tool,
    theme,
}: {
    tool: PropToolShape;
    theme: FieldTheme;
}) {
    const view = useFieldViewStore();
    const { preview } = tool;
    if (!preview) return null;
    const points = preview.points
        .map((point) => {
            const at = fieldToElement(view, point.x, point.y);
            return `${at.x},${at.y}`;
        })
        .join(" ");
    const stroke = rgbaToString(theme.primaryStroke);
    return preview.closed ? (
        <polygon
            data-testid="fieldPropTool"
            points={points}
            fill={rgbaToString({ ...theme.primaryStroke, a: 0.3 })}
            stroke={stroke}
            strokeWidth={PROP_PREVIEW_WIDTH}
        />
    ) : (
        <polyline
            data-testid="fieldPropTool"
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth={PROP_PREVIEW_WIDTH}
        />
    );
}

/** The marquee: the theme's shape color, filled at 20%; dashed and filled at 8% when it subtracts. */
function Marquee({
    rect,
    subtract,
    theme,
}: {
    rect: FieldRect;
    subtract: boolean;
    theme: FieldTheme;
}) {
    const view = useFieldViewStore();
    const topLeft = fieldToElement(view, rect.left, rect.top);
    const bottomRight = fieldToElement(view, rect.right, rect.bottom);
    return (
        <rect
            data-testid="fieldMarquee"
            data-subtract={subtract}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            fill={rgbaToString({ ...theme.shape, a: subtract ? 0.08 : 0.2 })}
            stroke={rgbaToString(theme.shape)}
            strokeWidth={MARQUEE_WIDTH}
            strokeDasharray={subtract ? LASSO_DASH : undefined}
        />
    );
}

/**
 * The lasso's line, dashed (dotted when it subtracts): the theme's stroke
 * color, and its next-path green while releasing would close it.
 */
function Lasso({
    lasso,
    theme,
}: {
    lasso: AreaShape & { kind: "lasso" };
    theme: FieldTheme;
}) {
    const view = useFieldViewStore();
    const points = lasso.points
        .map((point) => {
            const at = fieldToElement(view, point.x, point.y);
            return `${at.x},${at.y}`;
        })
        .join(" ");
    return (
        <polyline
            data-testid="fieldLasso"
            data-closes={lasso.closes}
            data-subtract={lasso.subtract}
            points={points}
            fill="none"
            stroke={rgbaToString(
                lasso.closes ? theme.nextPath : theme.primaryStroke,
            )}
            strokeWidth={LASSO_WIDTH}
            strokeDasharray={lasso.subtract ? SUBTRACT_LASSO_DASH : LASSO_DASH}
        />
    );
}

/**
 * What a mode draws (#204): the shape's outline, dashed, the spots its
 * marchers will stand on, a faint line from each marcher to its spot, and its
 * handles, in the theme's shape color.
 */
/** How see-through a start ghost is (#417; the owner picked ghosts over rings in the lab) */
const GHOST_OPACITY = 0.35;

/**
 * Where an open shape's marchers start (#346, #417): a faint, see-through dot in each marcher's
 * own color, at the start flag
 */
const StartMarks = memo(function StartMarks({
    drawing,
    theme,
    marchers,
    looks,
    scale,
}: {
    drawing: FieldModeDrawing;
    theme: FieldTheme;
    marchers: FieldMarchers;
    /** The marchers' appearance version */
    looks: number;
    /** The dots' size step at this zoom (`dotSizes`) */
    scale: number;
}) {
    const ringIds = drawing.ringIds;
    const ringKey = ringIds?.join(",");
    const { ids } = marchers;
    // Each ring's color, worked out again only when whose rings or their looks change (#455)
    const colors = useMemo(() => {
        const shape = rgbaToString(theme.shape);
        const index = new Map(marchers.ids.map((id, i) => [id, i]));
        return (ringIds ?? []).map((id) => {
            const row = index.get(id);
            const look =
                row === undefined
                    ? null
                    : resolveMarcherLook(marchers.stacks[row] ?? [], theme);
            return look
                ? rgbaToString(
                      look.shape === "cross" ? look.crossColor : look.fill,
                  )
                : shape;
        });
        // ringIds by content, marchers by their versions
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ringKey, theme, marchers, looks, ids]);
    const shape = rgbaToString(theme.shape);
    const r = DOT_RADIUS * scale;
    return (
        <>
            {drawing.rings?.map((point, i) => (
                <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r={r}
                    fill={colors[i] ?? shape}
                    opacity={GHOST_OPACITY}
                    data-testid="fieldShapeStartGhost"
                />
            ))}
        </>
    );
});

/**
 * A guide's name at the canvas edge (#427): at the top for a line side to side, at the left for
 * one front to back, kept inside the canvas
 */
function GuideLabel({
    text,
    at,
    upright,
    width,
    height,
}: {
    text: string;
    at: { x: number; y: number };
    upright: boolean;
    width: number;
    height: number;
}) {
    // About the width of the text in DM Sans at this size, with room either side
    const w = text.length * GUIDE_LABEL_PX * 0.55 + 16;
    const h = GUIDE_LABEL_HEIGHT;
    const clamp = (v: number, max: number) =>
        Math.max(GUIDE_LABEL_INSET, Math.min(max - GUIDE_LABEL_INSET, v));
    const x = upright ? clamp(at.x - w / 2, width - w) : GUIDE_LABEL_INSET;
    const y = upright ? GUIDE_LABEL_INSET : clamp(at.y - h / 2, height - h);
    return (
        <g data-testid="fieldShapeGuideLabel">
            <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={h / 2}
                fill={GUIDE_INK}
            />
            <text
                x={x + w / 2}
                y={y + h / 2}
                fontSize={GUIDE_LABEL_PX}
                fontWeight={600}
                fontFamily="DM Sans, sans-serif"
                fill={GUIDE_INK_TEXT}
                textAnchor="middle"
                dominantBaseline="central"
            >
                {text}
            </text>
        </g>
    );
}

/**
 * The controls fade while the pointer is away from the shape (#403), and come back over it: at
 * once for people who ask their system for less motion
 */
export const controlsStyle = (
    calm: boolean | undefined,
): { opacity: number; transition?: string } =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
        ? { opacity: calm ? CALM_CONTROLS_OPACITY : 1 }
        : {
              opacity: calm ? CALM_CONTROLS_OPACITY : 1,
              transition: "opacity 150ms ease-out",
          };

/**
 * The shape's outline, where its marchers start, their walks and its spots, in field units
 * under the view's transform: the outline's stroke stays in CSS px (#455)
 */
const ShapeBody = memo(function ShapeBody({
    drawing,
    theme,
    marchers,
    looks,
    scale,
}: {
    drawing: FieldModeDrawing;
    theme: FieldTheme;
    marchers: FieldMarchers;
    /** The marchers' appearance version: their looks changed, so the ghosts redraw */
    looks: number;
    scale: number;
}) {
    const shape = rgbaToString(theme.shape);
    const walk = rgbaToString({ ...theme.shape, a: 0.4 });
    const fill = rgbaToString({ ...theme.shape, a: 0.06 });
    const open = drawing.stage === "open";
    const dots = drawing.stage === "drawing";
    return (
        <>
            {drawing.outline && (
                <polygon
                    points={drawing.outline
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                    // The faint fill shows with the controls, on hover (#403)
                    fill={open && !drawing.calm ? fill : "none"}
                    stroke={shape}
                    strokeWidth={SHAPE_OUTLINE_WIDTH}
                    strokeDasharray={open ? undefined : SHAPE_OUTLINE_DASH}
                    vectorEffect="non-scaling-stroke"
                />
            )}
            <StartMarks
                drawing={drawing}
                theme={theme}
                marchers={marchers}
                looks={looks}
                scale={scale}
            />
            {drawing.walks.map(({ from: a, to: b }, i) => {
                return (
                    <line
                        key={i}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={walk}
                        strokeWidth={WALK_WIDTH}
                    />
                );
            })}
            {drawing.spots.map((p, i) => {
                return (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={SPOT_RADIUS}
                        // Solid while drawn and once open (#403): the spots are where everyone will
                        // stand, unlike the hollow start rings
                        fill={dots || open ? shape : "none"}
                        stroke={dots || open ? "white" : shape}
                        strokeWidth={SPOT_WIDTH}
                    />
                );
            })}
        </>
    );
});

/** The spots on a guide and an outline's gaps, in field units over the guides (#455) */
const ShapeOnGuides = memo(function ShapeOnGuides({
    drawing,
    theme,
}: {
    drawing: FieldModeDrawing;
    theme: FieldTheme;
}) {
    const shape = rgbaToString(theme.shape);
    const controls = controlsStyle(drawing.calm);
    return (
        <>
            {drawing.onGuides?.map((p, i) => {
                return (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={SPOT_RADIUS}
                        fill={GUIDE_INK}
                        stroke="white"
                        strokeWidth={SPOT_WIDTH}
                    />
                );
            })}
            {drawing.gaps?.map((p, i) => {
                return (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={SPOT_RADIUS}
                        fill="none"
                        stroke={shape}
                        strokeWidth={SPOT_WIDTH}
                        strokeDasharray="1.5 1.5"
                        style={controls}
                        data-testid="fieldShapeGap"
                    />
                );
            })}
        </>
    );
});

function ModeDrawing({
    drawing,
    theme,
    marchers,
}: {
    drawing: FieldModeDrawing;
    theme: FieldTheme;
    marchers: FieldMarchers;
}) {
    const view = useFieldViewStore();
    const shape = rgbaToString(theme.shape);
    const z = view.zoom;
    const at = (point: { x: number; y: number }) =>
        fieldToElement(view, point.x, point.y);
    const half = SHAPE_HANDLE_SIZE / 2;
    const controls = controlsStyle(drawing.calm);
    // What scales with the field is drawn in field units under the view's transform, and redrawn
    // only when the drawing changes, not on every pan or zoom frame (#455)
    const transform = `translate(${view.panX} ${view.panY}) scale(${z})`;
    return (
        <g data-testid="fieldShapeMode" data-stage={drawing.stage}>
            <g transform={transform}>
                <ShapeBody
                    drawing={drawing}
                    theme={theme}
                    marchers={marchers}
                    looks={marchers.appearanceVersion}
                    scale={dotSizes(z).scale}
                />
            </g>
            {drawing.guides?.map(({ from, to }, i) => {
                const upright = Math.abs(at(from).x - at(to).x) < 1e-6;
                // Across the whole canvas, at any zoom
                const p = at(from);
                const a = upright ? { x: p.x, y: 0 } : { x: 0, y: p.y };
                const b = upright
                    ? { x: p.x, y: view.height }
                    : { x: view.width, y: p.y };
                return (
                    <g key={i} data-testid="fieldShapeGuide">
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={GUIDE_CASING}
                            strokeWidth={GUIDE_CASING_WIDTH}
                        />
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={GUIDE_INK}
                            strokeWidth={GUIDE_WIDTH}
                        />
                    </g>
                );
            })}
            {drawing.guideEdges?.map(({ from, to }, i) => {
                const a = at(from);
                const b = at(to);
                return (
                    <line
                        key={i}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={GUIDE_INK}
                        strokeWidth={GUIDE_EDGE_WIDTH}
                        strokeLinecap="round"
                        data-testid="fieldShapeGuideEdge"
                    />
                );
            })}
            {drawing.guideMarks?.map((point, i) => {
                // A turned box's corner or a center on the line: no side shows it, so a ring does
                const p = at(point);
                return (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={GUIDE_MARK_RADIUS}
                        fill="none"
                        stroke={GUIDE_INK}
                        strokeWidth={GUIDE_MARK_WIDTH}
                        data-testid="fieldShapeGuideMark"
                    />
                );
            })}
            <g transform={transform}>
                <ShapeOnGuides drawing={drawing} theme={theme} />
            </g>
            {drawing.labels?.map(({ at: point, text }, i) => {
                const p = at(point);
                return (
                    <text
                        key={i}
                        x={p.x}
                        y={p.y - (SPOT_RADIUS + 2) * z}
                        fontSize={SPOT_LABEL_PX}
                        fontFamily="DM Sans, sans-serif"
                        textAnchor="middle"
                        fill={shape}
                        data-testid="fieldShapeSpotLabel"
                    >
                        {text}
                    </text>
                );
            })}
            {drawing.knob &&
                (() => {
                    const a = at(drawing.knob.stem);
                    const b = at(drawing.knob.at);
                    return (
                        <g data-testid="fieldShapeKnob" style={controls}>
                            <line
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke={shape}
                                strokeWidth={ROTATE_LINE_WIDTH}
                                strokeDasharray="3 3"
                            />
                            <circle
                                cx={b.x}
                                cy={b.y}
                                r={KNOB_RADIUS}
                                fill="white"
                                stroke={shape}
                                strokeWidth={SHAPE_HANDLE_WIDTH}
                            />
                        </g>
                    );
                })()}
            {drawing.handles.map((point, i) => {
                const p = at(point);
                return (
                    <rect
                        key={i}
                        x={p.x - half}
                        y={p.y - half}
                        width={SHAPE_HANDLE_SIZE}
                        height={SHAPE_HANDLE_SIZE}
                        fill="white"
                        stroke={shape}
                        strokeWidth={SHAPE_HANDLE_WIDTH}
                        style={controls}
                        data-testid="fieldShapeHandle"
                    />
                );
            })}
            {drawing.centerDot &&
                (() => {
                    const p = at(drawing.centerDot);
                    return (
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r={CENTER_DOT_RADIUS}
                            fill="white"
                            stroke={shape}
                            strokeWidth={CENTER_DOT_RING}
                            style={controls}
                            data-testid="fieldShapeCenterDot"
                        />
                    );
                })()}
            {drawing.pivotMark &&
                (() => {
                    const p = at(drawing.pivotMark);
                    const r = PIVOT_MARK_ARM;
                    const cross = `M ${p.x - r} ${p.y} H ${p.x + r} M ${p.x} ${p.y - r} V ${p.y + r}`;
                    return (
                        <g data-testid="fieldShapePivotMark" style={controls}>
                            {/* A dark edge under the yellow, so it reads on grass and on white */}
                            <path d={cross} stroke="black" strokeWidth={3.5} />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={PIVOT_MARK_RING}
                                fill="none"
                                stroke="black"
                                strokeWidth={3.5}
                            />
                            <path
                                d={cross}
                                stroke={PIVOT_COLOR}
                                strokeWidth={1.5}
                            />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={PIVOT_MARK_RING}
                                fill="none"
                                stroke={PIVOT_COLOR}
                                strokeWidth={1.5}
                            />
                        </g>
                    );
                })()}
            {drawing.pivotPreview &&
                (() => {
                    // A cell of the editor's pivot menu pointed at (#437): the pivot mark a
                    // little larger on a soft halo, at full strength even while the shape is calm
                    const p = at(drawing.pivotPreview);
                    const r = PIVOT_MARK_ARM * 1.3;
                    const ring = PIVOT_MARK_RING * 1.3;
                    const cross = `M ${p.x - r} ${p.y} H ${p.x + r} M ${p.x} ${p.y - r} V ${p.y + r}`;
                    return (
                        <g
                            data-testid="fieldShapePivotPreview"
                            pointerEvents="none"
                        >
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={r + 4}
                                fill={PIVOT_COLOR}
                                fillOpacity={0.25}
                            />
                            <path d={cross} stroke="black" strokeWidth={4} />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={ring}
                                fill="none"
                                stroke="black"
                                strokeWidth={4}
                            />
                            <path
                                d={cross}
                                stroke={PIVOT_COLOR}
                                strokeWidth={2}
                            />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={ring}
                                fill="none"
                                stroke={PIVOT_COLOR}
                                strokeWidth={2}
                            />
                        </g>
                    );
                })()}
            {drawing.pivot &&
                (() => {
                    const a = at(drawing.pivot.at);
                    const b = at(drawing.pivot.to);
                    return (
                        <g data-testid="fieldShapePivot">
                            <line
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke={PIVOT_COLOR}
                                strokeWidth={ROTATE_LINE_WIDTH}
                                strokeDasharray="4 3"
                            />
                            <circle
                                cx={a.x}
                                cy={a.y}
                                r={PIVOT_RADIUS}
                                fill={PIVOT_COLOR}
                                stroke="black"
                                strokeWidth={1}
                            />
                        </g>
                    );
                })()}
            {drawing.tip &&
                (() => {
                    const p = at(drawing.tip.at);
                    // A solid pill, so the readout reads over any part of the field (owner)
                    return (
                        <foreignObject
                            x={p.x + TIP_OFFSET_PX}
                            y={p.y + TIP_OFFSET_PX}
                            width={TIP_BOX.width}
                            height={TIP_BOX.height}
                            overflow="visible"
                        >
                            <div className="flex flex-col items-start gap-4">
                                <div
                                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-text shadow-modal inline-flex items-center gap-2 border px-6 py-2 whitespace-nowrap tabular-nums"
                                    style={{ fontSize: TIP_PX }}
                                    data-testid="fieldShapeTip"
                                >
                                    <GlyphText
                                        text={drawing.tip.text}
                                        size={12}
                                    />
                                </div>
                                {/* The held-roles chip stacks under the readout, never over it */}
                                <HeldRolesChipBelowTip />
                            </div>
                        </foreignObject>
                    );
                })()}
            {/* The guides' names last, over every line, edge and spot, so nothing crosses
                their text (owner on #427) */}
            {drawing.guides?.map(({ from, to, label }, i) => {
                if (!label) return null;
                const upright = Math.abs(at(from).x - at(to).x) < 1e-6;
                const p = at(from);
                return (
                    <GuideLabel
                        key={i}
                        text={label}
                        at={upright ? { x: p.x, y: 0 } : { x: 0, y: p.y }}
                        upright={upright}
                        width={view.width}
                        height={view.height}
                    />
                );
            })}
        </g>
    );
}
