/**
 * Decides what each finger and pen press on the field does. Pure: the DOM
 * adapter (`touchGestureAdapter.ts`) feeds it pointer events and timer ticks
 * and carries out the effects it returns.
 *
 * Rules:
 * - One finger belongs to Fabric (select, drag, rubber band) and its events
 *   pass through.
 * - A second finger turns the press into a two-finger gesture: Fabric's action
 *   is cancelled and every finger then pans and pinches the view until all
 *   fingers are up. Going back down to one finger keeps navigating; it never
 *   resumes editing.
 * - A quick tap with two fingers is undo, with three fingers redo.
 * - Holding one finger still fires a long press (toggle a marcher in the
 *   selection, or start the lasso on empty field).
 * - A pen edits like a mouse. While a pen is down, or was used in the last
 *   moments, fingers only navigate (palm rejection).
 */

export type GesturePointerKind = "touch" | "pen";

export interface GesturePoint {
    x: number;
    y: number;
}

export interface PointerInput<
    T extends "down" | "move" | "up" | "cancel" =
        | "down"
        | "move"
        | "up"
        | "cancel",
> {
    type: T;
    id: number;
    kind: GesturePointerKind;
    /** Client coordinates (px) */
    x: number;
    y: number;
    /** Milliseconds, any monotonic clock */
    t: number;
}

export type GestureInput =
    | PointerInput<"down">
    | PointerInput<"move">
    | PointerInput<"up">
    | PointerInput<"cancel">
    | { type: "timer"; t: number }
    /** The adapter used the long press itself; the rest of that finger's press stays away from Fabric */
    | { type: "blockSingle" };

/**
 * A baseline for navigation: the view at `start` is kept, and the current
 * geometry is compared against it.
 */
export interface NavigationGeometry {
    /** Midpoint of the navigating fingers (one finger: the finger itself) */
    mid: GesturePoint;
    /** Distance between the first two fingers, or null with one finger (pan only) */
    distance: number | null;
}

export type GestureEffect =
    /** First finger down: remember the selection and let Fabric have the press */
    | { type: "singleStart"; id: number; point: GesturePoint }
    /** The first finger moved past the tap slop */
    | { type: "singleDragged"; id: number }
    /** First finger lifted; `tap` when it barely moved and no long press fired */
    | { type: "singleEnd"; id: number; tap: boolean; point: GesturePoint }
    /** Undo whatever Fabric started for the first finger, and restore the selection */
    | { type: "cancelSingle" }
    /** The first finger was held still */
    | { type: "longPress"; id: number; point: GesturePoint }
    /** Start (or restart) navigation from this geometry */
    | { type: "navigationStart"; geometry: NavigationGeometry }
    /** Move the view so the start geometry lands on this one */
    | { type: "navigate"; geometry: NavigationGeometry }
    | { type: "navigationEnd" }
    | { type: "undo" }
    | { type: "redo" };

export interface GestureResult {
    state: GestureState;
    effects: GestureEffect[];
    /** Whether the DOM event should reach Fabric */
    passThrough: boolean;
}

interface TrackedPointer {
    id: number;
    start: GesturePoint;
    current: GesturePoint;
    /** Furthest distance from `start` so far */
    maxMove: number;
}

interface TapCandidate {
    firstDownAt: number;
    maxFingers: number;
}

export interface GestureState {
    mode: "idle" | "single" | "singleBlocked" | "gesture";
    /** Fingers on the field, in the order they went down */
    pointers: TrackedPointer[];
    /** When the single finger's long press fires, or null */
    longPressAt: number | null;
    longPressFired: boolean;
    tap: TapCandidate | null;
    /** Pens currently down */
    pensDown: number[];
    /** When a pen was last seen, or -Infinity */
    lastPenAt: number;
}

export const GESTURE_TIMING = {
    /** Hold this long without moving for a long press */
    longPressMs: 450,
    /** A long press is lost when the finger moves further than this (px) */
    longPressSlopPx: 8,
    /** A single finger tap moves less than this (px) */
    tapSlopPx: 10,
    /** All fingers of a multi-finger tap go down within this */
    multiTapDownWindowMs: 250,
    /** A multi-finger tap is over (all fingers up) within this, from the first finger down */
    multiTapMaxMs: 400,
    /** Fingers in a multi-finger tap move less than this (px) */
    multiTapSlopPx: 12,
    /** Fingers only navigate for this long after a pen was used */
    palmRejectMs: 1500,
} as const;

export const initialGestureState = (): GestureState => ({
    mode: "idle",
    pointers: [],
    longPressAt: null,
    longPressFired: false,
    tap: null,
    pensDown: [],
    lastPenAt: -Infinity,
});

const distance = (a: GesturePoint, b: GesturePoint) =>
    Math.hypot(a.x - b.x, a.y - b.y);

/** The navigation geometry of the given fingers (at least one) */
export function navigationGeometry(
    points: GesturePoint[],
): NavigationGeometry | null {
    if (points.length === 0) return null;
    if (points.length === 1) return { mid: { ...points[0] }, distance: null };
    const [a, b] = points;
    return {
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: distance(a, b),
    };
}

const geometryOf = (state: GestureState) =>
    navigationGeometry(state.pointers.map((p) => p.current));

const penActive = (state: GestureState, t: number) =>
    state.pensDown.length > 0 ||
    t - state.lastPenAt < GESTURE_TIMING.palmRejectMs;

const result = (
    state: GestureState,
    effects: GestureEffect[],
    passThrough: boolean,
): GestureResult => ({ state, effects, passThrough });

/** Moves into navigation with the current fingers */
const enterGesture = (
    state: GestureState,
    effects: GestureEffect[],
): GestureState => {
    const next: GestureState = {
        ...state,
        mode: "gesture",
        longPressAt: null,
    };
    const geometry = geometryOf(next);
    if (geometry) effects.push({ type: "navigationStart", geometry });
    return next;
};

// eslint-disable-next-line max-lines-per-function
function handlePen(state: GestureState, input: PointerInput): GestureResult {
    const effects: GestureEffect[] = [];
    let next: GestureState = { ...state, lastPenAt: input.t };
    if (input.type === "down") {
        next.pensDown = [
            ...state.pensDown.filter((id) => id !== input.id),
            input.id,
        ];
        // A palm already resting on the field: take its press back from Fabric
        if (state.mode === "single" || state.mode === "singleBlocked") {
            if (state.mode === "single") effects.push({ type: "cancelSingle" });
            next = enterGesture({ ...next, tap: null }, effects);
        }
    } else if (input.type === "up" || input.type === "cancel") {
        next.pensDown = state.pensDown.filter((id) => id !== input.id);
    }
    return result(next, effects, true);
}

// eslint-disable-next-line max-lines-per-function
function handleTouchDown(
    state: GestureState,
    input: PointerInput<"down">,
): GestureResult {
    const effects: GestureEffect[] = [];
    const point = { x: input.x, y: input.y };
    const pointer: TrackedPointer = {
        id: input.id,
        start: point,
        current: point,
        maxMove: 0,
    };
    const pointers = [
        ...state.pointers.filter((p) => p.id !== input.id),
        pointer,
    ];

    if (state.mode === "idle") {
        if (penActive(state, input.t)) {
            // Palm: navigate only
            const next = enterGesture(
                { ...state, pointers, tap: null, longPressFired: false },
                effects,
            );
            return result(next, effects, false);
        }
        effects.push({ type: "singleStart", id: input.id, point });
        return result(
            {
                ...state,
                mode: "single",
                pointers,
                longPressAt: input.t + GESTURE_TIMING.longPressMs,
                longPressFired: false,
                tap: { firstDownAt: input.t, maxFingers: 1 },
            },
            effects,
            true,
        );
    }

    // Another finger joins
    let tap = state.tap;
    if (tap) {
        const stillTap =
            input.t - tap.firstDownAt <= GESTURE_TIMING.multiTapDownWindowMs &&
            state.pointers.every(
                (p) => p.maxMove < GESTURE_TIMING.multiTapSlopPx,
            ) &&
            !state.longPressFired;
        tap = stillTap
            ? { ...tap, maxFingers: Math.max(tap.maxFingers, pointers.length) }
            : null;
    }
    if (state.mode === "single") effects.push({ type: "cancelSingle" });
    const next = enterGesture({ ...state, pointers, tap }, effects);
    return result(next, effects, false);
}

function handleTouchMove(
    state: GestureState,
    input: PointerInput<"move">,
): GestureResult {
    const index = state.pointers.findIndex((p) => p.id === input.id);
    if (index === -1) return result(state, [], state.mode === "idle");
    const old = state.pointers[index];
    const current = { x: input.x, y: input.y };
    const moved = distance(old.start, current);
    const updated: TrackedPointer = {
        ...old,
        current,
        maxMove: Math.max(old.maxMove, moved),
    };
    const pointers = state.pointers.slice();
    pointers[index] = updated;
    const effects: GestureEffect[] = [];
    let next: GestureState = { ...state, pointers };

    if (state.mode === "single" || state.mode === "singleBlocked") {
        if (
            next.longPressAt !== null &&
            updated.maxMove > GESTURE_TIMING.longPressSlopPx
        ) {
            next.longPressAt = null;
        }
        if (
            old.maxMove < GESTURE_TIMING.tapSlopPx &&
            updated.maxMove >= GESTURE_TIMING.tapSlopPx
        ) {
            effects.push({ type: "singleDragged", id: input.id });
        }
        return result(next, effects, state.mode === "single");
    }

    // gesture
    if (next.tap && updated.maxMove >= GESTURE_TIMING.multiTapSlopPx) {
        next = { ...next, tap: null };
    }
    const geometry = geometryOf(next);
    if (geometry) effects.push({ type: "navigate", geometry });
    return result(next, effects, false);
}

// eslint-disable-next-line max-lines-per-function
function handleTouchEnd(
    state: GestureState,
    input: PointerInput<"up"> | PointerInput<"cancel">,
): GestureResult {
    const pointer = state.pointers.find((p) => p.id === input.id);
    if (!pointer) return result(state, [], state.mode === "idle");
    const pointers = state.pointers.filter((p) => p.id !== input.id);
    const effects: GestureEffect[] = [];
    const cancelled = input.type === "cancel";

    if (state.mode === "single" || state.mode === "singleBlocked") {
        if (state.mode === "single") {
            if (cancelled) effects.push({ type: "cancelSingle" });
            else
                effects.push({
                    type: "singleEnd",
                    id: input.id,
                    tap:
                        pointer.maxMove < GESTURE_TIMING.tapSlopPx &&
                        !state.longPressFired,
                    point: { x: input.x, y: input.y },
                });
        }
        return result(
            {
                ...state,
                mode: "idle",
                pointers,
                longPressAt: null,
                longPressFired: false,
                tap: null,
            },
            effects,
            state.mode === "single",
        );
    }

    // gesture
    if (pointers.length > 0) {
        const tap = cancelled ? null : state.tap;
        const next: GestureState = { ...state, pointers, tap };
        const geometry = geometryOf(next);
        // Re-baseline so the remaining fingers don't make the view jump
        if (geometry) effects.push({ type: "navigationStart", geometry });
        return result(next, effects, false);
    }

    effects.push({ type: "navigationEnd" });
    const tap = state.tap;
    if (
        !cancelled &&
        tap &&
        input.t - tap.firstDownAt <= GESTURE_TIMING.multiTapMaxMs &&
        pointer.maxMove < GESTURE_TIMING.multiTapSlopPx
    ) {
        if (tap.maxFingers === 2) effects.push({ type: "undo" });
        else if (tap.maxFingers === 3) effects.push({ type: "redo" });
    }
    return result(
        {
            ...state,
            mode: "idle",
            pointers,
            longPressAt: null,
            longPressFired: false,
            tap: null,
        },
        effects,
        false,
    );
}

/** Advances the gesture state by one input */
export function stepGesture(
    state: GestureState,
    input: GestureInput,
): GestureResult {
    if (input.type === "timer") {
        if (
            state.mode === "single" &&
            state.longPressAt !== null &&
            input.t >= state.longPressAt &&
            state.pointers.length === 1
        ) {
            const pointer = state.pointers[0];
            return result(
                {
                    ...state,
                    longPressAt: null,
                    longPressFired: true,
                    tap: null,
                },
                [
                    {
                        type: "longPress",
                        id: pointer.id,
                        point: { ...pointer.current },
                    },
                ],
                true,
            );
        }
        return result(state, [], true);
    }
    if (input.type === "blockSingle") {
        if (state.mode !== "single") return result(state, [], true);
        return result({ ...state, mode: "singleBlocked" }, [], false);
    }
    if (input.kind === "pen") return handlePen(state, input);

    switch (input.type) {
        case "down":
            return handleTouchDown(state, input);
        case "move":
            return handleTouchMove(state, input);
        case "up":
        case "cancel":
            return handleTouchEnd(state, input);
    }
}

/**
 * The viewport transform that keeps the canvas point under the start midpoint
 * under the current midpoint, scaled by how far the fingers spread.
 *
 * @param startVpt Viewport transform when navigation (re)started
 * @param start Geometry when navigation (re)started
 * @param current Current geometry
 * @param clampZoom Limits the new zoom
 * @returns The new viewport transform
 */
export function navigationTransform(
    startVpt: readonly number[],
    start: NavigationGeometry,
    current: NavigationGeometry,
    clampZoom: (zoom: number) => number,
): number[] {
    const z0 = startVpt[0];
    let zoom = z0;
    if (
        start.distance !== null &&
        current.distance !== null &&
        start.distance > 0
    ) {
        zoom = clampZoom((z0 * current.distance) / start.distance);
    }
    // Canvas point that was under the start midpoint
    const canvasX = (start.mid.x - startVpt[4]) / z0;
    const canvasY = (start.mid.y - startVpt[5]) / z0;
    return [
        zoom,
        0,
        0,
        zoom,
        current.mid.x - canvasX * zoom,
        current.mid.y - canvasY * zoom,
    ];
}
