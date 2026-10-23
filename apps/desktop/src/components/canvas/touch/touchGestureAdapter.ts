import { fabric } from "fabric";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { resetGroupChildTransforms } from "@/global/classes/canvasObjects/GroupUtils";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import { runAction } from "@/shortcuts/registry";
import { isShiftHeld } from "@/stores/TouchModifierStore";
import { clampCanvasZoom } from "../CanvasConstants";
import {
    GestureEffect,
    GestureInput,
    GestureState,
    NavigationGeometry,
    PointerInput,
    initialGestureState,
    navigationTransform,
    stepGesture,
} from "./touchGestures";
import { TOUCH_HIT_RADIUS_PX, pickNearestWithinRadius } from "./touchHitTest";

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
            },
            e,
        );
    };

    private step(input: GestureInput, e?: PointerEvent) {
        const result = stepGesture(this.state, input);
        this.state = result.state;
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
                this.step({ type: "timer", t: performance.now() });
            },
            Math.max(0, at - performance.now()),
        );
    }

    private clearTimer() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
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
                }
                break;
            case "cancelSingle":
                this.fabricPointerId = null;
                this.cancelFabricPress({ endPress: true });
                this.restoreSelection(this.selectionSnapshot);
                break;
            case "longPress":
                this.handleLongPress(effect.id, effect.point);
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
                runAction("performUndo");
                break;
            case "redo":
                runAction("performRedo");
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

    private handleLongPress(id: number, client: { x: number; y: number }) {
        const canvas = this.canvas;
        const event = this.lastEvents.get(id);
        if (!event) return;
        const point = canvas.getPointer(event);
        const marchers = canvas
            .getCanvasMarchers()
            .filter((m) => m.visible && m.evented && m.selectable);
        const marcher = pickNearestWithinRadius(
            marchers.map((m) => ({
                item: m,
                rect: m.getBoundingRect(true, true),
            })),
            point,
            TOUCH_HIT_RADIUS_PX,
            canvas.getZoom(),
        );

        if (marcher) {
            // Toggle the marcher in the selection the finger started with
            this.cancelFabricPress({ endPress: true });
            const before = this.selectionSnapshot.filter(
                Selectable.isSelectable,
            ) as Selectable.ISelectable[];
            const next = before.includes(marcher)
                ? before.filter((o) => o !== marcher)
                : [...before, marcher];
            canvas.setActiveObjects(next);
            this.selectionSnapshot = canvas.getActiveObjects().slice();
            this.fabricPointerId = null;
            this.step({ type: "blockSingle" });
            this.feedback(client);
            return;
        }

        const listeners = this.listeners;
        const startLasso =
            listeners?.touchLongPressLasso !== false
                ? listeners?.startLasso?.bind(listeners)
                : undefined;
        // Only from empty field: Fabric is drawing a rubber band, not moving something
        if (
            startLasso &&
            this.internals._groupSelector &&
            !this.internals._currentTransform
        ) {
            this.cancelFabricPress({ endPress: false });
            this.restoreSelection(this.selectionSnapshot);
            startLasso(event);
            this.feedback(client);
        }
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
