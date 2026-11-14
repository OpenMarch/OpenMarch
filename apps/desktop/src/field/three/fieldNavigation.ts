import { isPreviewMode } from "@/stores/PreviewModeStore";
import {
    centerAtBase,
    clampPan,
    clampZoom,
    previewFit,
    isPanButton,
    panBy,
    viewBetween,
    wheel,
    zoomAt,
    type ElementPoint,
    type FieldView,
    type NavigationSettings,
} from "@/field/editor/view";
import { SpringValue } from "@react-spring/web";
import type { ZoomControlsCanvas } from "@/components/canvas/CanvasZoomControls";
import { isMacPlatform } from "@/shortcuts/platform";
import { useFieldViewStore } from "./fieldView";
import { currentQualitySettings } from "./useFieldQuality";

/**
 * The new field's navigation input: turns wheel and pointer events on the
 * field into view changes, by the rules in `src/field/editor/view.ts`,
 * and writes them to the view store. The thin DOM side of #194.
 */

const view = () => useFieldViewStore.getState();

/** The user has moved the view since it was last centered. */
let navigated = false;

/** Moves the view to `next` for the user. */
function navigate(next: FieldView) {
    // The user's own navigation stops a glide where it is
    stopGlide();
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

/**
 * The field fitted for the mode the app is in, in the field's pane as it is
 * now: in Preview, Preview's own fit; otherwise the whole field centered with
 * a margin. Either is 100% in the zoom controls. Null before the pane has a
 * size.
 */
function fittedView(): FieldView | null {
    const { width, height, field } = view();
    if (width <= 0 || height <= 0) return null;
    if (isPreviewMode())
        return previewFit(
            { width, height, zoom: 1, panX: 0, panY: 0 },
            { width, height },
            field,
        );
    return centerAtBase(width, height, field);
}

/**
 * Fits the field at once, as a show opens (the zoom percentage and switching
 * Preview glide there instead, `glideToFit`). The pane is measured now, so the
 * fit counts the timeline's current height.
 */
export function resetView() {
    const fit = fittedView();
    if (!fit) return;
    stopGlide();
    rebaseOnResize = false;
    navigated = false;
    useFieldViewStore.setState({ ...fit, baseZoom: fit.zoom });
}

/** How far along the glide to the fit is: 0 where it began, 1 at the fit. */
const glide = new SpringValue(0);

/** Quick, and it settles on the fit without overshooting it. */
const GLIDE_CONFIG = { tension: 280, friction: 30, clamp: true };

/**
 * The glide under way, if any, by number: a stopped glide's late callbacks
 * see a different number and do nothing.
 */
let gliding: number | null = null;
let glides = 0;

/** A glide waiting for the pane's new size (`glideToFitAfterResize`). */
let pendingGlide: ReturnType<typeof setTimeout> | null = null;

/**
 * A Preview switch's glide was stopped before it began: the next resize
 * still makes the new mode's fit 100%, without moving the view.
 */
let rebaseOnResize = false;

/** Stops the glide where it is, or one waiting to start. */
const stopGlide = () => {
    if (pendingGlide !== null) {
        clearTimeout(pendingGlide);
        pendingGlide = null;
        rebaseOnResize = true;
    }
    if (gliding === null) return;
    gliding = null;
    glide.stop();
};

const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Glides from the current view to the fit for the mode the app is in, as
 * clicking the zoom percentage and switching Preview on or off do. The fit is
 * measured each frame, so it follows the pane as panels come and go, and
 * lands on the pane as it is. Any navigation along the way stops the glide
 * where it is. With reduced motion, or in the field's low-quality mode
 * (Performance mode, or a machine that draws WebGL in software), it jumps
 * there.
 */
export function glideToFit() {
    const current = view();
    const fit = fittedView();
    if (!fit) return;
    if (prefersReducedMotion() || !currentQualitySettings().animateView)
        return resetView();
    const from: FieldView = {
        width: current.width,
        height: current.height,
        zoom: current.zoom,
        panX: current.panX,
        panY: current.panY,
    };
    stopGlide();
    rebaseOnResize = false;
    const id = ++glides;
    gliding = id;
    navigated = false;
    // The readout counts down to 100% as the field glides
    useFieldViewStore.setState({ baseZoom: fit.zoom });
    glide.set(0);
    void glide.start({
        to: 1,
        config: GLIDE_CONFIG,
        onChange: () => {
            // A pane squeezed to nothing has no fit: wait for it to come back
            const to = gliding === id ? fittedView() : null;
            if (!to) return;
            // A resize keeps where the glide began (its zoom and top-left)
            const start = { ...from, width: to.width, height: to.height };
            useFieldViewStore.setState({
                ...viewBetween(start, to, glide.get()),
                baseZoom: to.zoom,
            });
        },
        onRest: ({ finished }) => {
            if (gliding !== id) return;
            gliding = null;
            if (finished) resetView();
        },
    });
}

/**
 * Glides from the current view to `next`, within the zoom and pan limits, as
 * the floating editor does to keep a shape in view (#441). Like the glide to
 * the fit, any navigation or a press on the field stops it where it is, and
 * with reduced motion or in low quality it jumps. Returns the glide's number
 * for `isGliding`, or null when it jumped.
 */
export function glideTo(next: FieldView): number | null {
    const current = view();
    const to = clampPan({ ...next, zoom: clampZoom(next.zoom) }, current.field);
    if (prefersReducedMotion() || !currentQualitySettings().animateView) {
        setView(to);
        return null;
    }
    const from: FieldView = {
        width: current.width,
        height: current.height,
        zoom: current.zoom,
        panX: current.panX,
        panY: current.panY,
    };
    // A resize along the way keeps the pane's own size, as the glide to the fit does
    const along = (t: number) => {
        const { width, height } = view();
        return viewBetween(
            { ...from, width, height },
            { ...to, width, height },
            t,
        );
    };
    stopGlide();
    rebaseOnResize = false;
    const id = ++glides;
    gliding = id;
    navigated = true;
    glide.set(0);
    void glide.start({
        to: 1,
        config: GLIDE_CONFIG,
        onChange: () => {
            if (gliding === id) useFieldViewStore.setState(along(glide.get()));
        },
        onRest: ({ finished }) => {
            if (gliding !== id) return;
            gliding = null;
            if (finished) useFieldViewStore.setState(along(1));
        },
    });
    return id;
}

/** Whether the glide `glideTo` returned is still under way */
export const isGliding = (id: number | null) => id !== null && gliding === id;

/** How long a switch's glide waits for the pane's new size before going anyway. */
const RESIZE_WAIT_MS = 100;

/**
 * Glides to the fit once the pane has its new size: switching Preview adds or
 * takes away the panels around the field, and the canvas learns its new size
 * a few frames later. Gliding at once would aim at the old pane's fit first.
 */
export function glideToFitAfterResize() {
    stopGlide();
    pendingGlide = setTimeout(() => {
        pendingGlide = null;
        glideToFit();
    }, RESIZE_WAIT_MS);
}

/**
 * Fits the field again while the panels around it settle, as the show opens
 * or Preview switches, unless the user has already moved the view. A glide
 * under way follows the pane already.
 */
export function settleView() {
    if (!navigated && gliding === null && pendingGlide === null) resetView();
}

/**
 * The pane was resized (after the show opened). In order: a Preview switch's
 * glide waiting for the new size starts; Preview keeps the field fitted; until
 * the view has `settled`, the field fits again. Otherwise a resize keeps the
 * zoom and the top-left (UI-19), and a glide under way follows the pane.
 */
export function fitAfterResize(settled: boolean) {
    if (rebaseOnResize) {
        rebaseOnResize = false;
        const fit = fittedView();
        if (fit) useFieldViewStore.setState({ baseZoom: fit.zoom });
    }
    if (pendingGlide !== null) {
        clearTimeout(pendingGlide);
        pendingGlide = null;
        glideToFit();
    } else if (isPreviewMode()) {
        if (gliding === null) resetView();
    } else if (!settled) {
        settleView();
    }
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
    centerAtBaseZoom: glideToFit,
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
 * the overlay) are theirs, not navigation's or the gesture adapter's.
 */
export const onControl = (event: Event) =>
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
 *   field's other pointer handling skips these presses (`isPanPress`). In
 *   Preview, which edits nothing, a left-drag pans too.
 * - Fingers (and the pen's palm rule) are the gesture adapter's,
 *   `fieldGestures.ts`, attached beside this.
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
    // A press on the field (a drag, a marquee, a tool) stops a glide, so
    // the view holds still under it
    const onPress = (event: PointerEvent) => {
        if (!onControl(event)) stopGlide();
    };
    const detach = [
        listen(surface, { pointerdown: onPress }, { capture: true }),
        listenForWheel(surface, local, settings),
        listenForPanDrags(surface),
    ];
    return () => {
        detach.forEach((cleanup) => cleanup());
        // Nothing to glide once the field is gone
        stopGlide();
        rebaseOnResize = false;
    };
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
        const previewDrag =
            event.pointerType !== "touch" &&
            event.button === 0 &&
            isPreviewMode();
        if (!(isPanPress(event) || previewDrag) || onControl(event)) return;
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
