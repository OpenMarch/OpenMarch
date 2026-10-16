import {
    baseZoom,
    centerAtBase,
    clampPan,
    clampZoom,
    fullscreenFit,
    isPanButton,
    panBy,
    pinchStep,
    wheel,
    zoomAt,
    type ElementPoint,
    type FieldView,
    type NavigationSettings,
} from "@/field/editor/view";
import type { ZoomControlsCanvas } from "@/components/canvas/CanvasZoomControls";
import { isMacPlatform } from "@/shortcuts/platform";
import { useFieldViewStore } from "./fieldView";

/**
 * The new field's navigation input: turns wheel, pointer and touch events on
 * the field into view changes, by the rules in `src/field/editor/view.ts`,
 * and writes them to the view store. The thin DOM side of #194.
 */

const view = () => useFieldViewStore.getState();

/** The user has moved the view since it was last centered. */
let navigated = false;

/** Moves the view to `next` for the user. */
function navigate(next: FieldView) {
    navigated = true;
    useFieldViewStore.setState(next);
}

/**
 * Moves the view to `next` for the user, within the zoom and pan limits. App
 * actions that move the view (zoom to collisions) go through here too.
 */
export function setView(next: FieldView) {
    const { field } = view();
    const { width, height, zoom, panX, panY } = clampPan(
        { ...next, zoom: clampZoom(next.zoom) },
        field,
    );
    navigate({ width, height, zoom, panX, panY });
}

/** Centers the field at the base zoom, as a show opens and as the reset button does. */
export function resetView() {
    const { width, height, field } = view();
    if (width <= 0 || height <= 0) return;
    navigated = false;
    useFieldViewStore.setState({
        ...centerAtBase(width, height, field),
        baseZoom: baseZoom(height, field),
    });
}

/**
 * Centers the field again while the show is opening and its panels settle,
 * unless the user has already moved the view.
 */
export function settleView() {
    if (!navigated) resetView();
}

/** Fits the whole field into `container` (its fullscreen container, padding included). */
export function fitFullscreen(container: { width: number; height: number }) {
    const fit = fullscreenFit(view(), container, view().field);
    if (fit) useFieldViewStore.setState(fit);
}

/**
 * The zoom controls' view of the field, over the view store.
 */
export const threeZoomControls: ZoomControlsCanvas = {
    get width() {
        return view().width;
    },
    get height() {
        return view().height;
    },
    get fieldProperties() {
        const { field } = view();
        return field.width > 0 && field.height > 0 ? field : undefined;
    },
    getWidth: () => view().width,
    getHeight: () => view().height,
    getZoom: () => view().zoom,
    getBaseZoom: () => view().baseZoom,
    zoomToPoint: (point: ElementPoint, zoom: number) =>
        setView(zoomAt(view(), point, zoom)),
    setZoom: (zoom: number) => setView({ ...view(), zoom }),
    setViewportTransform: ([zoom, , , , panX, panY]: number[]) =>
        setView({ ...view(), zoom, panX, panY }),
    centerAtBaseZoom: resetView,
    // The view store redraws the field itself
    requestRenderAll: () => {},
};

/**
 * Whether a press pans the field: right, middle, or Ctrl+left on a Mac. The
 * field's other pointer handling (selection, gestures) skips these.
 */
export const isPanPress = (event: PointerEvent) =>
    event.pointerType !== "touch" && isPanButton(event, isMacPlatform());

/**
 * Presses on the field's own controls (the isolation bar, badges, buttons in
 * the overlay) are theirs, not navigation.
 */
const onControl = (event: Event) =>
    event.target instanceof Element &&
    event.target.closest(
        "button, a, input, select, textarea, [role='button'], [role='menu'], [role='dialog']",
    ) !== null;

type Local = (clientX: number, clientY: number) => ElementPoint;

/** Adds `listeners` to `target`; returns their removal. */
function listen(
    target: HTMLElement,
    listeners: Record<string, (event: never) => void>,
    options: AddEventListenerOptions,
) {
    const entries = Object.entries(listeners) as [string, EventListener][];
    for (const [type, listener] of entries)
        target.addEventListener(type, listener, options);
    return () => {
        for (const [type, listener] of entries)
            target.removeEventListener(type, listener, options);
    };
}

/**
 * Listens for navigation on `surface`, the element around the field (its
 * overlays included), and measures pointer positions from `field`, the
 * element the field draws into. Returns the cleanup.
 *
 * - Wheel: zooms at the pointer (mouse mode) or pans (trackpad mode); a pinch
 *   or Ctrl/Cmd+wheel zooms in either mode.
 * - Right-drag (Ctrl-drag on a Mac) and middle-drag pan, one to one. The
 *   field's other pointer handling skips these presses (`isPanPress`).
 * - Touch: one finger pans, two pinch.
 *
 * Presses on the field's own controls are left to them.
 */
export function attachFieldNavigation(
    surface: HTMLElement,
    field: () => HTMLElement | null,
    settings: () => NavigationSettings,
): () => void {
    const local: Local = (clientX, clientY) => {
        const rect = (field() ?? surface).getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const detach = [
        listenForWheel(surface, local, settings),
        listenForPanDrags(surface),
        listenForTouch(surface, local, settings),
    ];
    return () => detach.forEach((cleanup) => cleanup());
}

function listenForWheel(
    surface: HTMLElement,
    local: Local,
    settings: () => NavigationSettings,
) {
    const onWheel = (event: WheelEvent) => {
        if (onControl(event)) return;
        event.preventDefault();
        const current = view();
        if (current.width <= 0) return;
        const next = wheel(
            current,
            {
                ...local(event.clientX, event.clientY),
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
            },
            settings(),
            current.field,
        );
        if (next !== current) navigate(next);
    };
    return listen(surface, { wheel: onWheel }, { passive: false });
}

function listenForPanDrags(surface: HTMLElement) {
    let pan: { pointerId: number; x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
        if (!isPanPress(event) || onControl(event)) return;
        event.preventDefault();
        if (pan) return;
        pan = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        };
        surface.setPointerCapture?.(event.pointerId);
        useFieldViewStore.setState({ panning: true });
    };
    const onPointerMove = (event: PointerEvent) => {
        if (!pan || event.pointerId !== pan.pointerId) return;
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        pan.x = event.clientX;
        pan.y = event.clientY;
        setView(panBy(view(), dx, dy));
    };
    const endPan = (event: PointerEvent) => {
        if (!pan || event.pointerId !== pan.pointerId) return;
        pan = null;
        useFieldViewStore.setState({ panning: false });
    };
    const detach = listen(
        surface,
        {
            pointerdown: onPointerDown,
            pointermove: onPointerMove,
            pointerup: endPan,
            pointercancel: endPan,
            lostpointercapture: endPan,
            // The browser's own use of these presses: middle-click autoscroll,
            // and the context menu at the end of a right-drag
            mousedown: (event: MouseEvent) => {
                if (event.button === 1 && !onControl(event))
                    event.preventDefault();
            },
            contextmenu: (event: MouseEvent) => {
                if (!onControl(event)) event.preventDefault();
            },
        },
        { capture: true },
    );
    return () => {
        detach();
        if (pan) useFieldViewStore.setState({ panning: false });
    };
}

function listenForTouch(
    surface: HTMLElement,
    local: Local,
    settings: () => NavigationSettings,
) {
    const touches = new Map<number, ElementPoint>();
    let pinchDistance = 0;
    const distance = (list: TouchList) =>
        Math.hypot(
            list[1].clientX - list[0].clientX,
            list[1].clientY - list[0].clientY,
        );
    const remember = (touch: Touch) =>
        touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });

    const onTouchStart = (event: TouchEvent) => {
        // A tap on a control must still click it
        if (onControl(event)) return;
        event.preventDefault();
        Array.from(event.touches).forEach(remember);
        if (event.touches.length === 2) pinchDistance = distance(event.touches);
    };
    const onTouchMove = (event: TouchEvent) => {
        if (touches.size === 0) return;
        event.preventDefault();
        const previous = new Map(touches);
        Array.from(event.touches).forEach(remember);
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const last = previous.get(touch.identifier);
            if (!last) return;
            const speed = settings().trackpadPanSensitivity;
            setView(
                panBy(
                    view(),
                    (touch.clientX - last.x) * speed,
                    (touch.clientY - last.y) * speed,
                ),
            );
        } else if (event.touches.length === 2 && pinchDistance > 0) {
            const [a, b] = [event.touches[0], event.touches[1]];
            const now = distance(event.touches);
            const center = local(
                (a.clientX + b.clientX) / 2,
                (a.clientY + b.clientY) / 2,
            );
            const current = view();
            navigate(
                pinchStep(current, center, now - pinchDistance, current.field),
            );
            pinchDistance = now;
        }
    };
    const onTouchEnd = (event: TouchEvent) => {
        for (const touch of Array.from(event.changedTouches))
            touches.delete(touch.identifier);
        if (event.touches.length < 2) pinchDistance = 0;
    };
    return listen(
        surface,
        {
            touchstart: onTouchStart,
            touchmove: onTouchMove,
            touchend: onTouchEnd,
            touchcancel: onTouchEnd,
        },
        { passive: false },
    );
}
