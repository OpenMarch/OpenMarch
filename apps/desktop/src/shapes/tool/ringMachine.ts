import { toolId, type AnyToolKind } from "./toolKind";
import type { ShapeToolEntry } from "./shapeTools";

/** How many shapes the favorites ring holds, so it stays fast to aim at (#344) */
export const RING_SLOTS = 8;

/** A shape the ring offers: a basic kind, or (once the library exists, #352) a starred shape */
export interface RingShape {
    readonly id: string;
    readonly label: string;
    /** Drawn as its picture (#378), from its own geometry */
    readonly kind: AnyToolKind;
}

/**
 * The ring's slots: starred shapes first, then the basic kinds in the Shapes tab's order to fill
 * the empty ones, at most {@link RING_SLOTS}. A starred basic kind isn't offered twice.
 */
export function ringSlots(
    starred: readonly RingShape[],
    basics: readonly ShapeToolEntry[],
): RingShape[] {
    const slots = starred.slice(0, RING_SLOTS);
    for (const { kind } of basics) {
        if (slots.length >= RING_SLOTS) break;
        if (slots.some((s) => s.id === toolId(kind))) continue;
        slots.push({
            id: toolId(kind),
            // A getter, so a kept slot follows the app's language
            get label() {
                return kind.shape.label;
            },
            kind,
        });
    }
    return slots;
}

interface Point {
    readonly x: number;
    readonly y: number;
}

/** Screen pixels from the ring's center to its slots */
export const RING_RADIUS = 96;
/** Within this many pixels of the center nothing is aimed at, so opening it picks nothing */
const DEAD_ZONE = 28;
/** A latched ring picks only clicks this close to its slots; further away a click dismisses it */
const LATCHED_REACH = RING_RADIUS + 64;
/** A press of R shorter than this is a tap, which latches the ring open (#344) */
export const RING_TAP_MS = 250;

/**
 * The slot aimed at from the ring's center by `offset` (screen pixels), of `count` slots laid
 * clockwise from the top. A held ring is a flick, so any distance past the center aims; a latched
 * ring is clicked, so only near its slots.
 */
export function slotAt(
    offset: Point,
    count: number,
    latched: boolean,
): number | null {
    const distance = Math.hypot(offset.x, offset.y);
    if (count === 0 || distance < DEAD_ZONE) return null;
    if (latched && distance > LATCHED_REACH) return null;
    // Clockwise from the top: 0 straight up
    const turn = Math.atan2(offset.x, -offset.y) / (2 * Math.PI);
    return Math.round((((turn % 1) + 1) % 1) * count) % count;
}

/** The angle (radians, screen axes) slot `index` of `count` sits at, clockwise from the top */
export function slotAngle(index: number, count: number): number {
    return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

/**
 * An open ring: where it opened, when, whether a tap latched it, the slot aimed at, and the
 * pointer, which the aim line runs to from the center (#379)
 */
export interface RingState {
    readonly center: Point;
    readonly openedAt: number;
    readonly latched: boolean;
    readonly hot: number | null;
    readonly aim: Point;
}

/**
 * R went down: the ring opens around the pointer, aiming at nothing yet. `pointer` is where the
 * pointer really is, when the ring had to open away from it to stay on screen.
 */
export function openRing(
    center: Point,
    now: number,
    pointer: Point = center,
): RingState {
    return { center, openedAt: now, latched: false, hot: null, aim: pointer };
}

/**
 * The ring opened from the command palette (#411): latched, as a tap leaves it, since there's no
 * key to let go. A click picks or dismisses it.
 */
export const latchRing = (ring: RingState): RingState => ({
    ...ring,
    latched: true,
});

const offsetFrom = (ring: RingState, pointer: Point): Point => ({
    x: pointer.x - ring.center.x,
    y: pointer.y - ring.center.y,
});

/** The pointer moved to `pointer`: aims at the slot there, of `count` */
export function pointRing(
    ring: RingState,
    pointer: Point,
    count: number,
): RingState {
    const hot = slotAt(offsetFrom(ring, pointer), count, ring.latched);
    return { ...ring, hot, aim: pointer };
}

/**
 * R was let go at `now`. Over a slot that slot is picked and the ring closes; a quick tap latches
 * it open until a click; a hold let go over the center closes it, picking nothing.
 */
export function releaseRingKey(
    ring: RingState,
    now: number,
): { readonly pick: number | null; readonly ring: RingState | null } {
    if (ring.latched) return { pick: null, ring };
    if (ring.hot !== null) return { pick: ring.hot, ring: null };
    if (now - ring.openedAt < RING_TAP_MS)
        return { pick: null, ring: { ...ring, latched: true } };
    return { pick: null, ring: null };
}

/** A click at `pointer` on a latched ring: the slot it picks, or null when it dismisses the ring */
export function clickRing(
    ring: RingState,
    pointer: Point,
    count: number,
): number | null {
    return slotAt(offsetFrom(ring, pointer), count, true);
}
