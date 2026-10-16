import { rgbaToString, type FieldTheme } from "@openmarch/core";
import { resolveMarcherLook } from "@/entity-components/appearance";
import type { FieldPoint } from "@/field/editor/fieldEditor";
import type {
    FieldTestApi,
    FieldTestGesture,
    FieldTestHandle,
    FieldTestImage,
    FieldTestLook,
    FieldTestMarcher,
    ScreenPoint,
} from "@/field/fieldTestApi";
import { canvasPixelRatio, useFieldQualityStore } from "@/field/fieldQuality";
import type { LineToolShape } from "@/field/editor/lineTool";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, type FieldViewState } from "./fieldView";
import type { CurrentFieldQuality } from "./useFieldQuality";

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
    /** The app's selection, as the editor reads it. */
    selection(): readonly number[];
    activeGesture(): FieldTestGesture | null;
    /** The selection box's handles as drawn, in field units, or null with no box (#198). */
    handles(): Record<FieldTestHandle, FieldPoint> | null;
    /** The editor's line tool, or null when it's off (#203). */
    lineTool(): LineToolShape | null;
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
        lineTool() {
            const tool = field.lineTool();
            if (!tool) return null;
            const { line } = tool;
            return {
                marchers: [...tool.marchers].sort((a, b) => a - b),
                line: line && {
                    start: { ...line.start },
                    end: { ...line.end },
                    drawing: line.drawing,
                },
                previews: tool.previews
                    .map(({ id, to }) => ({ id, ...to }))
                    .sort((a, b) => a.id - b.id),
            };
        },
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
