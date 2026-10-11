/**
 * When the 3D View draws (docs/3d/fidelity.md, P7.2): only while something
 * moves, and at a capped frame rate on battery. A paused show with a still
 * camera draws nothing, which is most of the battery the window can save.
 *
 * Pure: the scene's `DrawWhenNeeded` feeds it the time and what is moving,
 * and turns its answer into `invalidate()` calls.
 */

/** Frame cap on battery power. */
export const BATTERY_FPS = 30;

/**
 * Wake this much before the cap's next frame is due (ms). `invalidate()` draws
 * on the next display frame, so a timer that fires right on time misses that
 * frame and lands one later (50 ms apart at 60 Hz, 20 fps). Waking early lets
 * the display frame line it up.
 */
export const FRAME_SLACK_MS = 6;

/** The viewer's power choices, saved per computer like the render quality. */
export interface PowerPrefs {
    /** Stop drawing when nothing moves. */
    pauseWhenIdle: boolean;
    /** Cap the frame rate while on battery. */
    saveOnBattery: boolean;
}

export const DEFAULT_POWER_PREFS: PowerPrefs = {
    pauseWhenIdle: true,
    saveOnBattery: true,
};

export const POWER_STORAGE_KEY = "view3d.power";

export interface DrawState {
    /** Keep drawing until this time (ms), whatever moves. */
    awakeUntil: number;
    /** When the last frame was drawn (ms), or null before the first. */
    lastFrameMs: number | null;
}

export function createDrawState(): DrawState {
    return { awakeUntil: 0, lastFrameMs: null };
}

/** Keeps drawing for `ms` from `now`, for a change whose effect plays out over time. */
export function wake(state: DrawState, now: number, ms: number): void {
    state.awakeUntil = Math.max(state.awakeUntil, now + ms);
}

export function noteFrame(state: DrawState, now: number): void {
    state.lastFrameMs = now;
}

/** True while the battery frame cap holds the frame rate down. */
export function frameCapped(onBattery: boolean, prefs: PowerPrefs): boolean {
    return onBattery && prefs.saveOnBattery;
}

export interface DrawInputs {
    /** Something animates continuously: playback, a camera move. */
    moving: boolean;
    onBattery: boolean;
    prefs: PowerPrefs;
}

/**
 * How long to wait before the next frame: 0 for the next display frame, a
 * delay in ms to hold a frame cap, or null to stop drawing until woken.
 */
export function nextFrameDelay(
    state: DrawState,
    now: number,
    inputs: DrawInputs,
): number | null {
    const active =
        inputs.moving || now < state.awakeUntil || !inputs.prefs.pauseWhenIdle;
    if (!active) return null;
    if (
        !frameCapped(inputs.onBattery, inputs.prefs) ||
        state.lastFrameMs === null
    )
        return 0;
    const wait =
        1000 / BATTERY_FPS - (now - state.lastFrameMs) - FRAME_SLACK_MS;
    return wait > 0 ? wait : 0;
}

/**
 * Shadows: the sun's shadow camera is fixed on the field, so a camera move
 * never changes the shadow map. It is redrawn only for a while after a
 * change to what casts or lights (kit, lighting, quality, a show edit or a
 * clock change) and while the show plays, instead of every frame.
 */
export const SHADOW_REFRESH_MS = 4000;

export interface ShadowState {
    /** Redraw the shadow map on frames before this time (ms). */
    refreshUntil: number;
}

export function createShadowState(): ShadowState {
    return { refreshUntil: 0 };
}

export function refreshShadows(
    state: ShadowState,
    now: number,
    ms: number,
): void {
    state.refreshUntil = Math.max(state.refreshUntil, now + ms);
}

export function shadowsNeedUpdate(state: ShadowState, now: number): boolean {
    return now < state.refreshUntil;
}

export function parsePowerPrefs(value: unknown): PowerPrefs {
    if (typeof value !== "string") return { ...DEFAULT_POWER_PREFS };
    try {
        const parsed = JSON.parse(value) as Partial<PowerPrefs>;
        return {
            pauseWhenIdle:
                typeof parsed.pauseWhenIdle === "boolean"
                    ? parsed.pauseWhenIdle
                    : DEFAULT_POWER_PREFS.pauseWhenIdle,
            saveOnBattery:
                typeof parsed.saveOnBattery === "boolean"
                    ? parsed.saveOnBattery
                    : DEFAULT_POWER_PREFS.saveOnBattery,
        };
    } catch {
        return { ...DEFAULT_POWER_PREFS };
    }
}

/** The saved choices, or the defaults when there are none or storage is unavailable. */
export function loadPowerPrefs(storage?: Storage): PowerPrefs {
    try {
        return parsePowerPrefs(
            (storage ?? window.localStorage).getItem(POWER_STORAGE_KEY),
        );
    } catch {
        return { ...DEFAULT_POWER_PREFS };
    }
}

export function savePowerPrefs(prefs: PowerPrefs, storage?: Storage): void {
    try {
        (storage ?? window.localStorage).setItem(
            POWER_STORAGE_KEY,
            JSON.stringify(prefs),
        );
    } catch {
        // Private or blocked storage: the choice lasts for this session only.
    }
}
