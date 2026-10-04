/**
 * The 3D View sync contract (ADR 0002 D-4, docs/3d/design.md §7).
 *
 * The editor is the only writer. It publishes the clock, the selection and
 * query invalidations; main relays them to the 3D View window without
 * reading them. The window asks for venue changes, which the editor validates
 * and writes.
 *
 * Plain TypeScript only: the preloads import these types, and the window and
 * the editor share the pure helpers.
 */

/** Editor → window. Hard-coded channel names; main relays only these. */
export const VIEW3D_CLOCK_CHANNEL = "view3d:clock";
export const VIEW3D_SELECTION_CHANNEL = "view3d:selection";
export const VIEW3D_INVALIDATE_CHANNEL = "view3d:invalidate";
/** Main → editor: whether a 3D View window is open (a boolean push). */
export const VIEW3D_WINDOW_STATE_CHANNEL = "view3d:window-state";
/** Window → main → editor: the window is ready for a fresh clock and selection. */
export const VIEW3D_HELLO_CHANNEL = "view3d:hello";
/** Window → main → editor: `{ settings }` for the editor to validate and write. */
export const VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL =
    "view3d:venue-change-request";

/** The channels the editor publishes and the window may listen to. */
export const VIEW3D_PUBLISH_CHANNELS = [
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
] as const;
export type View3dPublishChannel = (typeof VIEW3D_PUBLISH_CHANNELS)[number];

export interface View3dClock {
    /** Increases with every clock the editor sends. Older ones are ignored. */
    seq: number;
    playing: boolean;
    /** Show time at `anchorWallMs`, in milliseconds. */
    anchorShowMs: number;
    /** `performance.timeOrigin + performance.now()` in the editor when sent. */
    anchorWallMs: number;
    /** Show milliseconds per wall millisecond while playing. */
    rate: number;
}

export interface View3dSelection {
    selectedPageId: number | null;
    selectedMarcherIds: number[];
}

export interface View3dInvalidate {
    /** Query keys to invalidate. `[[]]` means everything. */
    queryKeys: unknown[][];
}

export interface View3dVenueChangeRequest {
    /** Unchecked: the editor validates it against the venue schema. */
    settings: unknown;
}

export interface View3dPayloads {
    [VIEW3D_CLOCK_CHANNEL]: View3dClock;
    [VIEW3D_SELECTION_CHANNEL]: View3dSelection;
    [VIEW3D_INVALIDATE_CHANNEL]: View3dInvalidate;
}

/**
 * A wall clock both processes share: milliseconds since the Unix epoch, with
 * sub-millisecond precision and no jumps from system clock changes within a
 * process.
 */
export function wallNowMs(): number {
    return performance.timeOrigin + performance.now();
}

/**
 * The show time, in milliseconds, at wall time `nowWallMs`.
 *
 * Paused, it's the anchor. Playing, it advances from the anchor at `rate`.
 * A wall time slightly before the anchor (clock skew between processes)
 * holds at the anchor rather than running backwards.
 */
export function showTimeAt(clock: View3dClock, nowWallMs: number): number {
    if (!clock.playing) return clock.anchorShowMs;
    const elapsed = Math.max(0, nowWallMs - clock.anchorWallMs);
    return clock.anchorShowMs + elapsed * clock.rate;
}

/**
 * The clock to keep when `incoming` arrives: it replaces `current` only if
 * its `seq` is newer, so a late message can't rewind the window.
 */
export function newerClock(
    current: View3dClock | null,
    incoming: View3dClock,
): View3dClock {
    if (current && incoming.seq <= current.seq) return current;
    return incoming;
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

/** Main doesn't check payloads, so the window does. */
export function isView3dClock(value: unknown): value is View3dClock {
    return (
        isRecord(value) &&
        isFiniteNumber(value.seq) &&
        typeof value.playing === "boolean" &&
        isFiniteNumber(value.anchorShowMs) &&
        isFiniteNumber(value.anchorWallMs) &&
        isFiniteNumber(value.rate)
    );
}

export function isView3dSelection(value: unknown): value is View3dSelection {
    return (
        isRecord(value) &&
        (value.selectedPageId === null ||
            isFiniteNumber(value.selectedPageId)) &&
        Array.isArray(value.selectedMarcherIds) &&
        value.selectedMarcherIds.every(isFiniteNumber)
    );
}

export function isView3dInvalidate(value: unknown): value is View3dInvalidate {
    return (
        isRecord(value) &&
        Array.isArray(value.queryKeys) &&
        value.queryKeys.every((key) => Array.isArray(key))
    );
}
