import type { PivotKey } from "../frame/frame";
import { create } from "zustand";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { FieldMode } from "@/field/editor/fieldEditor";
import type { ShapeField } from "../field/shapeField";
import type { XY } from "../types";
import { shapeOutline } from "../frame/gestures";
import { outlineGapAt } from "../distribute/outlineGap";
import {
    drillNumbers,
    frameDrawing,
    guideDrawing,
    memoDrawing,
    shapeCursor,
    SPOT_LABEL_LIMIT,
} from "../field/fieldModeBase";
import { currentShapeField, shapeContextFor } from "../field/shapeFieldContext";
import { toolEnvFor } from "./toolEnv";
import type { Roles } from "@/input/modifierRoles";
import { pressShapeKeys, type HeldFieldGesture } from "../field/heldGesture";
import {
    cancelGesture,
    pointerMove,
    press,
    pressTarget,
    release,
    slotsOf,
    startsOf,
    targetsOf,
    type ToolState,
} from "./toolMachine";
import { updateTool, useShapeToolStore } from "./shapeToolStore";
import { ShapeGlide } from "./spotGlide";
import {
    setShapePointerOver,
    shapeCalm,
    useShapePointerStore,
    guideGesture,
} from "../field/shapePointer";

/**
 * `hover`: the spot the pointer rests on, with who will stand there, on shapes too big to label
 * every spot (sims, F1: with 64 nobody could tell who goes where). Null otherwise.
 */
const useSpotHover = create<{
    hover: { at: XY; text: string } | null;
}>(() => ({
    hover: null,
}));

/**
 * Whether the pointer is over the shape, open or a selected placed one, or one of its controls,
 * with no gesture under way (#403, #430): the floating editor is solid then, and fades with the
 * pointer away (#426)
 */
export function useShapePointerOver(): boolean {
    const over = useShapePointerStore((s) => s.over && !s.dragging);
    const gesture = useShapeToolStore((s) => !!s.tool?.gesture);
    return over && !gesture;
}

interface Shown {
    readonly tool: ToolState;
    readonly hover: { at: XY; text: string } | null;
    /** The controls are calm (#403) */
    readonly calm: boolean;
    /** The walks are shown: the pathways toggle (#403) */
    readonly walks: boolean;
    /** The pivot a cell of the editor's pivot menu points at (#437), drawn by `frameDrawing` */
    readonly pivotPreview: PivotKey | null;
    /** A spacing number is being dragged: guides as for a move (#452) */
    readonly scrubbing: boolean;
}
let shown: Shown | null = null;
const shownNow = (): Shown | null => {
    const { tool } = useShapeToolStore.getState();
    if (!tool) return null;
    const { hover } = useSpotHover.getState();
    const calm = shapeCalm(!!tool.gesture);
    const walks = useUiSettingsStore.getState().uiSettings.shapeWalks ?? false;
    const { pivotPreview, scrubbing } = useShapePointerStore.getState();
    if (
        shown?.tool !== tool ||
        shown.hover !== hover ||
        shown.calm !== calm ||
        shown.walks !== walks ||
        shown.pivotPreview !== pivotPreview ||
        shown.scrubbing !== scrubbing
    )
        shown = { tool, hover, calm, walks, pivotPreview, scrubbing };
    return shown;
};

/**
 * `fn` of the tool as it is and the field, worked out once per tool state, field and settings:
 * hovering asks on every pointer move, and a glide on every frame (#455)
 */
function perToolState<T>(fn: (tool: ToolState, field: ShapeField) => T) {
    let last: {
        tool: ToolState;
        fieldProperties: unknown;
        uiSettings: unknown;
        value: T;
    } | null = null;
    return (tool: ToolState, field: ShapeField): T => {
        const { fieldProperties } = field;
        const { uiSettings } = useUiSettingsStore.getState();
        if (
            last?.tool !== tool ||
            last.fieldProperties !== fieldProperties ||
            last.uiSettings !== uiSettings
        )
            last = {
                tool,
                fieldProperties,
                uiSettings,
                value: fn(tool, field),
            };
        return last.value;
    };
}

const slotsNow = perToolState((tool, field) =>
    slotsOf(tool, shapeContextFor(field)),
);
const targetsNow = perToolState((tool, field) =>
    targetsOf(tool, shapeContextFor(field)),
);

/** Notes the spot under the pointer, on a shape that doesn't label every spot */
function hoverAt(tool: ToolState, at: XY, radius: number): void {
    const field = currentShapeField();
    let hover: { at: XY; text: string } | null = null;
    if (
        field &&
        !tool.gesture &&
        tool.params !== null &&
        tool.marchers.length > SPOT_LABEL_LIMIT
    ) {
        const names = drillNumbers(field);
        let best = radius;
        for (const t of targetsNow(tool, field)) {
            const d = Math.hypot(t.to.x - at.x, t.to.y - at.y);
            if (d <= best) {
                best = d;
                hover = { at: t.to, text: names.get(t.id) ?? "" };
            }
        }
    }
    const was = useSpotHover.getState().hover;
    if (was?.text !== hover?.text || was?.at !== hover?.at)
        useSpotHover.setState({ hover });
}

const drawingOf = memoDrawing(
    ({ tool, hover, calm, walks, scrubbing }: Shown) => {
        const field = currentShapeField();
        if (!field) return null;
        const n = tool.spots;
        const spots = slotsNow(tool, field);
        // The marchers' ghosts stand where they start the move: at the start flag (#346, #417). They
        // always show, so where the marchers come from reads; the pathways toggle is only the walks
        // (owner lab feedback on #417)
        const rings = startsOf(tool);
        const ringIds = tool.marchers.map((m) => m.id);
        if (tool.params === null)
            return {
                outline: null,
                spots,
                walks: [],
                handles: [],
                rings,
                ringIds,
            };
        // While a drag draws a new shape: its spots and a dashed outline, no walks yet (06). Every
        // other gesture holds who goes where, so the walks follow it live.
        const drawing = tool.gesture?.type === "draw";
        const targets = drawing ? [] : targetsNow(tool, field);
        const names = drillNumbers(field);
        const env = toolEnvFor(field);
        const gap = drawing ? null : outlineGapAt(tool.kind, tool.params, n);
        const g =
            tool.gesture &&
            tool.gesture.type !== "draw" &&
            tool.gesture.type !== "edit"
                ? tool.gesture
                : null;
        return {
            stage: drawing ? ("drawing" as const) : ("open" as const),
            outline: shapeOutline(tool.kind, tool.params, n),
            spots,
            walks: walks
                ? targets.map((t) => ({ from: t.from, to: t.to }))
                : [],
            rings,
            ringIds,
            // The controls stay at full strength while the pointer is on the shape, a gesture runs or
            // the keyboard is in its editor
            calm,
            gaps: gap ? [gap] : [],
            labels:
                n <= SPOT_LABEL_LIMIT
                    ? targets.map((t) => ({
                          at: t.to,
                          text: names.get(t.id) ?? "",
                      }))
                    : [],
            handles: drawing
                ? []
                : tool.kind.handles(tool.params, n).map((h) => h.at),
            ...(drawing
                ? {}
                : frameDrawing(
                      tool.kind,
                      tool.params,
                      n,
                      g,
                      tool.pointer ?? null,
                      env,
                  )),
            ...guideDrawing(
                tool.kind,
                tool.params,
                n,
                spots,
                guideGesture(tool.gesture, scrubbing),
                env,
                field,
            ),
            ...(hover && !tool.gesture
                ? { labels: [{ at: hover.at, text: hover.text }] }
                : {}),
        };
    },
);

/**
 * The open shape's marchers glide to their new spots when it changes without a gesture (a press
 * of − or +, a layout picked, a quarter turn): the owner picked it in the lab (#387)
 */
const glide = new ShapeGlide();
const glideListeners = new Set<() => void>();
let gliding = false;
/** Counts the glide's frames: the overlay reads the drawing as a snapshot, so one per frame */
let glideStamp = 0;
let glideCache: {
    shown: Shown | null;
    stamp: number;
    drawing: ReturnType<typeof drawingOf>;
} | null = null;

/** Redraws every frame while a glide runs, then once more where it lands */
function glideFrame() {
    glideStamp++;
    glideListeners.forEach((listener) => listener());
    if (glide.active(performance.now())) requestAnimationFrame(glideFrame);
    else {
        gliding = false;
        glideStamp++;
        glideListeners.forEach((listener) => listener());
    }
}

/** {@link glidingDrawing}, worked out once per state and glide frame */
function glidingSnapshot(shown: Shown | null) {
    if (glideCache?.shown !== shown || glideCache.stamp !== glideStamp)
        glideCache = {
            shown,
            stamp: glideStamp,
            drawing: glidingDrawing(shown),
        };
    return glideCache.drawing;
}

/** People who ask their system for less motion get no glide, as the timeline's follow does */
const reducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The drawing, with each marcher's spot, walk and label part way to where it's going while a
 * glide runs: a change without a gesture slides, not jumps
 */
function glidingDrawing(shown: Shown | null) {
    const drawing = drawingOf(shown);
    if (!shown) {
        // Closed: whatever opens next starts afresh (review on #459)
        glide.reset();
        return drawing;
    }
    const { tool } = shown;
    const field = currentShapeField();
    if (!drawing || tool.params === null || !field || reducedMotion())
        return drawing;
    const targets = targetsNow(tool, field);
    const now = performance.now();
    glide.update(
        {
            // The marchers it opened with: a new list is another shape, opened or brought back
            session: tool.marchers,
            kind: tool.kind,
            params: tool.params,
            rotation: tool.kind.frameOf(tool.params, tool.spots).rotation,
            gesture: tool.gesture !== null && tool.gesture !== undefined,
        },
        targets,
        drawing,
        now,
    );
    const at = glide.positions(now);
    if (!at) return drawing;
    if (!gliding) {
        gliding = true;
        requestAnimationFrame(glideFrame);
    }
    const shownAt = (t: { id: number; to: XY }) => at.get(t.id) ?? t.to;
    const labels = drawing.labels ?? [];
    return {
        ...drawing,
        ...glide.frame(now, drawing),
        gliding: true,
        spots:
            drawing.spots.length === targets.length
                ? targets.map(shownAt)
                : drawing.spots,
        walks: shown.walks
            ? targets.map((t) => ({ from: t.from, to: shownAt(t) }))
            : [],
        labels:
            labels.length === targets.length
                ? labels.map((l, i) => ({ ...l, at: shownAt(targets[i]!) }))
                : labels,
    };
}

/** The env for the roles held: a dragged pivot also snaps to the open shape's spots (#350) */
const envOf = (field: ShapeField, tool: ToolState, roles?: Roles) =>
    toolEnvFor(field, roles, {
        spots: () => slotsOf(tool, shapeContextFor(field)),
    });

/** The held roles of the gesture under way, from its press to its end */
let held: HeldFieldGesture | null = null;

const endHeld = () => {
    held?.end();
    held = null;
};

/** A role key pressed or released mid-drag: the last move again, at the last pointer */
function rerun(at: XY, roles: Roles) {
    const field = currentShapeField();
    if (!field) return;
    updateTool((t) => pointerMove(t, at, envOf(field, t, roles)));
}

/**
 * Escape mid-gesture: the shape as it was at the press, and the keys no longer followed, though
 * the pointer is still down
 */
export function cancelShapeGesture(): void {
    endHeld();
    updateTool(cancelGesture);
}

/**
 * The open shape tool on the field (docs/timeline/research/shapes/06-box-v1.md): a field editor
 * mode that takes every edit press while the tool is open and hands it to the tool's state
 * machine, so nothing selects, drags or lassos underneath. Navigation keeps its presses (right and
 * middle drags, the wheel). Alt is `fromCenter` here (version A, through `pressShapeKeys`), not a
 * pan.
 */
export const shapeToolMode: FieldMode = {
    claims: () => useShapeToolStore.getState().tool !== null,
    press(pointer, { isMac }) {
        const field = currentShapeField();
        const tool = useShapeToolStore.getState().tool;
        if (!field || !tool) return;
        endHeld();
        const pressed = pressShapeKeys(
            pointer,
            { kind: tool.kind, params: tool.params, n: tool.spots },
            (reachInside) =>
                pressTarget(tool, pointer.field, {
                    ...envOf(field, tool),
                    reachInside,
                }),
            rerun,
            isMac,
        );
        held = pressed.held;
        const roles = held.roles();
        updateTool((t) =>
            press(t, pointer.field, {
                ...envOf(field, t, roles),
                reachInside: pressed.reachInside,
            }),
        );
    },
    move(pointer) {
        const field = currentShapeField();
        if (!field) return;
        const roles = held?.move(pointer);
        updateTool((t) =>
            pointerMove(t, pointer.field, envOf(field, t, roles)),
        );
    },
    release(_pointer, click) {
        endHeld();
        const field = currentShapeField();
        if (!field) return;
        updateTool((t) => release(t, shapeContextFor(field), click));
    },
    cancel: cancelShapeGesture,
    cursorAt(pointer) {
        const tool = useShapeToolStore.getState().tool;
        const field = currentShapeField();
        if (!tool || !field) return null;
        const env = envOf(field, tool);
        // The editor asks for the cursor as the pointer moves, so this is where hovering is seen
        hoverAt(tool, pointer.field, env.hitRadius);
        const target = pressTarget(tool, pointer.field, env);
        setShapePointerOver(target.type !== "draw");
        if (target.type === "draw") return "crosshair";
        return shapeCursor(tool.kind, tool.params, tool.spots, target);
    },
    leave() {
        setShapePointerOver(false);
        if (useSpotHover.getState().hover)
            useSpotHover.setState({ hover: null });
    },
    drawing: () => glidingSnapshot(shownNow()),
    subscribe: (listener) => {
        const offTool = useShapeToolStore.subscribe(listener);
        const offHover = useSpotHover.subscribe(listener);
        const offPointer = useShapePointerStore.subscribe(listener);
        const offSettings = useUiSettingsStore.subscribe(listener);
        glideListeners.add(listener);
        return () => {
            offTool();
            offHover();
            offPointer();
            offSettings();
            glideListeners.delete(listener);
        };
    },
    // The tool's handles move the shape; the marchers stay put until Place
    ownsSelectionBox: true,
    locksSelection: true,
    // The field's menu acts on the selection, not the shape being edited
    blocksFieldMenu: true,
    gesture: { kind: "shape", always: true },
};
