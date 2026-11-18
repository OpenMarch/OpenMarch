/**
 * Where the drawn performers are, for following one with the camera
 * (`followStore.ts`). `Performers.tsx` owns the positions: it registers a
 * source while it is mounted and calls `performersMoved()` at the end of
 * every frame that moved them, so the camera rig can follow the performer in
 * the same frame, before it is drawn, instead of a frame behind.
 */
import type { Vector3Tuple } from "three";
import type { PerformerPose } from "./followMath";

export interface PerformerSource {
    /** The marcher id a click along the ray (unit `dir`) means, or null. */
    pick: (origin: Vector3Tuple, dir: Vector3Tuple) => number | null;
    /**
     * Writes where the marcher stands and faces now into `out` and returns
     * true; false, leaving `out` untouched, when they aren't drawn.
     */
    poseInto: (marcherId: number, out: PerformerPose) => boolean;
}

let source: PerformerSource | null = null;
const listeners = new Set<() => void>();

/** Registers the performers; returns a function that removes them. */
export function setPerformerSource(next: PerformerSource): () => void {
    source = next;
    return () => {
        if (source === next) source = null;
    };
}

/** The marcher id a click along the ray means, or null. */
export function pickPerformer(
    origin: Vector3Tuple,
    dir: Vector3Tuple,
): number | null {
    return source?.pick(origin, dir) ?? null;
}

/** See `PerformerSource.poseInto`. False while no performers are drawn. */
export function performerPoseInto(
    marcherId: number,
    out: PerformerPose,
): boolean {
    return source?.poseInto(marcherId, out) ?? false;
}

/** Calls `listener` after each frame that moves the performers. */
export function onPerformersMoved(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Performers only: this frame's positions are written. */
export function performersMoved(): void {
    for (const listener of listeners) listener();
}
