import { fabric } from "fabric";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { resetGroupChildTransforms } from "@/global/classes/canvasObjects/GroupUtils";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import { toast } from "sonner";
import { runAction } from "@/shortcuts/registry";
import { queueHistoryAction } from "@/shortcuts/handlers/historyQueue";
import tolgee from "@/global/singletons/Tolgee";
import { isShiftHeld } from "@/stores/TouchModifierStore";
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    FieldDragAction,
    fieldDragAction,
    useFieldDragModeStore,
} from "./fieldDragMode";
import { clampCanvasZoom } from "../CanvasConstants";
import {
    GestureEffect,
    GestureInput,
    GestureState,
    NavigationGeometry,
    isPalmContact,
    PointerInput,
    initialGestureState,
    navigationTransform,
    stepGesture,
} from "./touchGestures";
import {
    TOUCH_HIT_RADIUS_PX,
    absoluteBounds,
    pickNearestWithinRadius,
} from "./touchHitTest";

/** Listener methods the adapter uses when the canvas listeners have them */
interface TouchAwareListeners {
    /** Drop any half-done press (lasso, line start) */
    cancelActiveInteraction?: () => void;
    /** Start the lasso at this event, as Shift+drag does with a mouse */
    startLasso?: (e: Event) => void;
    /** False where a long press must not start the lasso */
    touchLongPressLasso?: boolean;
}

type FabricInternals = {
    _currentTransform: {
        target: fabric.Object;
        original: Record<string, unknown>;
        action?: string;
    } | null;
    _collectObjects: (e: Event) => fabric.Object[];
    _groupSelector: unknown;
    _onMouseUp: EventListener;
    _onMouseMove: EventListener;
    _resetTransformEventData: () => void;
    contextTopDirty: boolean;
    upperCanvasEl: HTMLCanvasElement;
};

const LISTENER_OPTIONS = { passive: false } as const;

/**
 * A finger must move this far (px) before a marcher it pressed starts to
 * move, so a trembling tap doesn't nudge it. It then moves by the whole
 * distance, staying under the finger.
 */
export const TOUCH_DRAG_START_PX = 12;

/** A pen drag from empty field turns into lasso or panning after this (px) */
const PEN_DRAG_START_PX = 4;

export const TOUCH_LAYOUT_HINT_KEY = "openmarch:touchLayoutHintShown";

/**
 * Once: a finger on the field while the app is laid out for a mouse (a touch
 * screen laptop in Automatic) gets a pointer to the tablet layout.
 */
function maybeShowTouchLayoutHint() {
    const { mode, preference } = useInputModeStore.getState();
    if (mode !== "pointer" || preference !== "auto") return;
    try {
        if (localStorage.getItem(TOUCH_LAYOUT_HINT_KEY)) return;
        localStorage.setItem(TOUCH_LAYOUT_HINT_KEY, "1");
    } catch {
        return;
    }
    toast(tolgee.t("touch.layoutHint"), {
        id: "touch-layout-hint",
        duration: 10000,
        action: {
            label: tolgee.t("touch.openSettings"),
            onClick: () => {
                runAction("openSettings");
            },
        },
    });
}

/**
 * What a drag from empty field does for this pointer. The mode is set on the
 * pill in the touch layout (Auto until changed: a finger moves the view, a pen
 * selects). The pointer layout shows no pill to say what an override is, so
 * it always uses Auto.
 */
const fieldDragMode = (pointer: "touch" | "pen"): FieldDragAction =>
    fieldDragAction(
        useInputModeStore.getState().mode === "touch"
            ? useFieldDragModeStore.getState().mode
            : "auto",
        pointer,
    );

/**
 * Puts the field's touch gestures (`touchGestures.ts`) on a canvas: listens to
 * finger and pen pointer events on the canvas wrapper in the capture phase,
 * before Fabric sees them, and carries out what the gesture rules decide.
 * Mouse events are left alone.
 */
export class TouchGestureAdapter {
    private state: GestureState = initialGestureState();
    private timer: ReturnType<typeof setTimeout> | null = null;
    /** Selection when the first finger went down */
    private selectionSnapshot: fabric.Object[] = [];
    private navigationStart: {
        vpt: number[];
        geometry: NavigationGeometry;
    } | null = null;
    private lastEvents = new Map<number, PointerEvent>();
    private lastTouchAt = -Infinity;
    /** The finger whose press Fabric is handling, if any */
    private fabricPointerId: number | null = null;
    /** The first finger's pointerdown */
    private downEvent: PointerEvent | null = null;
    /** What an armed long press would act on */
    private armTarget:
        | { kind: "marcher"; marcher: CanvasMarcher }
        | { kind: "empty"; near: CanvasMarcher | null }
        | null = null;
    private armFrame: number | null = null;
    /** This press held still on empty field, then moved: it selects (box) */
    private holdSelects = false;
    /** Keep the event being handled away from Fabric, whatever the rules said */
    private blockCurrent = false;
    /** A pen press from empty field, in the lasso or "Move view" drag mode */
    private penPress: {
        id: number;
        down: PointerEvent;
        converted: "lasso" | "pan" | null;
        navigation: { vpt: number[]; geometry: NavigationGeometry } | null;
    } | null = null;

    constructor(
        private readonly canvas: OpenMarchCanvas,
        private readonly wrapper: HTMLElement,
    ) {}

    /** Whether Fabric should treat this finger's events as its main pointer */
    isFabricPointer(pointerId: number): boolean {
        return pointerId === this.fabricPointerId;
    }

    attach() {
        const w = this.wrapper;
        w.style.touchAction = "none";
        w.style.setProperty("-webkit-touch-callout", "none");
        w.style.userSelect = "none";
        w.style.setProperty("-webkit-user-select", "none");
        for (const type of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "lostpointercapture",
        ]) {
            w.addEventListener(type, this.onPointer as EventListener, {
                capture: true,
                ...LISTENER_OPTIONS,
            });
        }
        w.addEventListener("contextmenu", this.onContextMenu, true);
    }

    detach() {
        const w = this.wrapper;
        for (const type of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "lostpointercapture",
        ]) {
            w.removeEventListener(type, this.onPointer as EventListener, true);
        }
        w.removeEventListener("contextmenu", this.onContextMenu, true);
        this.clearTimer();
    }

    /** A touch long press opens the browser's menu on some systems; not on the field */
    private onContextMenu = (e: Event) => {
        const pointerType = (e as PointerEvent).pointerType;
        if (
            pointerType === "touch" ||
            pointerType === "pen" ||
            performance.now() - this.lastTouchAt < 1000
        ) {
            e.preventDefault();
        }
    };

    private onPointer = (e: PointerEvent) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        const types: Record<string, PointerInput["type"]> = {
            pointerdown: "down",
            pointermove: "move",
            pointerup: "up",
            pointercancel: "cancel",
            lostpointercapture: "cancel",
        };
        const type = types[e.type];
        if (!type) return;

        // When the event happened, not when it is handled: a busy main thread
        // must not turn a quick two-finger tap into a slow one. Same clock as
        // performance.now(), which the long press timer uses.
        const now = e.timeStamp > 0 ? e.timeStamp : performance.now();
        // The finger's press is not default-prevented, so a tap on the field still
        // moves focus away from a text field, as a click does
        if (e.pointerType === "touch") this.lastTouchAt = now;
        if (type === "up" || type === "cancel")
            this.lastEvents.delete(e.pointerId);
        else this.lastEvents.set(e.pointerId, e);
        if (e.pointerType === "pen" && this.handlePenDrag(type, e)) {
            // The pen is panning the view: Fabric doesn't see it, the rules still do
            e.stopPropagation();
        }

        this.step(
            {
                type: type as "down",
                id: e.pointerId,
                kind: e.pointerType,
                x: e.clientX,
                y: e.clientY,
                t: now,
                large: e.pointerType === "touch" && isPalmContact(e),
                contact: e.buttons > 0 || e.pressure > 0,
            },
            e,
        );
    };

    private step(input: GestureInput, e?: PointerEvent) {
        const result = stepGesture(this.state, input);
        this.state = result.state;
        this.afterStep(result, input, e);
    }

    private afterStep(
        result: ReturnType<typeof stepGesture>,
        input: GestureInput,
        e?: PointerEvent,
    ) {
        this.blockCurrent = false;
        for (const effect of result.effects) this.apply(effect, e);
        let block = !result.passThrough || this.blockCurrent;
        // Tremor: hold a finger's first few px back from a marcher it is moving
        if (
            !block &&
            input.type === "move" &&
            input.kind === "touch" &&
            this.state.mode === "single"
        ) {
            const pointer = this.state.pointers[0];
            const transform = this.internals._currentTransform;
            if (
                transform?.action === "drag" &&
                pointer &&
                pointer.maxMove < TOUCH_DRAG_START_PX
            )
                block = true;
        }
        if (e && block) {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        }
        this.scheduleTimer();
    }

    /**
     * A pen drag from empty field in the lasso or "Move view" drag mode.
     * Returns true when the pen's event must not reach Fabric (panning).
     */
    private handlePenDrag(
        type: PointerInput["type"],
        e: PointerEvent,
    ): boolean {
        if (type === "down") {
            this.penPress = {
                id: e.pointerId,
                down: e,
                converted: null,
                navigation: null,
            };
            return false;
        }
        const press = this.penPress;
        if (!press || press.id !== e.pointerId) return false;
        if (type === "up" || type === "cancel") {
            this.penPress = null;
            if (
                !press.converted &&
                type === "up" &&
                this.canvas.touchDeferredClear
            ) {
                // A pen tap on empty field clears the selection (after Fabric's release)
                setTimeout(() => {
                    if (!this.canvas.touchDeferredClear) return;
                    this.canvas.touchDeferredClear = false;
                    this.canvas.discardActiveObject();
                    this.canvas.requestRenderAll();
                }, 0);
            }
            if (press.converted === "pan") {
                this.canvas.settleGestureViewport();
                this.canvas.fire("view:settled", {});
            }
            return press.converted === "pan";
        }
        if (press.converted === "pan" && press.navigation) {
            this.canvas.applyGestureViewport(
                navigationTransform(
                    press.navigation.vpt,
                    press.navigation.geometry,
                    this.toCanvasElement({
                        mid: { x: e.clientX, y: e.clientY },
                        distance: null,
                    }),
                    clampCanvasZoom,
                ),
            );
            return true;
        }
        if (press.converted) return false;
        const moved = Math.hypot(
            e.clientX - press.down.clientX,
            e.clientY - press.down.clientY,
        );
        if (moved < PEN_DRAG_START_PX) return false;
        const mode = fieldDragMode("pen");
        const emptyPress =
            this.internals._groupSelector && !this.internals._currentTransform;
        if (mode === "box" || !emptyPress) {
            // Decided: the rest of the press is Fabric's as usual
            this.penPress = null;
            return false;
        }
        if (mode === "lasso") {
            const listeners = this.listeners;
            if (
                listeners?.touchLongPressLasso === false ||
                !listeners?.startLasso
            ) {
                this.penPress = null;
                return false;
            }
            this.cancelFabricPress({ endPress: false });
            listeners.startLasso(press.down);
            press.converted = "lasso";
            return false;
        }
        // pan
        this.cancelFabricPress({ endPress: true });
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return true;
        press.converted = "pan";
        press.navigation = {
            vpt: vpt.slice(),
            geometry: this.toCanvasElement({
                mid: { x: press.down.clientX, y: press.down.clientY },
                distance: null,
            }),
        };
        return this.handlePenDrag("move", e);
    }

    private scheduleTimer() {
        this.clearTimer();
        const at = this.state.longPressAt;
        if (at === null) return;
        this.timer = setTimeout(
            () => {
                this.timer = null;
                // Moves the browser has queued are dispatched at the start of the
                // next frame, before animation frame callbacks: check after them
                this.armFrame = requestAnimationFrame(() => {
                    this.armFrame = null;
                    this.step({ type: "timer", t: performance.now() });
                });
            },
            Math.max(0, at - performance.now()),
        );
    }

    private clearTimer() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        if (this.armFrame !== null) cancelAnimationFrame(this.armFrame);
        this.armFrame = null;
    }

    private get listeners(): TouchAwareListeners | undefined {
        return this.canvas.listeners as TouchAwareListeners | undefined;
    }

    // eslint-disable-next-line max-lines-per-function
    private apply(effect: GestureEffect, e?: PointerEvent) {
        const canvas = this.canvas;
        switch (effect.type) {
            case "singleStart":
                this.selectionSnapshot = canvas.getActiveObjects().slice();
                this.fabricPointerId = effect.id;
                this.downEvent = e ?? null;
                this.armTarget = null;
                this.holdSelects = false;
                maybeShowTouchLayoutHint();
                canvas.touchDeferredClear = false;
                break;
            case "singleDragged":
                this.dragFromEmptyField();
                break;
            case "singleEnd":
                if (
                    !effect.tap &&
                    canvas.touchDeferredClear &&
                    this.internals._groupSelector &&
                    e
                ) {
                    // A rubber band: it replaces the selection only if it caught
                    // something; an empty one or a flick keeps the selection
                    canvas.touchDeferredClear = false;
                    const caught = this.internals._collectObjects(e);
                    if (caught.length > 0 && !isShiftHeld(e))
                        canvas.discardActiveObject(e);
                }
                if (!effect.tap && this.panWholeFlick(effect.point)) {
                    canvas.touchDeferredClear = false;
                    break;
                }
                if (effect.tap) {
                    canvas.touchDeferredClear = false;
                    const onNothing = !canvas.lastPressHitSomething;
                    const shift = isShiftHeld(e);
                    // After Fabric has handled this release
                    setTimeout(() => {
                        if (onNothing) {
                            // Empty field, or merely near a marcher: pick the
                            // nearest marcher within reach, or clear
                            this.tapOnEmptyField(effect.point, shift);
                        } else {
                            this.tapInsideSelection(effect.point, shift);
                        }
                    }, 0);
                } else {
                    canvas.touchDeferredClear = false;
                }
                break;
            case "cancelSingle":
                this.fabricPointerId = null;
                this.cancelFabricPress({ endPress: true });
                this.restoreSelection(this.selectionSnapshot);
                break;
            case "longPressArmed":
                this.armLongPress(effect.id, effect.point);
                break;
            case "longPressMoved":
                this.longPressMoved();
                break;
            case "longPressCancelled":
                this.armTarget = null;
                break;
            case "longPressCommit":
                this.commitLongPress();
                break;
            case "navigationStart": {
                const vpt = canvas.viewportTransform;
                if (!vpt) break;
                this.navigationStart = {
                    vpt: vpt.slice(),
                    geometry: this.toCanvasElement(effect.geometry),
                };
                break;
            }
            case "navigate": {
                if (!this.navigationStart) break;
                canvas.applyGestureViewport(
                    navigationTransform(
                        this.navigationStart.vpt,
                        this.navigationStart.geometry,
                        this.toCanvasElement(effect.geometry),
                        clampCanvasZoom,
                    ),
                );
                break;
            }
            case "navigationEnd":
                this.navigationStart = null;
                canvas.settleGestureViewport();
                canvas.fire("view:settled", {});
                break;
            case "undo":
                void this.history("undo");
                break;
            case "redo":
                void this.history("redo");
                break;
        }
    }

    private get internals(): FabricInternals {
        return this.canvas as unknown as FabricInternals;
    }

    /** Client coordinates to coordinates on the canvas element */
    private toCanvasElement(geometry: NavigationGeometry): NavigationGeometry {
        const rect = this.internals.upperCanvasEl.getBoundingClientRect();
        return {
            mid: {
                x: geometry.mid.x - rect.left,
                y: geometry.mid.y - rect.top,
            },
            distance: geometry.distance,
        };
    }

    /**
     * Undoes what Fabric started for the first finger: a move, scale or
     * rotation goes back to where it started without being saved, and a
     * rubber band disappears.
     *
     * @param endPress Also make Fabric forget the press, so it ignores the rest of it
     */
    cancelFabricPress({ endPress }: { endPress: boolean }) {
        const canvas = this.canvas;
        const internals = this.internals;
        const transform = internals._currentTransform;
        if (transform) {
            const target = transform.target;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { originX, originY, ...original } = transform.original;
            target.set(original as Partial<fabric.Object>);
            (target as any)._scaling = false;
            (target as any).isMoving = false;
            if (target instanceof fabric.Group) {
                resetGroupChildTransforms(target);
                const groupAny = target as any;
                delete groupAny.__scalingCorner;
                delete groupAny.__originalScaleX;
                delete groupAny.__originalScaleY;
            }
            if (target instanceof CanvasMarcher)
                target.updateTextLabelPosition();
            target.setCoords();
            internals._currentTransform = null;
            // Let paths and labels follow the object back
            canvas.fire("object:moving", { target, e: undefined });
        }
        internals._groupSelector = null;
        internals.contextTopDirty = true;
        canvas.touchDeferredClear = false;
        this.listeners?.cancelActiveInteraction?.();

        if (endPress) {
            document.removeEventListener("pointerup", internals._onMouseUp);
            document.removeEventListener(
                "pointermove",
                internals._onMouseMove,
                LISTENER_OPTIONS as AddEventListenerOptions,
            );
            internals.upperCanvasEl.removeEventListener(
                "pointermove",
                internals._onMouseMove,
            );
            internals.upperCanvasEl.addEventListener(
                "pointermove",
                internals._onMouseMove,
                LISTENER_OPTIONS,
            );
            internals._resetTransformEventData();
        }
        canvas.requestRenderAll();
    }

    private restoreSelection(objects: fabric.Object[]) {
        const canvas = this.canvas;
        const onCanvas = new Set(canvas.getObjects());
        const wanted = objects.filter(
            (o) => Selectable.isSelectable(o) && onCanvas.has(o),
        ) as Selectable.ISelectable[];
        const current = canvas.getActiveObjects();
        const same =
            current.length === wanted.length &&
            wanted.every((o) => current.includes(o));
        if (!same) canvas.setActiveObjects(wanted);
        canvas.requestRenderAll();
    }

    /**
     * The first finger left the tap slop. From empty field, the drag mode
     * decides: the rubber band stays (box), or it becomes the lasso or a pan.
     */
    private dragFromEmptyField() {
        // Press and hold, then drag: a selection box whatever the mode
        if (this.holdSelects) return;
        const mode = fieldDragMode("touch");
        if (mode === "box") return;
        if (!this.internals._groupSelector || this.internals._currentTransform)
            return;
        if (mode === "lasso") {
            const listeners = this.listeners;
            if (
                listeners?.touchLongPressLasso === false ||
                !listeners?.startLasso ||
                !this.downEvent
            )
                return;
            this.cancelFabricPress({ endPress: false });
            this.restoreSelection(this.selectionSnapshot);
            listeners.startLasso(this.downEvent);
            return;
        }
        // Move view
        this.cancelFabricPress({ endPress: true });
        this.restoreSelection(this.selectionSnapshot);
        this.fabricPointerId = null;
        this.blockCurrent = true;
        const result = stepGesture(this.state, { type: "panSingle" });
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect);
        // Catch up with the finger at once
        const pointer = this.state.pointers[0];
        if (pointer)
            this.apply({
                type: "navigate",
                geometry: { mid: { ...pointer.current }, distance: null },
            });
    }

    /**
     * A flick in the Pan drag mode so quick that it ended before turning into
     * a pan (few or no moves arrived): move the view by the whole flick now,
     * instead of letting Fabric finish a selection box.
     */
    private panWholeFlick(client: { x: number; y: number }): boolean {
        if (this.holdSelects || fieldDragMode("touch") !== "pan") return false;
        if (!this.internals._groupSelector || this.internals._currentTransform)
            return false;
        const down = this.downEvent;
        const vpt = this.canvas.viewportTransform;
        if (!down || !vpt) return false;
        this.cancelFabricPress({ endPress: true });
        this.restoreSelection(this.selectionSnapshot);
        this.fabricPointerId = null;
        this.blockCurrent = true;
        const start = this.toCanvasElement({
            mid: { x: down.clientX, y: down.clientY },
            distance: null,
        });
        this.canvas.applyGestureViewport(
            navigationTransform(
                vpt.slice(),
                start,
                this.toCanvasElement({ mid: client, distance: null }),
                clampCanvasZoom,
            ),
        );
        this.canvas.settleGestureViewport();
        this.canvas.fire("view:settled", {});
        return true;
    }

    /**
     * Undo or redo, through the same queue as the shortcut, with a short note
     * when it happened. The handler checks the stack and says so itself when
     * there is nothing to undo.
     */
    private async history(direction: "undo" | "redo") {
        const did = await queueHistoryAction(direction);
        if (did)
            toast(
                tolgee.t(
                    direction === "undo" ? "touch.undone" : "touch.redone",
                ),
                { duration: 1200 },
            );
    }

    /** The marcher nearest to a finger (client px), within the touch radius */
    private marcherAt(client: { x: number; y: number }): CanvasMarcher | null {
        const canvas = this.canvas;
        const rect = this.internals.upperCanvasEl.getBoundingClientRect();
        const vpt = canvas.viewportTransform;
        if (!vpt) return null;
        const point = fabric.util.transformPoint(
            new fabric.Point(client.x - rect.left, client.y - rect.top),
            fabric.util.invertTransform(vpt),
        );
        const marchers = canvas
            .getCanvasMarchers()
            .filter((m) => m.visible && m.evented && m.selectable);
        return pickNearestWithinRadius(
            marchers.map((m) => ({ item: m, rect: absoluteBounds(m) })),
            point,
            TOUCH_HIT_RADIUS_PX,
            canvas.getZoom(),
        );
    }

    /**
     * A tap that didn't land on anything: the nearest marcher within the
     * finger's reach is selected (Shift: added or taken out); with none in
     * reach, the selection is cleared.
     */
    private tapOnEmptyField(client: { x: number; y: number }, shift: boolean) {
        const canvas = this.canvas;
        const marcher = this.marcherAt(client);
        if (!marcher) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            return;
        }
        const selected = canvas
            .getActiveObjects()
            .filter(Selectable.isSelectable) as Selectable.ISelectable[];
        if (!shift) {
            canvas.setActiveObjects([marcher]);
            return;
        }
        canvas.setActiveObjects(
            selected.includes(marcher)
                ? selected.filter((o) => o !== marcher)
                : [...selected, marcher],
        );
    }

    /**
     * A tap on a marcher that sits inside a multi-selection's box but isn't in
     * it: Fabric took the tap for the whole selection. Select the marcher, as a
     * tap anywhere else would.
     */
    private tapInsideSelection(
        client: { x: number; y: number },
        shift: boolean,
    ) {
        // With Shift (or Add), Fabric already added or removed the marcher
        if (shift) return;
        const canvas = this.canvas;
        const active = canvas.getActiveObject();
        if (!active || active.type !== "activeSelection") return;
        const marcher = this.marcherAt(client);
        if (!marcher) return;
        if (canvas.getActiveObjects().includes(marcher)) return;
        canvas.setActiveObjects([marcher]);
    }

    /** The finger has been held still: say what letting go would do */
    private armLongPress(id: number, client: { x: number; y: number }) {
        const marcher = this.marcherAt(client);
        const listeners = this.listeners;
        // From empty field (Fabric is drawing a rubber band, not moving
        // something), even right beside a marcher: dragging on draws a box,
        // letting go toggles that marcher (not in the line tool)
        if (
            listeners?.touchLongPressLasso !== false &&
            this.internals._groupSelector &&
            !this.internals._currentTransform
        ) {
            this.armTarget = { kind: "empty", near: marcher };
            this.feedback(client);
            return;
        }
        if (marcher) {
            this.armTarget = { kind: "marcher", marcher };
            this.feedback(client);
        }
    }

    /**
     * Moving after the hold: from empty field it draws a selection box (the
     * rubber band Fabric started), even where a finger drag would otherwise
     * move the view; on a marcher it is just a drag.
     */
    private longPressMoved() {
        const target = this.armTarget;
        this.armTarget = null;
        if (target?.kind === "empty") this.holdSelects = true;
    }

    /** Let go after holding still: toggle the marcher in the selection the finger started with */
    private commitLongPress() {
        const canvas = this.canvas;
        const target = this.armTarget;
        this.armTarget = null;
        this.fabricPointerId = null;
        // Fabric doesn't see this release; drop its press and any wobble it made
        this.cancelFabricPress({ endPress: true });
        const marcher =
            target?.kind === "marcher"
                ? target.marcher
                : target?.kind === "empty"
                  ? target.near
                  : null;
        if (!marcher) {
            this.restoreSelection(this.selectionSnapshot);
            return;
        }
        const before = this.selectionSnapshot.filter(
            Selectable.isSelectable,
        ) as Selectable.ISelectable[];
        const removing = before.includes(marcher);
        if (removing && before.length === 1) {
            // The only selected marcher: taking it out would empty the
            // selection by surprise. The ring was enough.
            this.restoreSelection(this.selectionSnapshot);
            return;
        }
        const next = removing
            ? before.filter((o) => o !== marcher)
            : [...before, marcher];
        canvas.setActiveObjects(next);
        this.selectionSnapshot = canvas.getActiveObjects().slice();
        const name =
            marcher.marcherObj?.drill_number ?? tolgee.t("touch.theMarcher");
        toast(
            tolgee.t(removing ? "touch.marcherRemoved" : "touch.marcherAdded", {
                name,
            }),
            {
                id: "touch-long-press",
                duration: 2500,
            },
        );
    }

    /** A brief ring where the long press fired */
    private feedback(client: { x: number; y: number }) {
        const rect = this.wrapper.getBoundingClientRect();
        const ring = document.createElement("div");
        ring.setAttribute("aria-hidden", "true");
        ring.style.cssText = `
            position: absolute;
            left: ${client.x - rect.left - 28}px;
            top: ${client.y - rect.top - 28}px;
            width: 56px;
            height: 56px;
            border-radius: 9999px;
            border: 3px solid ${this.canvas.selectionBorderColor ?? "#0d6efd"};
            pointer-events: none;
            z-index: 5;
        `;
        this.wrapper.appendChild(ring);
        const remove = () => ring.remove();
        if (typeof ring.animate === "function") {
            const animation = ring.animate(
                [
                    { transform: "scale(0.4)", opacity: 1 },
                    { transform: "scale(1.2)", opacity: 0 },
                ],
                { duration: 380, easing: "ease-out" },
            );
            animation.onfinish = remove;
            animation.oncancel = remove;
        } else {
            setTimeout(remove, 380);
        }
        try {
            navigator.vibrate?.(15);
        } catch {
            // Not supported
        }
    }
}
