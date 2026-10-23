import { fabric } from "fabric";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { resetGroupChildTransforms } from "@/global/classes/canvasObjects/GroupUtils";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import { toast } from "sonner";
import { getRedoStackLength, getUndoStackLength } from "@/db-functions";
import { db } from "@/global/database/db";
import { runAction } from "@/shortcuts/registry";
import { isShiftHeld } from "@/stores/TouchModifierStore";
import { clampCanvasZoom } from "../CanvasConstants";
import {
    GestureEffect,
    GestureInput,
    GestureState,
    NavigationGeometry,
    PALM_CONTACT_PX,
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
    } | null;
    _groupSelector: unknown;
    _onMouseUp: EventListener;
    _onMouseMove: EventListener;
    _resetTransformEventData: () => void;
    contextTopDirty: boolean;
    upperCanvasEl: HTMLCanvasElement;
};

const LISTENER_OPTIONS = { passive: false } as const;

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
        | { kind: "empty" }
        | null = null;
    private armFrame: number | null = null;

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

        this.step(
            {
                type: type as "down",
                id: e.pointerId,
                kind: e.pointerType,
                x: e.clientX,
                y: e.clientY,
                t: now,
                large:
                    e.pointerType === "touch" &&
                    Math.max(e.width || 0, e.height || 0) > PALM_CONTACT_PX,
            },
            e,
        );
    };

    private step(input: GestureInput, e?: PointerEvent) {
        const result = stepGesture(this.state, input);
        this.state = result.state;
        this.afterStep(result, e);
    }

    private afterStep(
        result: ReturnType<typeof stepGesture>,
        e?: PointerEvent,
    ) {
        for (const effect of result.effects) this.apply(effect, e);
        if (e && !result.passThrough) {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        }
        this.scheduleTimer();
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
                canvas.touchDeferredClear = false;
                break;
            case "singleDragged":
                // A rubber band from empty field replaces the selection, as with a mouse
                if (
                    canvas.touchDeferredClear &&
                    this.internals._groupSelector &&
                    !isShiftHeld(e)
                ) {
                    canvas.touchDeferredClear = false;
                    canvas.discardActiveObject(e);
                    canvas.requestRenderAll();
                }
                break;
            case "singleEnd":
                if (effect.tap && canvas.touchDeferredClear) {
                    // After Fabric has handled this release
                    setTimeout(() => {
                        if (!canvas.touchDeferredClear) return;
                        canvas.touchDeferredClear = false;
                        canvas.discardActiveObject();
                        canvas.requestRenderAll();
                    }, 0);
                } else {
                    canvas.touchDeferredClear = false;
                    if (effect.tap) {
                        const shift = isShiftHeld(e);
                        setTimeout(
                            () => this.tapInsideSelection(effect.point, shift),
                            0,
                        );
                    }
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

    /** Undo or redo, as the shortcut does, with a short note that it happened */
    private async history(direction: "undo" | "redo") {
        let available = true;
        try {
            available =
                (direction === "undo"
                    ? await getUndoStackLength(db)
                    : await getRedoStackLength(db)) > 0;
        } catch {
            // Let the action report it
        }
        const ran = runAction(
            direction === "undo" ? "performUndo" : "performRedo",
        );
        // With nothing to undo, the action shows its own message
        if (ran && available)
            toast(direction === "undo" ? "Undo" : "Redo", { duration: 1200 });
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
     * A tap on a marcher that sits inside a multi-selection's box but isn't in
     * it: Fabric took the tap for the whole selection. Select the marcher (or
     * add it, with Shift) as a tap anywhere else would.
     */
    private tapInsideSelection(
        client: { x: number; y: number },
        shift: boolean,
    ) {
        const canvas = this.canvas;
        const active = canvas.getActiveObject();
        if (!active || active.type !== "activeSelection") return;
        const marcher = this.marcherAt(client);
        if (!marcher) return;
        const selected = canvas.getActiveObjects();
        if (selected.includes(marcher)) return;
        const next = shift
            ? ([
                  ...selected.filter(Selectable.isSelectable),
                  marcher,
              ] as Selectable.ISelectable[])
            : [marcher];
        canvas.setActiveObjects(next);
    }

    /** The finger has been held still: say what letting go would do */
    private armLongPress(id: number, client: { x: number; y: number }) {
        const marcher = this.marcherAt(client);
        if (marcher) {
            this.armTarget = { kind: "marcher", marcher };
            this.feedback(client);
            return;
        }
        const listeners = this.listeners;
        // Only from empty field: Fabric is drawing a rubber band, not moving something
        if (
            listeners?.touchLongPressLasso !== false &&
            listeners?.startLasso &&
            this.internals._groupSelector &&
            !this.internals._currentTransform
        ) {
            this.armTarget = { kind: "empty" };
            this.feedback(client);
        }
    }

    /** Moving after the hold: from empty field it draws the lasso; on a marcher it is just a drag */
    private longPressMoved() {
        const target = this.armTarget;
        this.armTarget = null;
        if (target?.kind !== "empty" || !this.downEvent) return;
        const listeners = this.listeners;
        if (!listeners?.startLasso) return;
        this.cancelFabricPress({ endPress: false });
        this.restoreSelection(this.selectionSnapshot);
        listeners.startLasso(this.downEvent);
    }

    /** Let go after holding still: toggle the marcher in the selection the finger started with */
    private commitLongPress() {
        const canvas = this.canvas;
        const target = this.armTarget;
        this.armTarget = null;
        this.fabricPointerId = null;
        // Fabric doesn't see this release; drop its press and any wobble it made
        this.cancelFabricPress({ endPress: true });
        if (target?.kind !== "marcher") {
            this.restoreSelection(this.selectionSnapshot);
            return;
        }
        const marcher = target.marcher;
        const before = this.selectionSnapshot.filter(
            Selectable.isSelectable,
        ) as Selectable.ISelectable[];
        const removing = before.includes(marcher);
        const next = removing
            ? before.filter((o) => o !== marcher)
            : [...before, marcher];
        canvas.setActiveObjects(next);
        this.selectionSnapshot = canvas.getActiveObjects().slice();
        const name = marcher.marcherObj?.drill_number ?? "the marcher";
        toast(
            removing
                ? `Removed ${name} from the selection`
                : `Added ${name} to the selection. Long press it again to remove it.`,
            { id: "touch-long-press", duration: 2500 },
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
