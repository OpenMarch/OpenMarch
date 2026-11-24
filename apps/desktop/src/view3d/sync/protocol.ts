/**
 * The 3D View sync contract (ADR 0010 D-4, docs/3d/design.md §7).
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
/**
 * The props hidden on the field (the Props panel's "Hide on the field", a
 * local UI setting, not show data), which the window doesn't draw either.
 */
export const VIEW3D_HIDDEN_PROPS_CHANNEL = "view3d:hidden-props";
/** Main → editor: whether a 3D View window is open (a boolean push). */
export const VIEW3D_WINDOW_STATE_CHANNEL = "view3d:window-state";
/**
 * Editor → main, `invoke`: whether a 3D View window is open now. A reloaded
 * editor asks, since main pushes the window state only when it changes.
 */
export const VIEW3D_IS_OPEN_CHANNEL = "view3d:is-open";
/** Window → main → editor: the window is ready for a fresh clock and selection. */
export const VIEW3D_HELLO_CHANNEL = "view3d:hello";
/** Window → main → editor: `{ settings }` or `{ cameras }` for the editor to validate and write. */
export const VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL =
    "view3d:venue-change-request";
/**
 * Window → main → editor: `{ action }`, a playback action for the editor to
 * run as if its own button or shortcut were used. The editor stays the only
 * owner of the clock; the window sees the result in the next `clock`.
 */
export const VIEW3D_PLAYBACK_REQUEST_CHANNEL = "view3d:playback-request";
/**
 * Window → main → editor: where the 3D View's camera is and what it sees
 * (`View3dCameraPose`), so the 2D field can show it. Sent when the camera
 * moves (at most 10 times a second) and once a second while it stands still.
 * Display only: the editor writes nothing from it.
 */
export const VIEW3D_CAMERA_CHANNEL = "view3d:camera";

/**
 * The app setting (`settings:get` and `settings:set`) that opens the 3D View
 * whenever the editor opens a show. A boolean; missing means off.
 */
export const VIEW3D_AUTO_OPEN_SETTING = "view3dAutoOpen";

/**
 * The window's resolver query (`view3dResolverQueryOptions`). Timeline edits
 * don't invalidate queries in the editor (its resolver follows the change
 * log), so the editor sends an invalidation of this key after every committed
 * timeline change.
 */
export const VIEW3D_TIMELINE_QUERY_KEY = ["view3d_timeline"] as const;

/**
 * The window's query of the Held holds that carry a style (ADR 0015 D-5,
 * `useHoldStyles`). Held marks aren't in the change log and no editor query
 * reads them, so the editor sends an invalidation of this key whenever the
 * timeline's display version changes: after every edit, undo or redo that
 * touched them.
 */
export const VIEW3D_HOLD_STYLES_QUERY_KEY = ["view3d_hold_styles"] as const;

/** The channels the editor publishes and the window may listen to. */
export const VIEW3D_PUBLISH_CHANNELS = [
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_HIDDEN_PROPS_CHANNEL,
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
    /**
     * The playback speed playing in the editor, a held speed key included,
     * paused too. `rate` follows it once the audio does.
     */
    speed: number;
    /** The playback speed chosen in the editor, without a held key */
    chosenSpeed: number;
    /** Play loops (looping is on, or a move is isolated), for Play's tooltip */
    playLoops: boolean;
}

export interface View3dSelection {
    selectedPageId: number | null;
    selectedMarcherIds: number[];
}

export interface View3dHiddenProps {
    /** `items.id` of each prop hidden on the field, ascending */
    hiddenItemIds: number[];
}

/** The hidden props payload from `UiSettingsStore.hiddenPropIds`. */
export function hiddenPropsOf(
    hiddenPropIds: Readonly<Record<string, boolean>>,
): View3dHiddenProps {
    return {
        hiddenItemIds: Object.entries(hiddenPropIds)
            .filter(([, hidden]) => hidden)
            .map(([id]) => Number(id))
            .filter(Number.isFinite)
            .sort((a, b) => a - b),
    };
}

export interface View3dInvalidate {
    /** Query keys to invalidate. `[[]]` means everything. */
    queryKeys: unknown[][];
}

/**
 * The window asks the editor to store venue settings (with undo), or the
 * show's camera lists (without undo). One of the two is set.
 */
export interface View3dVenueChangeRequest {
    /** Unchecked: the editor validates it against the venue schema. */
    settings?: unknown;
    /** Unchecked: the editor validates it against `showCamerasSchema`. */
    cameras?: unknown;
    /**
     * A silk Artwork import (unchecked: the editor validates it against
     * `silkArtworkImportSchema`), or null to remove the show's Artwork
     * (fork #973). The editor stores it with history.
     */
    silkArtwork?: unknown;
}

/**
 * Window → main, `invoke`: the window's only settings calls, to read and answer the "open on
 * launch" question (`VIEW3D_AUTO_OPEN_SETTING`, ADR 0010 amendment 2026-11-01). Main checks the
 * sender and the value.
 */
export const VIEW3D_AUTO_OPEN_CHANNELS = {
    get: "view3d:auto-open-get",
    set: "view3d:auto-open-set",
} as const;

/**
 * The playback actions the window may ask for. Each is the name of the
 * editor's registered action (`RegisteredActionsEnum`) with the same effect.
 */
export const VIEW3D_PLAYBACK_ACTIONS = [
    "playPause",
    "playPage",
    "previousPage",
    "nextPage",
    "firstPage",
    "lastPage",
    "previousBeat",
    "nextBeat",
    "holdFasterPlayback",
    "holdSlowerPlayback",
    "nextPlaybackSpeed",
    "previousPlaybackSpeed",
    "resetPlaybackSpeed",
] as const;
export type View3dPlaybackAction = (typeof VIEW3D_PLAYBACK_ACTIONS)[number];

export interface View3dPlaybackRequest {
    /** Unchecked: the editor runs it only if it's a `View3dPlaybackAction`. */
    action: unknown;
    /**
     * True when the key that ran a held action (a playback speed key) is let
     * go. The editor ends the hold.
     */
    release?: unknown;
    /** With `VIEW3D_SET_SPEED` as the action: the speed to choose */
    speed?: unknown;
}

/**
 * The playback request that chooses a speed (the speed button's slider and
 * chips), which no editor action does.
 */
export const VIEW3D_SET_SPEED = "setPlaybackSpeed";

export function isView3dPlaybackAction(
    value: unknown,
): value is View3dPlaybackAction {
    return (VIEW3D_PLAYBACK_ACTIONS as readonly unknown[]).includes(value);
}

export interface View3dPayloads {
    [VIEW3D_CLOCK_CHANNEL]: View3dClock;
    [VIEW3D_SELECTION_CHANNEL]: View3dSelection;
    [VIEW3D_INVALIDATE_CHANNEL]: View3dInvalidate;
    [VIEW3D_HIDDEN_PROPS_CHANNEL]: View3dHiddenProps;
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
        isFiniteNumber(value.rate) &&
        isFiniteNumber(value.speed) &&
        isFiniteNumber(value.chosenSpeed) &&
        typeof value.playLoops === "boolean"
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

export function isView3dHiddenProps(
    value: unknown,
): value is View3dHiddenProps {
    return (
        isRecord(value) &&
        Array.isArray(value.hiddenItemIds) &&
        value.hiddenItemIds.every(isFiniteNumber)
    );
}

/** The 3D View's camera, in world meters (`packages/core` `world.ts`). */
export interface View3dCameraPose {
    /** Camera position: x across the field, y up, z toward the audience. */
    position: [number, number, number];
    /** Unit view direction, in the same axes. */
    direction: [number, number, number];
    /** Vertical field of view, in degrees. */
    fov: number;
    /** Width over height of the view. */
    aspect: number;
}

const finiteTriple = (value: unknown): value is [number, number, number] =>
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n));

/** The pose in an unchecked payload, or null when it isn't one. */
export function parseCameraPose(value: unknown): View3dCameraPose | null {
    if (typeof value !== "object" || value === null) return null;
    const { position, direction, fov, aspect } = value as Record<
        string,
        unknown
    >;
    if (!finiteTriple(position) || !finiteTriple(direction)) return null;
    if (typeof fov !== "number" || !(fov > 0 && fov < 180)) return null;
    if (typeof aspect !== "number" || !(aspect > 0 && Number.isFinite(aspect)))
        return null;
    return {
        position: [...position],
        direction: [...direction],
        fov,
        aspect,
    };
}
