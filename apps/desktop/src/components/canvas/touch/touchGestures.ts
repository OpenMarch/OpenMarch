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
 * - Holding one finger still arms a long press. It only takes effect when the
 *   finger lifts without having moved (toggle a marcher in the selection); if
 *   the finger moves instead, the press carries on as a drag (or, from empty
 *   field, turns into the lasso). Deciding on release, not on the timer, means
 *   a slow start to a drag, or moves the browser delivers late, can never be
 *   mistaken for a long press.
 * - A pen edits like a mouse. While a pen is down, fingers on the field are
 *   ignored. Shortly after the pen lifts, a finger can move the view but
 *   never edits (palm rejection by timing; see isPalmContact).
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
    /** Milliseconds, any monotonic clock (the event's own time) */
    t: number;
    /** The contact is palm-sized (only read on "down") */
    large?: boolean;
}

export type GestureInput =
    | PointerInput<"down">
    | PointerInput<"move">
    | PointerInput<"up">
    | PointerInput<"cancel">
    | { type: "timer"; t: number }
    /**
     * The adapter turned the single finger's press into panning the view (the
     * "Move view" field drag mode); the rest of it navigates
     */
    | { type: "panSingle" };

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
    /** First finger lifted; `tap` when it barely moved and no long press was armed */
    | { type: "singleEnd"; id: number; tap: boolean; point: GesturePoint }
    /** Undo whatever Fabric started for the first finger, and restore the selection */
    | { type: "cancelSingle" }
    /** The first finger has been held still long enough: show that a long press is ready */
    | { type: "longPressArmed"; id: number; point: GesturePoint }
    /** The finger moved after the long press was armed; the press carries on */
    | { type: "longPressMoved"; id: number }
    /**
     * The long press was armed by mistake: a move (or the release) that came in
     * late had happened before the hold was long enough. The press is an
     * ordinary drag (or tap).
     */
    | { type: "longPressCancelled"; id: number }
    /** The finger lifted from an armed long press without moving: carry it out (Fabric doesn't see this release) */
    | { type: "longPressCommit"; id: number; point: GesturePoint }
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
    mode: "idle" | "single" | "gesture";
    /** Fingers on the field, in the order they went down */
    pointers: TrackedPointer[];
    /** When the single finger's long press arms, or null */
    longPressAt: number | null;
    /** The long press is armed and the finger hasn't moved since */
    longPressArmed: boolean;
    /** When the armed long press became due (event time), or null */
    longPressDueAt: number | null;
    tap: TapCandidate | null;
    /** In a gesture, one finger alone does nothing (fingers right after the pen) */
    twoFingerOnly: boolean;
    /** Fingers whose whole press is ignored (palm, or down while a pen is) */
    ignored: number[];
    /** Pens currently down */
    pensDown: number[];
    /** When a pen was last seen, or -Infinity */
    lastPenAt: number;
}

export const GESTURE_TIMING = {
    /** Hold this long without moving to arm a long press */
    longPressMs: 500,
    /** A long press is lost when the finger moves further than this (px) */
    longPressSlopPx: 8,
    /**
     * A first move after an armed long press that jumps further than this (px)
     * at once means the moves were held back: the finger was moving all along
     */
    longPressLateJumpPx: 40,
    /** A single finger tap moves less than this (px) */
    tapSlopPx: 10,
    /** All fingers of a multi-finger tap go down within this */
    multiTapDownWindowMs: 400,
    /** A multi-finger tap is over (all fingers up) within this, from the first finger down */
    multiTapMaxMs: 600,
    /** Fingers in a multi-finger tap move less than this (px) */
    multiTapSlopPx: 12,
    /** For this long after a pen was used, fingers only navigate (never edit) */
    palmRejectMs: 1000,
} as const;

/**
 * Contact size is not used to spot palms: real iPads report a fingertip as
 * 40–50 px wide in Safari (emulators report ~1 px), so any size threshold that
 * catches palms also swallows fingers. Palms are rejected by timing instead:
 * touches are ignored while a pen is down, and only navigate just after it.
 */
export const isPalmContact = (_e: { width?: number; height?: number }) => false;

export const initialGestureState = (): GestureState => ({
    mode: "idle",
    pointers: [],
    longPressAt: null,
    longPressArmed: false,
    longPressDueAt: null,
    tap: null,
    twoFingerOnly: false,
    ignored: [],
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
    state.twoFingerOnly && state.pointers.length < 2
        ? null
        : navigationGeometry(state.pointers.map((p) => p.current));

const penRecent = (state: GestureState, t: number) =>
    t - state.lastPenAt < GESTURE_TIMING.palmRejectMs;

const result = (
    state: GestureState,
    effects: GestureEffect[],
    passThrough: boolean,
): GestureResult => ({ state, effects, passThrough });

const idle = (state: GestureState, pointers: TrackedPointer[] = []) => ({
    ...state,
    mode: "idle" as const,
    pointers,
    longPressAt: null,
    longPressArmed: false,
    longPressDueAt: null,
    tap: null,
    twoFingerOnly: false,
});

/** Moves into navigation with the current fingers */
const enterGesture = (
    state: GestureState,
    effects: GestureEffect[],
): GestureState => {
    const next: GestureState = {
        ...state,
        mode: "gesture",
        longPressAt: null,
        longPressArmed: false,
    };
    const geometry = geometryOf(next);
    if (geometry) effects.push({ type: "navigationStart", geometry });
    return next;
};

function handlePen(state: GestureState, input: PointerInput): GestureResult {
    const effects: GestureEffect[] = [];
    let next: GestureState = { ...state, lastPenAt: input.t };
    if (input.type === "down") {
        next.pensDown = [
            ...state.pensDown.filter((id) => id !== input.id),
            input.id,
        ];
        // Fingers already on the field (a resting palm) lose their press
        if (state.mode === "single") effects.push({ type: "cancelSingle" });
        if (state.mode === "gesture") effects.push({ type: "navigationEnd" });
        next = {
            ...idle(next),
            ignored: [...state.ignored, ...state.pointers.map((p) => p.id)],
        };
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
    // A palm, or any finger while the pen is down: ignored for its whole press
    if (input.large || state.pensDown.length > 0) {
        return result(
            {
                ...state,
                ignored: [
                    ...state.ignored.filter((id) => id !== input.id),
                    input.id,
                ],
            },
            [],
            false,
        );
    }

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
        if (penRecent(state, input.t)) {
            // Just after the pen: a finger may move the view but never edits
            const next = enterGesture(
                { ...state, pointers, tap: null, twoFingerOnly: false },
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
                longPressArmed: false,
                tap: { firstDownAt: input.t, maxFingers: 1 },
                twoFingerOnly: false,
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
            );
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
    if (state.ignored.includes(input.id)) return result(state, [], false);
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

    if (state.mode === "single") {
        if (updated.maxMove > GESTURE_TIMING.longPressSlopPx) {
            next.longPressAt = null;
            if (state.longPressArmed) {
                next.longPressArmed = false;
                // Moves can be handled late: what counts is when it happened.
                // And a busy page can hold back every move until after the
                // hold was due, then deliver one big jump: a finger that has
                // really held still starts a drag with small steps.
                const early =
                    (state.longPressDueAt !== null &&
                        input.t < state.longPressDueAt) ||
                    distance(old.current, current) >
                        GESTURE_TIMING.longPressLateJumpPx;
                effects.push({
                    type: early ? "longPressCancelled" : "longPressMoved",
                    id: input.id,
                });
            }
        }
        if (
            old.maxMove < GESTURE_TIMING.tapSlopPx &&
            updated.maxMove >= GESTURE_TIMING.tapSlopPx
        ) {
            effects.push({ type: "singleDragged", id: input.id });
        }
        return result(next, effects, true);
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
    if (state.ignored.includes(input.id)) {
        return result(
            {
                ...state,
                ignored: state.ignored.filter((id) => id !== input.id),
            },
            [],
            false,
        );
    }
    const pointer = state.pointers.find((p) => p.id === input.id);
    if (!pointer) return result(state, [], state.mode === "idle");
    const pointers = state.pointers.filter((p) => p.id !== input.id);
    const effects: GestureEffect[] = [];
    const cancelled = input.type === "cancel";
    const point = { x: input.x, y: input.y };
    // Where it lifted counts too: a quick flick may bring few moves, or none
    const maxMove = cancelled
        ? pointer.maxMove
        : Math.max(pointer.maxMove, distance(pointer.start, point));

    if (state.mode === "single") {
        if (cancelled) {
            effects.push({ type: "cancelSingle" });
            return result(idle(state, pointers), effects, true);
        }
        if (state.longPressArmed) {
            if (
                state.longPressDueAt === null ||
                input.t >= state.longPressDueAt
            ) {
                effects.push({ type: "longPressCommit", id: input.id, point });
                return result(idle(state, pointers), effects, false);
            }
            // Lifted before the hold was long enough, but handled late
            effects.push({ type: "longPressCancelled", id: input.id });
        }
        effects.push({
            type: "singleEnd",
            id: input.id,
            tap: maxMove < GESTURE_TIMING.tapSlopPx,
            point,
        });
        return result(idle(state, pointers), effects, true);
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

    // The view follows the last finger all the way to where it lifted
    if (!cancelled) {
        const final = geometryOf({
            ...state,
            pointers: [{ ...pointer, current: point }],
        });
        if (final) effects.push({ type: "navigate", geometry: final });
    }
    effects.push({ type: "navigationEnd" });
    const tap = state.tap;
    if (
        !cancelled &&
        tap &&
        input.t - tap.firstDownAt <= GESTURE_TIMING.multiTapMaxMs &&
        maxMove < GESTURE_TIMING.multiTapSlopPx
    ) {
        if (tap.maxFingers === 2) effects.push({ type: "undo" });
        else if (tap.maxFingers === 3) effects.push({ type: "redo" });
    }
    return result(idle(state, pointers), effects, false);
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
                    longPressArmed: true,
                    longPressDueAt: state.longPressAt,
                    tap: null,
                },
                [
                    {
                        type: "longPressArmed",
                        id: pointer.id,
                        point: { ...pointer.current },
                    },
                ],
                true,
            );
        }
        return result(state, [], true);
    }
    if (input.type === "panSingle") {
        if (state.mode !== "single" || state.pointers.length !== 1)
            return result(state, [], true);
        const pointer = state.pointers[0];
        // Baseline at the press, so the view catches up with the whole drag
        return result(
            {
                ...state,
                mode: "gesture",
                longPressAt: null,
                longPressArmed: false,
                tap: null,
                twoFingerOnly: false,
            },
            [
                {
                    type: "navigationStart",
                    geometry: { mid: { ...pointer.start }, distance: null },
                },
            ],
            false,
        );
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
