/**
 * How the mouse and trackpad move the 3D View camera: the viewer's choice in
 * Settings. It belongs to the computer, not the show, so it lives in local
 * storage (ADR 0010 D-5), like `renderPrefs.ts`. Plain TypeScript: the
 * Settings window imports it, so nothing here may load three.js.
 *
 * - `map` (default): drag pans, right-drag orbits, and scroll zooms.
 * - `orbit`: drag orbits, right-drag pans, and scroll zooms.
 * - `trackpad`: scroll orbits, and a pinch zooms.
 *
 * The scheme is chosen rather than detected because a browser can't reliably
 * tell a mouse wheel from a two-finger scroll.
 */

export type ControlScheme = "orbit" | "map" | "trackpad";

export const CONTROL_SCHEMES: readonly ControlScheme[] = [
    "map",
    "orbit",
    "trackpad",
];

export const DEFAULT_CONTROL_SCHEME: ControlScheme = "map";

export const CONTROL_SCHEME_STORAGE_KEY = "view3d.controls";

export function parseControlScheme(value: unknown): ControlScheme {
    return CONTROL_SCHEMES.includes(value as ControlScheme)
        ? (value as ControlScheme)
        : DEFAULT_CONTROL_SCHEME;
}

/** The saved choice, or the default when there is none or storage is unavailable. */
export function loadControlScheme(storage?: Storage): ControlScheme {
    try {
        return parseControlScheme(
            (storage ?? window.localStorage).getItem(
                CONTROL_SCHEME_STORAGE_KEY,
            ),
        );
    } catch {
        return DEFAULT_CONTROL_SCHEME;
    }
}

export function saveControlScheme(scheme: ControlScheme, storage?: Storage) {
    try {
        (storage ?? window.localStorage).setItem(
            CONTROL_SCHEME_STORAGE_KEY,
            scheme,
        );
    } catch {
        // Private or blocked storage: the choice lasts for this session only.
    }
}

/** An input the Controls picker draws as an icon. */
export type GestureInput = "drag" | "rightDrag" | "scroll" | "swipe" | "pinch";

/** What a gesture does to the camera. */
export type CameraMove = "orbit" | "pan" | "zoom";

/**
 * The three main gestures of each scheme, for the Controls picker: one each
 * for orbit, pan and zoom. Modifier keys and touch are left out; the key
 * list in the 3D View's View settings shows those. Keep in step with
 * `dragAction` and `wheelAction` (the test checks it).
 */
export const SCHEME_GESTURES: Record<
    ControlScheme,
    readonly { readonly input: GestureInput; readonly move: CameraMove }[]
> = {
    orbit: [
        { input: "drag", move: "orbit" },
        { input: "rightDrag", move: "pan" },
        { input: "scroll", move: "zoom" },
    ],
    map: [
        { input: "drag", move: "pan" },
        { input: "rightDrag", move: "orbit" },
        { input: "scroll", move: "zoom" },
    ],
    trackpad: [
        { input: "swipe", move: "orbit" },
        { input: "rightDrag", move: "pan" },
        { input: "pinch", move: "zoom" },
    ],
};

/** The pointer fields `dragAction` reads (a `PointerEvent` satisfies it). */
export interface DragLike {
    pointerType: string;
    buttons: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

/**
 * What a one-pointer drag does. Ctrl, Alt (Option) and Cmd always orbit. Touch and
 * pen always orbit too, because they have no modifier or second button to
 * reach it with; two fingers pan and pinch whatever the scheme.
 */
export function dragAction(
    scheme: ControlScheme,
    press: DragLike,
): "orbit" | "pan" {
    if (press.pointerType !== "mouse") return "orbit";
    if (press.ctrlKey || press.altKey || press.metaKey) return "orbit";
    const secondary = press.shiftKey || (press.buttons & 2) !== 0;
    if (scheme === "map") return secondary ? "orbit" : "pan";
    return secondary ? "pan" : "orbit";
}

/** The wheel fields `wheelAction` reads (a `WheelEvent` satisfies it). */
export interface WheelModifiers {
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

export type WheelAction = "pinch" | "zoom" | "orbit" | "pan";

/**
 * What a wheel event does. A trackpad pinch arrives as a wheel with Ctrl held,
 * so Ctrl always zooms; Shift or Alt (Option) always pans.
 */
export function wheelAction(
    scheme: ControlScheme,
    wheel: WheelModifiers,
): WheelAction {
    if (wheel.ctrlKey) return "pinch";
    if (wheel.shiftKey || wheel.altKey) return "pan";
    return scheme === "trackpad" ? "orbit" : "zoom";
}
