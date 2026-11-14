/**
 * The field's view: how far it's zoomed and where it's panned, and the rules
 * every navigation input follows (fork #189, ticket #194). Plain functions
 * over plain data, with no DOM, React or renderer, so the limits and the
 * zoom-at-a-point math are unit-tested here and any field renderer can use
 * them.
 *
 * Field units are the timeline's (x right, y toward the front sideline). A
 * field point (x, y) sits at `(panX + x * zoom, panY + y * zoom)` CSS pixels
 * from the field element's top-left corner.
 */

export type FieldView = {
    /** The field element's size in CSS pixels. */
    width: number;
    height: number;
    /** CSS pixels per field unit. */
    zoom: number;
    /** Where field (0, 0) sits, in CSS pixels from the element's top-left. */
    panX: number;
    panY: number;
};

/** The field's size in field units. */
export type FieldSize = { width: number; height: number };

/** A point in the field element, in CSS pixels from its top-left. */
export type ElementPoint = { x: number; y: number };

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 25;
/** Each press of the zoom buttons multiplies or divides the zoom by this. */
export const ZOOM_BUTTON_STEP = 1.2;

export const clampZoom = (zoom: number) =>
    Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

/**
 * Zooms to `zoom` (within the limits), keeping the field point under `point`
 * where it is.
 */
export function zoomAt(
    view: FieldView,
    point: ElementPoint,
    zoom: number,
): FieldView {
    const next = clampZoom(zoom);
    const ratio = next / view.zoom;
    return {
        ...view,
        zoom: next,
        panX: point.x - (point.x - view.panX) * ratio,
        panY: point.y - (point.y - view.panY) * ratio,
    };
}

/** Moves the field by (dx, dy) CSS pixels. */
export const panBy = (view: FieldView, dx: number, dy: number): FieldView => ({
    ...view,
    panX: view.panX + dx,
    panY: view.panY + dy,
});

/**
 * Keeps the field from being lost: it may scroll at most one element's size
 * past the element's edges, at any zoom. When the field is smaller than the
 * element, it may also sit anywhere inside it.
 */
export function clampPan(view: FieldView, field: FieldSize): FieldView {
    const clamp = (pan: number, viewport: number, content: number) => {
        const spare = viewport - content * view.zoom;
        const min = Math.min(spare, 0) - viewport;
        const max = Math.max(spare, 0) + viewport;
        return Math.max(min, Math.min(max, pan));
    };
    return {
        ...view,
        panX: clamp(view.panX, view.width, field.width),
        panY: clamp(view.panY, view.height, field.height),
    };
}

/** The room kept around the fitted field on each side, in CSS pixels. */
const FIT_MARGIN = 16;

/**
 * The base zoom (100% in the zoom controls): the zoom at which the whole
 * field fits the element, across and down, with a small margin on each side.
 * The element is the field's pane, so the fit follows the pane as the
 * timeline below it grows or shrinks.
 */
export function baseZoom(
    width: number,
    height: number,
    field: FieldSize,
): number {
    if (field.width <= 0 || field.height <= 0) return 1;
    if (width <= 0 || height <= 0) return 1;
    // A small pane keeps most of its room for the field
    const room = (size: number) => size - 2 * Math.min(FIT_MARGIN, size * 0.05);
    return clampZoom(
        Math.min(room(width) / field.width, room(height) / field.height),
    );
}

/**
 * The view a show opens at, and that the reset button returns to: the whole
 * field fitted and centered, at the base zoom.
 */
export function centerAtBase(
    width: number,
    height: number,
    field: FieldSize,
): FieldView {
    const zoom = baseZoom(width, height, field);
    return clampPan(
        {
            width,
            height,
            zoom,
            panX: (width - field.width * zoom) / 2,
            panY: (height - field.height * zoom) / 2,
        },
        field,
    );
}

/**
 * The view `t` of the way from `from` to `to` (0 to 1), as if the element's
 * visible part of the field slid and resized in a straight line from one to
 * the other. Clicking the zoom percentage glides along this.
 */
export function viewBetween(
    from: FieldView,
    to: FieldView,
    t: number,
): FieldView {
    const left = (v: FieldView) => -v.panX / v.zoom;
    const right = (v: FieldView) => (v.width - v.panX) / v.zoom;
    const top = (v: FieldView) => -v.panY / v.zoom;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const shownLeft = lerp(left(from), left(to));
    const zoom = to.width / (lerp(right(from), right(to)) - shownLeft);
    return {
        ...to,
        zoom,
        panX: -shownLeft * zoom,
        panY: -lerp(top(from), top(to)) * zoom,
    };
}

/** In Preview, the share of its container the field fills. */
const PREVIEW_FILL = 0.87;

/**
 * The view in Preview (100% there): the whole field at 87% of `container`,
 * the field's pane, centered across and a tenth of the spare height down.
 */
export function previewFit(
    view: FieldView,
    container: { width: number; height: number },
    field: FieldSize,
): FieldView | null {
    if (container.width <= 0 || container.height <= 0) return null;
    if (field.width <= 0 || field.height <= 0) return null;
    const zoom = Math.min(
        (container.width / field.width) * PREVIEW_FILL,
        (container.height / field.height) * PREVIEW_FILL,
    );
    return {
        ...view,
        zoom,
        panX: (container.width - field.width * zoom) / 2,
        panY: (container.height - field.height * zoom) / 10,
    };
}

/** The navigation settings (Settings > Mouse). */
export type NavigationSettings = {
    /** Two-finger scroll pans instead of zooming. */
    trackpadMode: boolean;
    /** 0.5 to 4: how fast the wheel and pinch zoom. */
    zoomSensitivity: number;
    /** 0.1 to 3: how far a trackpad scroll or a touch drag pans. */
    trackpadPanSensitivity: number;
};

/** A wheel event, with its position in the field element. */
export type WheelInput = ElementPoint & {
    deltaX: number;
    deltaY: number;
    /** A trackpad pinch arrives as a wheel event with Ctrl held. */
    ctrlKey: boolean;
    metaKey: boolean;
};

/**
 * What a wheel event does. Ctrl or Cmd (and a trackpad pinch) zooms at the
 * pointer in either mode. Otherwise the wheel zooms at the pointer in mouse
 * mode, and pans in trackpad mode.
 */
export function wheel(
    view: FieldView,
    input: WheelInput,
    settings: NavigationSettings,
    field: FieldSize,
): FieldView {
    const pinch = input.ctrlKey || input.metaKey;
    if (!pinch && settings.trackpadMode)
        return clampPan(
            panBy(
                view,
                -input.deltaX * settings.trackpadPanSensitivity,
                -input.deltaY * settings.trackpadPanSensitivity,
            ),
            field,
        );
    // A pinch zooms about three times as fast as the wheel
    const base = pinch ? 0.99 : 0.997;
    const zoom =
        view.zoom * base ** (input.deltaY * 0.5 * settings.zoomSensitivity);
    if (Math.abs(clampZoom(zoom) - view.zoom) < 0.0001) return view;
    return clampPan(zoomAt(view, input, zoom), field);
}

/** The element's center, where the zoom buttons zoom. */
export const viewCenter = (view: FieldView): ElementPoint => ({
    x: view.width / 2,
    y: view.height / 2,
});

/**
 * Where the fingers are during a touch navigation, in element pixels: the
 * point between them (one finger: the finger itself) and, with two or more
 * fingers, how far apart the first two are.
 */
export type TouchGeometry = { mid: ElementPoint; distance: number | null };

/**
 * The view during a touch navigation: the field point that was under the
 * fingers when it began (`from`, with the view `start`) stays under them now
 * (`to`), and the zoom grows by as much as the fingers spread. One finger, or
 * two moving together, pans one to one; two fingers moving apart zoom about
 * the point between them, so the field stays under each finger.
 */
export function touchNavigation(
    start: FieldView,
    from: TouchGeometry,
    to: TouchGeometry,
    field: FieldSize,
): FieldView {
    const spread =
        from.distance !== null && to.distance !== null && from.distance > 0
            ? to.distance / from.distance
            : 1;
    const zoom = clampZoom(start.zoom * spread);
    // The field point under the fingers when the navigation began
    const fieldX = (from.mid.x - start.panX) / start.zoom;
    const fieldY = (from.mid.y - start.panY) / start.zoom;
    return clampPan(
        {
            ...start,
            zoom,
            panX: to.mid.x - fieldX * zoom,
            panY: to.mid.y - fieldY * zoom,
        },
        field,
    );
}

/** The pointer buttons that pan: right (Ctrl+left on a Mac) and middle. */
export function isPanButton(
    event: { button: number; ctrlKey: boolean },
    isMac: boolean,
): boolean {
    if (event.button === 1 || event.button === 2) return true;
    return isMac && event.button === 0 && event.ctrlKey;
}
