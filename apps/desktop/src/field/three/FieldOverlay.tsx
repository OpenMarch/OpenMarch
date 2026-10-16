import { useCallback, useSyncExternalStore } from "react";
import { rgbaToString, type FieldTheme } from "@openmarch/core";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { AreaShape } from "@/field/editor/areaGestures";
import { HANDLE_SIZE, type HandleId } from "@/field/editor/groupTransform";
import type { FieldRect } from "@/field/editor/selectionArea";
import type { LineToolShape } from "@/field/editor/lineTool";
import { DOT_RADIUS } from "@/field/editor/hitTest";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, useFieldViewStore } from "./fieldView";
import {
    drawnSelectionBox,
    selectionHandles,
    type DrawnSelectionBox,
} from "./selectionFrame";
import { dotSizes, SELECTION_COLOR } from "./selectionRing";

/** The selection border width, in CSS px. */
const BOX_WIDTH = 2;
/** The marquee border width, in CSS px. */
const MARQUEE_WIDTH = 2;
/** The lasso stroke: 2 CSS px, dashed 5 on, 5 off. */
const LASSO_WIDTH = 2;
const LASSO_DASH = "5 5";
/**
 * The line tool's look, in field units, so they scale with the field: a
 * 3-wide line, 2-wide pathways dashed 5 on, 3 off, and dots of radius 3 at
 * each pathway's middle and end. Its marchers' outlines are squares just
 * outside the dot, 1.5 wide, dashed 3 on, 5 off.
 */
const LINE_WIDTH = 3;
const PATH_WIDTH = 2;
const PATH_DASH = [5, 3];
const PATH_DOT_RADIUS = 3;
const OUTLINE_WIDTH = 1.5;
const OUTLINE_DASH = [3, 5];
/** How far a line marcher's outline's center line sits outside its dot. */
const OUTLINE_GAP = 0.25;

/** The rotate handle's connecting line, in CSS px. */
const ROTATE_LINE_WIDTH = 1;

/**
 * The SVG overlay over the field (ADR 0005 D-2): what the editor draws on top
 * of the WebGL field in screen space. The selection box around a selection of
 * two or more marchers (#193) with its scale and rotate handles (#198), the
 * marquee and lasso while one is drawn (#195), and the line tool's line,
 * previews and outlined marchers (#203).
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
    editor,
    theme,
}: {
    marchers: FieldMarchers;
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
                    subscribeEditor(listener),
                ];
                return () => off.forEach((unsubscribe) => unsubscribe());
            },
            [marchers, subscribeEditor],
        ),
        () => JSON.stringify(drawnSelectionBox(marchers, editor)),
    );
    const area = useSyncExternalStore(subscribeEditor, () =>
        editor.areaShape(),
    );
    const lineTool = useSyncExternalStore(subscribeEditor, () =>
        editor.lineToolShape(),
    );

    return (
        <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-testid="fieldOverlay"
        >
            <SelectionBox frame={JSON.parse(box) as DrawnSelectionBox | null} />
            {area?.kind === "marquee" && (
                <Marquee rect={area.rect} theme={theme} />
            )}
            {area?.kind === "lasso" && <Lasso lasso={area} theme={theme} />}
            {lineTool && (
                <LineToolPreview
                    tool={lineTool}
                    marchers={marchers}
                    theme={theme}
                />
            )}
        </svg>
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

/** The marquee: the theme's shape color, filled at 20%. */
function Marquee({ rect, theme }: { rect: FieldRect; theme: FieldTheme }) {
    const view = useFieldViewStore();
    const topLeft = fieldToElement(view, rect.left, rect.top);
    const bottomRight = fieldToElement(view, rect.right, rect.bottom);
    return (
        <rect
            data-testid="fieldMarquee"
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            fill={rgbaToString({ ...theme.shape, a: 0.2 })}
            stroke={rgbaToString(theme.shape)}
            strokeWidth={MARQUEE_WIDTH}
        />
    );
}

/**
 * The lasso's line, dashed: the theme's stroke color, and its
 * next-path green while releasing would close it.
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
            points={points}
            fill="none"
            stroke={rgbaToString(
                lasso.closes ? theme.nextPath : theme.primaryStroke,
            )}
            strokeWidth={LASSO_WIDTH}
            strokeDasharray={LASSO_DASH}
        />
    );
}

/**
 * The line tool: its marchers outlined (dashed, the theme's shape color),
 * the line in the shape color, and dashed pathways in the temporary path
 * color from each marcher to where the line puts it.
 */
function LineToolPreview({
    tool,
    marchers,
    theme,
}: {
    tool: LineToolShape;
    marchers: FieldMarchers;
    theme: FieldTheme;
}) {
    const view = useFieldViewStore();
    // Where the outlined marchers are drawn, as a string so the snapshot is stable
    const outlined = useSyncExternalStore(marchers.subscribe, () =>
        JSON.stringify(drawnAt(marchers, tool.marchers)),
    );
    const shape = rgbaToString(theme.shape);
    const path = rgbaToString(theme.tempPath);
    const z = view.zoom;
    const at = (point: { x: number; y: number }) =>
        fieldToElement(view, point.x, point.y);
    const half = (DOT_RADIUS * dotSizes(z).scale + OUTLINE_GAP) * z;
    const { line } = tool;
    return (
        <g data-testid="fieldLineTool">
            {(JSON.parse(outlined) as { x: number; y: number }[]).map(
                (point, i) => {
                    const center = at(point);
                    return (
                        <rect
                            key={i}
                            x={center.x - half}
                            y={center.y - half}
                            width={half * 2}
                            height={half * 2}
                            fill="none"
                            stroke={shape}
                            strokeWidth={OUTLINE_WIDTH * z}
                            strokeDasharray={OUTLINE_DASH.map(
                                (d) => d * z,
                            ).join(" ")}
                        />
                    );
                },
            )}
            {line && (
                <line
                    x1={at(line.start).x}
                    y1={at(line.start).y}
                    x2={at(line.end).x}
                    y2={at(line.end).y}
                    stroke={shape}
                    strokeWidth={LINE_WIDTH * z}
                />
            )}
            {tool.previews.map(({ id, from, to }) => {
                const a = at(from);
                const b = at(to);
                return (
                    <g key={id}>
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={path}
                            strokeWidth={PATH_WIDTH * z}
                            strokeDasharray={PATH_DASH.map((d) => d * z).join(
                                " ",
                            )}
                        />
                        <circle
                            cx={(a.x + b.x) / 2}
                            cy={(a.y + b.y) / 2}
                            r={PATH_DOT_RADIUS * z}
                            // Midpoints are white whatever the theme
                            fill="white"
                            stroke={path}
                            strokeWidth={PATH_WIDTH * z}
                        />
                        <circle
                            cx={b.x}
                            cy={b.y}
                            r={PATH_DOT_RADIUS * z}
                            fill={path}
                        />
                    </g>
                );
            })}
        </g>
    );
}

/** Where the marchers in `ids` are drawn, skipping any not drawn or hidden. */
function drawnAt(marchers: FieldMarchers, ids: readonly number[]) {
    const wanted = new Set(ids);
    const points: { x: number; y: number }[] = [];
    const { ids: drawn, positions, hidden } = marchers;
    for (let i = 0; i < drawn.length; i++) {
        if (!wanted.has(drawn[i]) || hidden?.[i]) continue;
        points.push({ x: positions[i * 2], y: positions[i * 2 + 1] });
    }
    return points;
}
