import { rgbaToString, type FieldTheme } from "@openmarch/core";
import { useShapeGuidesStore } from "@/shapes/field/shapeGuides";
import { resolveMarcherLook } from "@/entity-components/appearance";
import type { FieldModeDrawing, FieldPoint } from "@/field/editor/fieldEditor";
import type {
    FieldTestApi,
    FieldTestGesture,
    FieldTestHandle,
    FieldTestImage,
    FieldTestItem,
    FieldTestLook,
    FieldTestPropTool,
    FieldTestMarcher,
    FieldTestPlacedBox,
    FieldTestShapeOverlay,
    ScreenPoint,
} from "@/field/fieldTestApi";
import { canvasPixelRatio, useFieldQualityStore } from "@/field/fieldQuality";
import type { PropToolShape } from "@/field/editor/propTool";
import type { FieldMarchers } from "./fieldMarchers";
import type { FieldItems } from "./fieldItems";
import { fieldToElement, type FieldViewState } from "./fieldView";
import type { CurrentFieldQuality } from "./useFieldQuality";
import { marchersHiddenNow, shapeAlone } from "@/shapes/field/marchersHidden";

/** What the field test API reads from the new field. */
export type ThreeFieldState = {
    marchers: FieldMarchers;
    /** Each marcher's drill number, by id. */
    labels(): ReadonlyMap<number, string>;
    view(): FieldViewState;
    /** The element the field draws into, or null before it mounts. */
    element(): HTMLElement | null;
    pageId(): number | null;
    quality(): CurrentFieldQuality;
    contextLost(): boolean;
    /** The field image as `BackgroundImageLayer` draws it, or null. */
    fieldImage(): FieldTestImage | null;
    theme(): FieldTheme;
    /** Whether a marcher is drawn dimmed (#201). */
    dimmed(id: number): boolean;
    /** How opaque a marcher's dot is drawn, and whether its label is (#417) */
    opacity(id: number): number;
    labelShown(id: number): boolean;
    /** Whether a marcher is drawn Not defined (a dashed edge) (#478): never while dimmed or playing. */
    notDefined(id: number): boolean;
    /** Whether a marcher's label is drawn bold: on a keyframe, playing or dimmed (#478). */
    labelBold(id: number): boolean;
    /** The app's selection, as the editor reads it. */
    selection(): readonly number[];
    activeGesture(): FieldTestGesture | null;
    /** The selection box's handles as drawn, in field units, or null with no box (#198). */
    handles(): Record<FieldTestHandle, FieldPoint> | null;
    /** What the editor's mode draws (the shape tool, a selected placed box), or null (#204). */
    modeDrawing(): FieldModeDrawing | null;
    /** The placed boxes outlined on the field (#204). */
    placedBoxes(): readonly FieldTestPlacedBox[];
    /** The items drawn (C2.1). */
    items: FieldItems;
    /** The editor's prop tool, or null when it's off (C2.1). */
    propTool(): PropToolShape | null;
};

/**
 * The field test API over the new field. Read-only. Selection and gestures
 * come from the editor (#193), a pan from navigation (#194), and the handles
 * from the overlay's selection box (#198).
 */
export function createThreeFieldTestApi(field: ThreeFieldState): FieldTestApi {
    return {
        marchers() {
            const element = field.element();
            if (!element) return [];
            const rect = element.getBoundingClientRect();
            const view = field.view();
            const labels = field.labels();
            const { ids, positions, stacks } = field.marchers;
            const theme = field.theme();
            return ids.map((id, i): FieldTestMarcher => {
                const x = positions[i * 2];
                const y = positions[i * 2 + 1];
                const at = fieldToElement(view, x, y);
                const screen = { x: rect.x + at.x, y: rect.y + at.y };
                return {
                    id,
                    label: labels.get(id) ?? "",
                    x,
                    y,
                    screen,
                    onScreen:
                        screen.x > rect.left &&
                        screen.x < rect.right &&
                        screen.y > rect.top &&
                        screen.y < rect.bottom,
                    look: lookOf(stacks[i] ?? [], theme),
                    dimmed: field.dimmed(id),
                    opacity: field.opacity(id),
                    labelShown: field.labelShown(id),
                    notDefined: field.notDefined(id),
                    labelBold: field.labelBold(id),
                };
            });
        },
        selection: () => [...field.selection()].sort((a, b) => a - b),
        viewport() {
            const { zoom, panX, panY } = field.view();
            return { zoom, pan: { x: panX, y: panY } };
        },
        handles: () => handlesOnScreen(field),
        activeGesture: () =>
            field.view().panning ? "pan" : field.activeGesture(),
        pageId: () => field.pageId(),
        quality() {
            const { mode, reason, settings } = field.quality();
            const gl = useFieldQualityStore.getState().gl;
            return {
                mode,
                reason,
                gl: gl?.kind ?? null,
                renderer: gl?.renderer ?? null,
                pixelRatio: canvasPixelRatio(field.element()),
                labelsHiddenBelow: settings.labelFadeFrom,
                contextLost: field.contextLost(),
            };
        },
        fieldImage: () => field.fieldImage(),
        shapeOverlay: () => shapeOverlayOf(field),
        marchersShown: () => !marchersHiddenNow(),
        placedBoxes: () =>
            field.placedBoxes().map(({ id, label, rect }) => ({
                id,
                label,
                rect: { ...rect },
            })),
        items: () => itemsOnScreen(field),
        propTool: () => propToolOf(field),
    };
}

/** A marcher's look as the marcher and label layers draw it (`marcherLooks.ts`). */
function lookOf(
    stack: Parameters<typeof resolveMarcherLook>[0],
    theme: FieldTheme,
): FieldTestLook {
    const look = resolveMarcherLook(stack, theme);
    const common = {
        visible: look.visible,
        labelVisible: look.labelVisible,
        labelColor: rgbaToString(theme.defaultMarcher.label),
    };
    if (look.shape === "cross")
        return {
            ...common,
            shape: "x",
            fill: rgbaToString(look.crossColor),
            outline: null,
        };
    return {
        ...common,
        shape: look.shape,
        fill: rgbaToString(look.fill),
        outline: rgbaToString(look.outline),
    };
}

/** A shape's construction as the test API reads it, with what the Guides menu shows (#634) */
function constructionOf(
    drawing: FieldModeDrawing,
    copy: (p: { x: number; y: number }) => { x: number; y: number },
): FieldTestShapeOverlay["construction"] {
    const { shown } = useShapeGuidesStore.getState();
    return (drawing.construction ?? []).map(
        ({ center, rx, ry, rotation, spokes }) => ({
            center: copy(center),
            rx,
            ry,
            rotation,
            shown: shown.circle,
            spokes: shown.angles ? (spokes ?? []).map(copy) : [],
        }),
    );
}

/** What the editor's mode draws, with its handles in viewport CSS px (#204). */
function shapeOverlayOf(field: ThreeFieldState): FieldTestShapeOverlay | null {
    const drawn = field.modeDrawing();
    const element = field.element();
    if (!drawn || !element) return null;
    // As drawn: on its own while H hides the shape's marchers (#558)
    const drawing = marchersHiddenNow() ? shapeAlone(drawn) : drawn;
    const rect = element.getBoundingClientRect();
    const view = field.view();
    const copy = (p: FieldPoint) => ({ x: p.x, y: p.y });
    return {
        outline: drawing.outline && drawing.outline.map(copy),
        spots: drawing.spots.map(copy),
        walks: drawing.walks.map(({ from, to }) => ({
            from: copy(from),
            to: copy(to),
        })),
        handles: drawing.handles.map(screen),
        addHandles: (drawing.addHandles ?? []).map(screen),
        selectedHandles: (drawing.selectedHandles ?? []).map(screen),
        barHandles: (drawing.barHandles ?? []).map((h) => ({
            at: screen(h.at),
            from: screen(h.from),
        })),
        rings: (drawing.rings ?? []).map(copy),
        gaps: (drawing.gaps ?? []).map(copy),
        construction: constructionOf(drawing, copy),
        stage: drawing.stage ?? null,
        knob: drawing.knob ? screen(drawing.knob.at) : null,
        centerDot: drawing.centerDot ? screen(drawing.centerDot) : null,
        pivotMark: drawing.pivotMark ? screen(drawing.pivotMark) : null,
        pivotPreview: drawing.pivotPreview ? copy(drawing.pivotPreview) : null,
        labels: (drawing.labels ?? []).map((l) => l.text),
        tip: drawing.tip?.text ?? null,
        gliding: drawing.gliding === true,
        calm: drawing.calm === true,
        guides: (drawing.guides ?? []).map(({ from, to, label }) => ({
            from: copy(from),
            to: copy(to),
            label: label ?? null,
        })),
        guideEdges: (drawing.guideEdges ?? []).map(({ from, to }) => ({
            from: copy(from),
            to: copy(to),
        })),
        guideMarks: (drawing.guideMarks ?? []).map(copy),
        onGuides: (drawing.onGuides ?? []).map(copy),
        groupMarks: (drawing.groupMarks ?? []).map(({ at, shade, group }) => ({
            ...copy(at),
            shade,
            group,
        })),
        groupLabels: (drawing.groupLabels ?? []).map(({ at, text, seam }) => ({
            ...copy(at),
            text,
            seam,
        })),
        offsetStep: drawing.offsetStep
            ? {
                  from: copy(drawing.offsetStep.from),
                  corner: copy(drawing.offsetStep.corner),
                  to: copy(drawing.offsetStep.to),
                  across: drawing.offsetStep.across,
                  deep: drawing.offsetStep.deep,
              }
            : null,
    };
    function screen(at: FieldPoint) {
        const { x, y } = fieldToElement(view, at.x, at.y);
        return { x: rect.x + x, y: rect.y + y };
    }
}

/** The prop tool as the field shows it, or null when it's off. */
function propToolOf(field: ThreeFieldState): FieldTestPropTool | null {
    const tool = field.propTool();
    if (!tool) return null;
    return {
        outlineType: tool.outlineType,
        preview: tool.preview && {
            points: tool.preview.points.map((p) => ({ ...p })),
            closed: tool.preview.closed,
        },
    };
}

/** The items drawn, by ascending marcher id, with their centers in viewport CSS px. */
function itemsOnScreen(field: ThreeFieldState): FieldTestItem[] {
    const element = field.element();
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    const view = field.view();
    return field.items
        .outlines()
        .map(({ id, center, geometry }): FieldTestItem => {
            const at = fieldToElement(view, center.x, center.y);
            return {
                id,
                outlineType: geometry.outlineType,
                width: geometry.width,
                depth: geometry.depth,
                rotation: geometry.rotation,
                x: center.x,
                y: center.y,
                screen: { x: rect.x + at.x, y: rect.y + at.y },
            };
        })
        .sort((a, b) => a.id - b.id);
}

/** The selection box's handles as drawn, in viewport CSS px, or null with none. */
function handlesOnScreen(
    field: ThreeFieldState,
): Record<FieldTestHandle, ScreenPoint> | null {
    const element = field.element();
    const handles = field.handles();
    if (!element || !handles) return null;
    const rect = element.getBoundingClientRect();
    const view = field.view();
    const screen = {} as Record<FieldTestHandle, ScreenPoint>;
    for (const [id, at] of Object.entries(handles)) {
        const { x, y } = fieldToElement(view, at.x, at.y);
        screen[id as FieldTestHandle] = { x: rect.x + x, y: rect.y + y };
    }
    return screen;
}
