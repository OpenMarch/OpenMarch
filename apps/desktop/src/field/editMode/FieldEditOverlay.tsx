import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Checkpoint, FieldProperties } from "@openmarch/core";
import clsx from "clsx";
import { T, useTranslate } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import { useFieldViewStore } from "@/field/three/fieldView";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { isToggleOn } from "@/stores/TouchModifierStore";
import {
    DRAG_SNAP_STEPS,
    FINE_DRAG_SNAP_STEPS,
    dragOverRuler,
    dragSteps,
    fieldScreenRect,
    fieldToSteps,
    lineKey,
    lineLabel,
    lineReadout,
    lineScreen,
    linesInBox,
    linesOn,
    linePadPx,
    overRuler,
    rulerPx,
    sameLine,
    screenToField,
    stepsToField,
    toRef,
    type FieldLineRef,
} from "./lines";
import {
    boxSelect,
    clickLine,
    existingSelection,
    isSelected,
    selectionForEdit,
    selectionWithTwins,
} from "./lineSelection";
import {
    fieldEditMode,
    useFieldEditModeStore,
    type FieldEditDrag,
} from "./fieldEditModeStore";
import { useApplyFieldEdits } from "./useApplyFieldEdits";
import {
    addLineEdit,
    deleteLinesEdit,
    moveLineEdit,
    nudgeLinesEdit,
} from "./lineCommands";
import { selectAdded } from "./useFieldEditModeActions";
import { LineReadoutText } from "./LineReadoutText";

/** How far a press moves before it's a drag, in CSS px: a finger wanders more than a mouse */
const DRAG_START_PX = { mouse: 3, touch: 8 } as const;

type Press =
    | {
          kind: "line";
          pointerId: number;
          pointerType: string;
          start: { x: number; y: number };
          line: Checkpoint;
          additive: boolean;
          wasSelected: boolean;
          dragging: boolean;
          /** The lines a drag moves */
          moving: FieldLineRef[];
          /**
           * Whether letting go over the ruler deletes: from the field at once; from a ruler tab
           * only once the drag has left the ruler (sliding a tab along it moves the line)
           */
          armed: boolean;
      }
    | {
          kind: "ruler";
          pointerId: number;
          axis: "x" | "y";
          start: { x: number; y: number };
          dragging: boolean;
      }
    | {
          kind: "box";
          pointerId: number;
          pointerType: string;
          start: { x: number; y: number };
          end: { x: number; y: number };
          additive: boolean;
          dragging: boolean;
      };

/**
 * The Edit field mode on the canvas (#824): rulers along the top (X lines) and left (Y lines),
 * the lines as things to pick and drag, and a box to pick many. Only geometry happens here: a
 * line's values are shown and changed in the Lines tab's Line section. Covers the field while the
 * mode is on, so marchers can't be picked; the wheel and pan
 * drags still reach the field's navigation.
 *
 * - Drag out of a ruler to add a line (with Mirror on, its twin too), a line to move it, and a
 *   line back into its ruler to delete it. Whole steps; half steps with Shift (or the touch pill's
 *   Fine). A readout says where.
 * - Click a line or its ruler tab to pick it, Shift-click to add, drag a box over the field to
 *   pick the lines it crosses. Double-click (or tap a picked line) to type its position in the
 *   panel; right-click picks it.
 */
export function FieldEditOverlay({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const view = useFieldViewStore();
    const isTouch = useIsTouchMode();
    const apply = useApplyFieldEdits();
    const storedSelection = useFieldEditModeStore((s) => s.selection);
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const hover = useFieldEditModeStore((s) => s.hover);
    const drag = useFieldEditModeStore((s) => s.drag);
    const selectMany = useFieldEditModeStore((s) => s.selectMany);
    const selection = existingSelection(fp, storedSelection);
    // With Mirror on, hovering a line lights its twin too, as picking it does
    const hoverKeys = useMemo(
        () =>
            new Set(
                selectionWithTwins(fp, hover ? [hover] : [], mirror).map((r) =>
                    lineKey(r),
                ),
            ),
        [fp, hover, mirror],
    );
    const hasPick = selection.length > 0;
    // An undo can take a picked line away: forget it
    useEffect(() => {
        if (selection !== storedSelection) fieldEditMode.select(selection);
    }, [selection, storedSelection]);
    const ruler = rulerPx(isTouch);

    const root = useRef<HTMLDivElement>(null);
    const press = useRef<Press | null>(null);
    const [box, setBox] = useState<{
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    } | null>(null);
    const [pointerAt, setPointerAt] = useState<{ x: number; y: number } | null>(
        null,
    );

    const local = (event: { clientX: number; clientY: number }) => {
        const rect = root.current?.getBoundingClientRect();
        return {
            x: event.clientX - (rect?.left ?? 0),
            y: event.clientY - (rect?.top ?? 0),
        };
    };
    const snapFor = (event: { shiftKey: boolean }) =>
        event.shiftKey || isToggleOn("fine")
            ? FINE_DRAG_SNAP_STEPS
            : DRAG_SNAP_STEPS;
    const cancel = useCallback(() => {
        press.current = null;
        setBox(null);
        setPointerAt(null);
        fieldEditMode.setDrag(null);
    }, []);
    // Escape during a press lets go of it without changing anything, whether or not it has
    // started to drag; it doesn't also leave the mode (or drop the pick) while the button is held
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !press.current) return;
            event.preventDefault();
            event.stopPropagation();
            cancel();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [cancel]);
    useEffect(() => cancel, [cancel]);
    // A press on the field takes the keyboard there, so Tab walks lines rather than the
    // panel's controls (F6 moves between the field and the Field panel)
    const focusField = () => root.current?.focus({ preventScroll: true });
    // Opening the Lines tab gives the field the keyboard, wherever it was opened from (the tab,
    // the palette). After the press that opened it: a tab takes focus when it's pressed
    useEffect(() => {
        const later = setTimeout(() =>
            root.current?.focus({ preventScroll: true }),
        );
        return () => clearTimeout(later);
    }, []);

    const rect = fieldScreenRect(fp, view);
    const highlighted = useMemo(
        () =>
            new Set(
                selectionWithTwins(fp, selection, mirror).map((r) =>
                    lineKey(r),
                ),
            ),
        [fp, selection, mirror],
    );

    /* -------------------------------------------------------------- presses on a line */

    const onLineDown = (
        event: React.PointerEvent,
        line: Checkpoint,
        fromTab = false,
    ) => {
        if (event.button !== 0 || press.current) return;
        event.stopPropagation();
        focusField();
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        const ref = toRef(line);
        const additive = event.shiftKey || selectMany;
        const wasSelected = isSelected(selection, ref);
        // Picked on press, so a drag moves what's under the pointer
        if (!wasSelected)
            fieldEditMode.select(clickLine(selection, ref, additive));
        const current = fieldEditMode.get().selection;
        const sameAxis = current.filter((r) => r.axis === line.axis);
        press.current = {
            kind: "line",
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            start: local(event),
            line,
            additive,
            wasSelected,
            dragging: false,
            // The pressed line first: it's the one the drag puts under the pointer
            moving:
                isSelected(current, ref) && sameAxis.length > 1
                    ? [ref, ...sameAxis.filter((r) => !sameLine(r, ref))]
                    : [ref],
            armed: !fromTab,
        };
    };

    const onRulerDown = (event: React.PointerEvent, axis: "x" | "y") => {
        if (event.button !== 0 || press.current) return;
        event.stopPropagation();
        focusField();
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        press.current = {
            kind: "ruler",
            pointerId: event.pointerId,
            axis,
            start: local(event),
            dragging: false,
        };
    };

    const onSurfaceDown = (event: React.PointerEvent) => {
        // A finger on the open field pans it (navigation); a mouse or pen draws a box
        if (event.button !== 0 || press.current) return;
        focusField();
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        const at = local(event);
        press.current = {
            kind: "box",
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            start: at,
            end: at,
            additive: event.shiftKey || selectMany,
            dragging: false,
        };
    };

    const onMove = (event: React.PointerEvent) => {
        const at = local(event);
        // Where X and Y add a line: the pointer, while it's over the field
        const inField =
            at.x >= rect.left &&
            at.x <= rect.right &&
            at.y >= rect.top &&
            at.y <= rect.bottom;
        fieldEditMode.setPointer(
            inField
                ? {
                      x: fieldToSteps(fp, "x", screenToField(view, "x", at.x)),
                      y: fieldToSteps(fp, "y", screenToField(view, "y", at.y)),
                  }
                : null,
        );
        const p = press.current;
        if (!p || p.pointerId !== event.pointerId) return;
        setPointerAt(at);
        const threshold =
            event.pointerType === "mouse"
                ? DRAG_START_PX.mouse
                : DRAG_START_PX.touch;
        if (
            !p.dragging &&
            Math.hypot(at.x - p.start.x, at.y - p.start.y) < threshold
        )
            return;
        p.dragging = true;
        if (p.kind === "box") {
            if (p.pointerType === "touch") return;
            p.end = at;
            setBox({ x0: p.start.x, y0: p.start.y, x1: at.x, y1: at.y });
            return;
        }
        const axis = p.kind === "ruler" ? p.axis : p.line.axis;
        const steps = dragSteps(
            fp,
            view,
            axis,
            axis === "x" ? at.x : at.y,
            snapFor(event),
        );
        let over: boolean;
        if (p.kind === "line") {
            const drop = dragOverRuler(axis, at, p.armed, ruler);
            p.armed = drop.armed;
            over = drop.over;
        } else over = overRuler(axis, at, ruler);
        const next: FieldEditDrag = {
            kind: p.kind === "ruler" ? "add" : "move",
            axis,
            steps,
            overRuler: over,
            lines: p.kind === "line" ? p.moving : [],
        };
        fieldEditMode.setDrag(next);
    };

    const onUp = (event: React.PointerEvent) => {
        const p = press.current;
        if (!p || p.pointerId !== event.pointerId) return;
        press.current = null;
        const current = fieldEditMode.get().drag;
        fieldEditMode.setDrag(null);
        setBox(null);
        setPointerAt(null);
        if (p.kind === "box") {
            if (p.dragging && p.pointerType !== "touch") {
                const lines = linesInBox(fp, view, {
                    x0: p.start.x,
                    y0: p.start.y,
                    x1: p.end.x,
                    y1: p.end.y,
                });
                fieldEditMode.select(boxSelect(selection, lines, p.additive));
            } else if (!p.dragging && !p.additive) fieldEditMode.select([]);
            return;
        }
        if (p.kind === "ruler") {
            if (!p.dragging || !current || current.overRuler) return;
            void apply(addLineEdit(p.axis, current.steps, mirror)).then(
                selectAdded,
            );
            return;
        }
        // A line
        const ref = toRef(p.line);
        if (!p.dragging || !current) {
            if (p.wasSelected && p.additive)
                fieldEditMode.select(clickLine(selection, ref, true));
            else if (p.wasSelected && !p.additive) {
                // A tap on a picked line goes to its position in the panel (touch); a click picks
                // it alone
                if (p.pointerType !== "mouse" && selection.length === 1)
                    fieldEditMode.editPosition(ref);
                else fieldEditMode.select([ref]);
            }
            return;
        }
        if (current.overRuler) {
            const edit = deleteLinesEdit(fp, p.moving, mirror);
            if (edit)
                void apply(edit).then((result) => {
                    if (result?.diff.ok) fieldEditMode.select([]);
                });
            return;
        }
        const by = current.steps - p.line.stepsFromCenterFront;
        if (Math.abs(by) < 1e-9) return;
        const edit =
            p.moving.length > 1
                ? nudgeLinesEdit(fp, p.moving, p.line.axis, by, mirror)
                : moveLineEdit(ref, current.steps, mirror);
        if (edit) void apply(edit);
    };

    const onLostCapture = (event: React.PointerEvent) => {
        if (press.current?.pointerId === event.pointerId) cancel();
    };

    /* -------------------------------------------------------------- drawing */

    const width = view.width;
    const height = view.height;
    const lines = [...linesOn(fp, "x"), ...linesOn(fp, "y")];
    const dragged = new Set((drag?.lines ?? []).map(lineKey));
    const ghost = drag && !drag.overRuler ? ghostLines(fp, drag, mirror) : [];
    const stepPx = fp.pixelsPerStep * view.zoom;
    const touchPad = linePadPx(isTouch);

    return (
        <div
            ref={root}
            data-field-edit-overlay
            data-field-edit-pane="field"
            data-testid="field-edit-overlay"
            tabIndex={-1}
            aria-label={t("fieldEditMode.fieldPane")}
            className={clsx(
                "focus-visible:outline-accent absolute inset-0 z-30 touch-none outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2",
                drag?.overRuler && "cursor-not-allowed",
            )}
            // Presses take the keyboard themselves (focusField). The mouse events a browser sends
            // after a tap mustn't take it back from the panel's Position, where a tap on a picked
            // line puts it
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onLostCapture}
            onLostPointerCapture={onLostCapture}
            onPointerLeave={() => fieldEditMode.setPointer(null)}
        >
            {/* The open field: a box picks lines (mouse, pen); a tap there clears the pick */}
            <div
                className="absolute inset-0"
                data-testid="field-edit-surface"
                onPointerDown={onSurfaceDown}
            />
            <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
            >
                {lines.map((c) => {
                    const key = lineKey(toRef(c));
                    const at = lineScreen(fp, view, c);
                    const lit = highlighted.has(key);
                    const hovered = hoverKeys.has(key);
                    const moving = dragged.has(key);
                    // Hidden lines are drawn faint here, so they can be found and picked
                    if (!lit && !hovered && c.visible && !moving) return null;
                    const [x1, y1, x2, y2] =
                        c.axis === "x"
                            ? [at, rect.top, at, rect.bottom]
                            : [rect.left, at, rect.right, at];
                    return (
                        <line
                            key={key}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            // A picked line is thick accent; a hovered one is a little thinner and faint, so it never reads as picked (roast)
                            className={clsx(
                                lit || hovered
                                    ? "stroke-accent"
                                    : "stroke-text-subtitle",
                                moving && "opacity-40",
                            )}
                            strokeWidth={lit ? 4 : hovered ? 3 : 1}
                            strokeDasharray={
                                c.visible ? undefined : lit ? "6 4" : "3 5"
                            }
                            opacity={
                                lit ? 1 : hovered ? 0.4 : !c.visible ? 0.7 : 1
                            }
                        />
                    );
                })}
                {ghost.map((g, i) => {
                    const at = fieldToScreenAxis(fp, view, g.axis, g.steps);
                    const [x1, y1, x2, y2] =
                        g.axis === "x"
                            ? [at, rect.top, at, rect.bottom]
                            : [rect.left, at, rect.right, at];
                    return (
                        <line
                            key={i}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            className="stroke-accent"
                            strokeWidth={2}
                            strokeDasharray={g.twin ? "4 4" : undefined}
                        />
                    );
                })}
                {box && (
                    <rect
                        x={Math.min(box.x0, box.x1)}
                        y={Math.min(box.y0, box.y1)}
                        width={Math.abs(box.x1 - box.x0)}
                        height={Math.abs(box.y1 - box.y0)}
                        className="fill-accent/10 stroke-accent"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                    />
                )}
            </svg>

            {/* Each line, to pick, drag or double-click */}
            {lines.map((c) => {
                const at = lineScreen(fp, view, c);
                const ref = toRef(c);
                if (
                    c.axis === "x"
                        ? at < -10 || at > width + 10
                        : at < -10 || at > height + 10
                )
                    return null;
                const style =
                    c.axis === "x"
                        ? {
                              left: at - touchPad,
                              width: touchPad * 2,
                              top: Math.max(rect.top, ruler),
                              height: Math.max(
                                  0,
                                  Math.min(rect.bottom, height) -
                                      Math.max(rect.top, ruler),
                              ),
                          }
                        : {
                              top: at - touchPad,
                              height: touchPad * 2,
                              left: Math.max(rect.left, ruler),
                              width: Math.max(
                                  0,
                                  Math.min(rect.right, width) -
                                      Math.max(rect.left, ruler),
                              ),
                          };
                return (
                    <div
                        key={lineKey(ref)}
                        role="button"
                        tabIndex={-1}
                        aria-label={lineLabel(fp, c)}
                        aria-pressed={isSelected(selection, ref)}
                        data-field-line={lineKey(ref)}
                        className={clsx(
                            "absolute",
                            c.axis === "x"
                                ? "cursor-ew-resize"
                                : "cursor-ns-resize",
                        )}
                        style={style}
                        onPointerDown={(e) => onLineDown(e, c)}
                        onPointerEnter={() => fieldEditMode.setHover(ref)}
                        onPointerLeave={() =>
                            fieldEditMode.get().hover &&
                            sameLine(fieldEditMode.get().hover!, ref) &&
                            fieldEditMode.setHover(null)
                        }
                        onDoubleClick={() => fieldEditMode.editPosition(ref)}
                        // Right-click only picks: a line's values are in the panel
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (!isSelected(selection, ref))
                                fieldEditMode.select([ref]);
                        }}
                    />
                );
            })}

            <Ruler
                axis="x"
                fp={fp}
                view={view}
                length={width}
                stepPx={stepPx}
                thickness={ruler}
                touch={isTouch}
                highlighted={highlighted}
                hoverKeys={hoverKeys}
                onRulerDown={onRulerDown}
                onLineDown={onLineDown}
                onLineDoubleClick={(ref) => fieldEditMode.editPosition(ref)}
                onRulerDoubleClick={(axis, pixel) =>
                    void apply(
                        addLineEdit(
                            axis,
                            dragSteps(fp, view, axis, pixel),
                            mirror,
                        ),
                    ).then(selectAdded)
                }
                title={t("fieldEditMode.ruler.x")}
            />
            <Ruler
                axis="y"
                fp={fp}
                view={view}
                length={height}
                stepPx={stepPx}
                thickness={ruler}
                touch={isTouch}
                highlighted={highlighted}
                hoverKeys={hoverKeys}
                onRulerDown={onRulerDown}
                onLineDown={onLineDown}
                onLineDoubleClick={(ref) => fieldEditMode.editPosition(ref)}
                onRulerDoubleClick={(axis, pixel) =>
                    void apply(
                        addLineEdit(
                            axis,
                            dragSteps(fp, view, axis, pixel),
                            mirror,
                        ),
                    ).then(selectAdded)
                }
                title={t("fieldEditMode.ruler.y")}
            />
            {/* The corner where the rulers meet */}
            <div
                className="bg-fg-1 border-stroke absolute top-0 left-0 z-10 border-r border-b"
                style={{ width: ruler, height: ruler }}
            />

            {drag && pointerAt && (
                <div
                    data-testid="field-edit-readout"
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal text-sub pointer-events-none absolute z-20 border px-8 py-4 whitespace-nowrap tabular-nums"
                    style={{
                        left: Math.min(
                            pointerAt.x + 14,
                            Math.max(0, width - 260),
                        ),
                        top: Math.min(
                            pointerAt.y + 14,
                            Math.max(0, height - 60),
                        ),
                    }}
                >
                    {drag.overRuler ? (
                        drag.kind === "move" ? (
                            <span className="text-red">
                                {t("fieldEditMode.readout.releaseToDelete", {
                                    count: drag.lines.length,
                                })}
                            </span>
                        ) : (
                            t("fieldEditMode.readout.dragOut")
                        )
                    ) : (
                        <LineReadoutText
                            readout={lineReadout(
                                fp,
                                drag.axis,
                                drag.steps,
                                drag.lines,
                            )}
                            adding={drag.kind === "add"}
                            mirrored={
                                mirror && drag.axis === "x" && drag.steps !== 0
                            }
                        />
                    )}
                </div>
            )}

            {/* What Escape does next, as the shape tools say (#824) */}
            {!drag && (
                <div
                    data-testid="field-edit-hint"
                    className="rounded-6 border-stroke bg-modal text-body text-text shadow-modal pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 border px-12 py-6 whitespace-nowrap"
                >
                    <T
                        keyName={
                            hasPick
                                ? "fieldEditMode.lines.canvasHintPicked"
                                : "fieldEditMode.lines.canvasHint"
                        }
                        params={{
                            keys: () => <Shortcut binding="Escape" />,
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function fieldToScreenAxis(
    fp: FieldProperties,
    view: { zoom: number; panX: number; panY: number },
    axis: "x" | "y",
    steps: number,
) {
    const field = stepsToField(fp, axis, steps);
    return (axis === "x" ? view.panX : view.panY) + field * view.zoom;
}

/** Where a drag would put its lines (and with mirror, their twins) */
export function ghostLines(
    fp: FieldProperties,
    drag: FieldEditDrag,
    mirror: boolean,
): { axis: "x" | "y"; steps: number; twin: boolean }[] {
    const mirrored = (steps: number) =>
        mirror && drag.axis === "x" && Math.abs(steps) > 1e-9
            ? [{ axis: drag.axis, steps: -steps, twin: true }]
            : [];
    if (drag.kind === "add")
        return [
            { axis: drag.axis, steps: drag.steps, twin: false },
            ...mirrored(drag.steps),
        ];
    // The pressed line (listed first) goes to `steps`; the others move as far. With mirror on,
    // one of each picked pair: the other is drawn as its twin
    const lines = selectionForEdit(fp, drag.lines, mirror).flatMap(
        (ref) =>
            (ref.axis === "x" ? fp.xCheckpoints : fp.yCheckpoints).find(
                (c) => c.id === ref.id,
            ) ?? [],
    );
    const lead = lines[0];
    if (!lead) return [];
    const by = drag.steps - lead.stepsFromCenterFront;
    return lines.flatMap((c) => {
        const steps = c.stepsFromCenterFront + by;
        return [{ axis: drag.axis, steps, twin: false }, ...mirrored(steps)];
    });
}

/**
 * A ruler: along the top for X lines, down the left for Y lines. Ticks every step (every 4 or 8
 * when they'd crowd), a tab for each line with its short name, picked and dragged like the line.
 * Dragging out of the ruler adds a line; double-clicking it adds one there.
 */
function Ruler({
    axis,
    fp,
    view,
    length,
    stepPx,
    thickness,
    touch,
    highlighted,
    hoverKeys,
    onRulerDown,
    onLineDown,
    onLineDoubleClick,
    onRulerDoubleClick,
    title,
}: {
    axis: "x" | "y";
    fp: FieldProperties;
    view: { zoom: number; panX: number; panY: number };
    length: number;
    stepPx: number;
    /** How thick the ruler is, in px: 22, or 44 in the touch layout */
    thickness: number;
    touch: boolean;
    highlighted: ReadonlySet<string>;
    /** The hovered line, and with Mirror on its twin */
    hoverKeys: ReadonlySet<string>;
    onRulerDown: (event: React.PointerEvent, axis: "x" | "y") => void;
    onLineDown: (
        event: React.PointerEvent,
        line: Checkpoint,
        fromTab: boolean,
    ) => void;
    onLineDoubleClick: (ref: FieldLineRef) => void;
    onRulerDoubleClick: (axis: "x" | "y", pixel: number) => void;
    title: string;
}) {
    const horizontal = axis === "x";
    const every = stepPx >= 6 ? 1 : stepPx >= 1.5 ? 4 : 8;
    const ticks: { at: number; major: boolean }[] = [];
    const start = screenToField(view, axis, 0);
    const end = screenToField(view, axis, length);
    const firstStep = Math.ceil(fieldToSteps(fp, axis, start) / every) * every;
    const lastStep = Math.floor(fieldToSteps(fp, axis, end) / every) * every;
    if (lastStep - firstStep <= 4000 * every)
        for (let s = firstStep; s <= lastStep; s += every)
            ticks.push({
                at: fieldToScreenAxis(fp, view, axis, s),
                major: s % 8 === 0,
            });
    const lines = linesOn(fp, axis);
    const positions = lines.map((c) => lineScreen(fp, view, c));
    // Room for a name between neighbors? Else a slim tab
    const gapAt = (i: number) =>
        Math.abs(
            Math.min(
                i > 0 ? positions[i]! - positions[i - 1]! : Infinity,
                i < positions.length - 1
                    ? positions[i + 1]! - positions[i]!
                    : Infinity,
            ),
        );
    const roomy = (i: number) => gapAt(i) >= (horizontal ? 30 : 18);
    // Along the ruler: a name's width, or slim; with a finger, as wide as the gap allows, up to 44
    const tabLength = (i: number, named: boolean) =>
        touch
            ? Math.max(6, Math.min(44, gapAt(i) - 2))
            : horizontal
              ? named
                  ? 28
                  : 6
              : named
                ? 16
                : 6;
    const local = (event: React.MouseEvent) => {
        const rect = (
            event.currentTarget as HTMLElement
        ).getBoundingClientRect();
        return horizontal
            ? event.clientX - rect.left
            : event.clientY - rect.top;
    };
    return (
        <div
            data-field-control
            data-testid={`field-edit-ruler-${axis}`}
            title={title}
            className={clsx(
                "bg-fg-1/95 border-stroke backdrop-blur-32 absolute z-10 cursor-copy overflow-hidden",
                horizontal
                    ? "top-0 right-0 left-0 border-b"
                    : "top-0 bottom-0 left-0 border-r",
            )}
            style={horizontal ? { height: thickness } : { width: thickness }}
            onPointerDown={(e) => onRulerDown(e, axis)}
            onDoubleClick={(e) => {
                if (e.target === e.currentTarget)
                    onRulerDoubleClick(axis, local(e));
            }}
        >
            <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
            >
                {ticks.map((tick) => {
                    const size = tick.major ? 7 : 4;
                    return horizontal ? (
                        <line
                            key={tick.at}
                            x1={tick.at}
                            x2={tick.at}
                            y1={thickness - size}
                            y2={thickness}
                            className="stroke-text-subtitle"
                            strokeWidth={1}
                        />
                    ) : (
                        <line
                            key={tick.at}
                            y1={tick.at}
                            y2={tick.at}
                            x1={thickness - size}
                            x2={thickness}
                            className="stroke-text-subtitle"
                            strokeWidth={1}
                        />
                    );
                })}
            </svg>
            {lines.map((c, i) => {
                const at = positions[i]!;
                if (at < -20 || at > length + 20) return null;
                const ref = toRef(c);
                const key = lineKey(ref);
                const lit = highlighted.has(key);
                const hovered = hoverKeys.has(key);
                const named = roomy(i);
                const along = tabLength(i, named);
                return (
                    <div
                        key={key}
                        role="button"
                        tabIndex={-1}
                        aria-label={lineLabel(fp, c)}
                        data-field-line-tab={key}
                        className={clsx(
                            "rounded-4 text-sub absolute flex items-center justify-center overflow-hidden border leading-none tabular-nums",
                            horizontal
                                ? "cursor-ew-resize"
                                : "cursor-ns-resize",
                            lit
                                ? "bg-accent text-text-invert border-accent"
                                : hovered
                                  ? "border-accent bg-bg-1 text-text"
                                  : "border-stroke bg-bg-1 text-text-subtitle",
                            !c.visible && !lit && "border-dashed opacity-70",
                        )}
                        style={
                            horizontal
                                ? {
                                      left: at - along / 2,
                                      width: along,
                                      top: 3,
                                      height: thickness - 6,
                                  }
                                : {
                                      top: at - along / 2,
                                      height: along,
                                      left: 2,
                                      width: thickness - 4,
                                  }
                        }
                        onPointerDown={(e) => onLineDown(e, c, true)}
                        onPointerEnter={() => fieldEditMode.setHover(ref)}
                        onPointerLeave={() => fieldEditMode.setHover(null)}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            onLineDoubleClick(ref);
                        }}
                    >
                        {named && horizontal ? c.terseName : null}
                    </div>
                );
            })}
        </div>
    );
}
