/**
 * The show's own camera lists (ADR 0010 D-5).
 *
 * Each kit ships default cameras (`KitResult.cameras`). A show can replace a
 * kit's list with its own: keep, rename, reorder or remove the defaults, and
 * add saved views. Lists are stored per kit in the show's `view3d_cameras`
 * row, so switching venues and back keeps each venue's list, and a kit with
 * no list uses its defaults ("Reset to defaults" removes the list). That row
 * is not in the undo history.
 *
 * - A `kit` entry points at one of the kit's defaults by id, with an optional
 *   name. Its position comes from the kit, so it still fits when the field's
 *   size changes. Entries the kit no longer has are skipped.
 * - A `view` entry is a snapshot of the view: the eye, the point it looks
 *   at and the field of view, in world meters and degrees, with an optional
 *   roll (the picture tilted about the line of sight). A view can instead
 *   follow a performer (`follow`): from behind them, or out of their eyes.
 *   Then the camera goes to them and keeps up as they move, and its
 *   position and look-at point are only where it was saved. A view can
 *   also focus (`focus`): what is sharp, and the lens's f-number, which
 *   sets how soft everything nearer and farther gets.
 *
 * Plain TypeScript and zod only, like the rest of `view3d/core/`.
 */
import * as z from "zod";
import type { Vector3Tuple } from "three";
import type { CameraSeat, VenueKitId } from "./types";

/** More than enough for a show; keeps the menu usable. */
export const MAX_CAMERAS = 30;
/** Longest camera name. */
export const CAMERA_NAME_MAX = 40;
/** Field of view limits for a saved view, in degrees. */
export const MIN_FOV_DEG = 5;
export const MAX_FOV_DEG = 120;
/** Roll limit for a saved view, in degrees either way. */
export const MAX_ROLL_DEG = 180;

const pointSchema = z.tuple([z.number(), z.number(), z.number()]);

/** Follow-camera aim limits: tilt either way and distance from the performer (m). */
export const MAX_FOLLOW_TILT_DEG = 85;
export const MIN_FOLLOW_DISTANCE_M = 1;
export const MAX_FOLLOW_DISTANCE_M = 100;

/**
 * A camera that follows a performer: from outside them (`third`) or out of
 * their eyes (`pov`). Its aim, each the mode's own default when omitted:
 *
 * - `third`: `angleDeg` round them from behind (0), toward their right
 *   (90) to in front (180); `tiltDeg` how high the camera looks down from;
 *   `distanceM` from their chest.
 * - `pov`: `angleDeg` turns the look to their right (negative: left) and
 *   `tiltDeg` up (negative: down, at an instrument).
 */
export const cameraFollowSchema = z.object({
    marcherId: z.number().int(),
    mode: z.enum(["third", "pov"]),
    angleDeg: z.number().min(-180).max(180).optional(),
    tiltDeg: z
        .number()
        .min(-MAX_FOLLOW_TILT_DEG)
        .max(MAX_FOLLOW_TILT_DEG)
        .optional(),
    distanceM: z
        .number()
        .min(MIN_FOLLOW_DISTANCE_M)
        .max(MAX_FOLLOW_DISTANCE_M)
        .optional(),
});
export type CameraFollow = z.infer<typeof cameraFollowSchema>;

/** The f-numbers a camera can focus at, widest first. */
export const MIN_F_STOP = 0.95;
export const MAX_F_STOP = 32;
/** The farthest a camera can focus at a set distance (m). */
export const MAX_FOCUS_M = 10000;

/**
 * What a camera keeps sharp: the point it looks at, a distance from it
 * (meters), or a performer as they move. `fStop` sets how quickly things
 * nearer or farther go soft: lower is softer, as on a real lens.
 */
export const cameraFocusSchema = z.object({
    fStop: z.number().min(MIN_F_STOP).max(MAX_F_STOP),
    on: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("lookAt") }),
        z.object({
            kind: z.literal("distance"),
            meters: z.number().positive().max(MAX_FOCUS_M),
        }),
        z.object({ kind: z.literal("performer"), marcherId: z.number().int() }),
    ]),
});
export type CameraFocus = z.infer<typeof cameraFocusSchema>;

export const savedCameraSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("kit"),
        /** The kit camera's id, such as "pressBox". */
        id: z.string().min(1),
        /** Replaces the kit's label when set. */
        name: z.string().min(1).max(CAMERA_NAME_MAX).optional(),
    }),
    z.object({
        kind: z.literal("view"),
        id: z.string().min(1),
        name: z.string().min(1).max(CAMERA_NAME_MAX),
        position: pointSchema,
        target: pointSchema,
        fovDeg: z.number().min(MIN_FOV_DEG).max(MAX_FOV_DEG),
        /** The camera turned about its line of sight, degrees; positive rolls it clockwise as seen from behind. Level when omitted. */
        rollDeg: z.number().min(-MAX_ROLL_DEG).max(MAX_ROLL_DEG).optional(),
        /** Follows this performer instead of staying put. */
        follow: cameraFollowSchema.optional(),
        /** Focuses, softening what is nearer and farther. Everything sharp when omitted. */
        focus: cameraFocusSchema.optional(),
    }),
]);

export const cameraListSchema = z
    .array(savedCameraSchema)
    .max(MAX_CAMERAS)
    .refine(
        (list) => new Set(list.map((camera) => camera.id)).size === list.length,
        "Camera ids must be unique",
    );

export type SavedCamera = z.infer<typeof savedCameraSchema>;
export type SavedView = Extract<SavedCamera, { kind: "view" }>;

/**
 * A camera in the menu: the kit's seat, or a saved view as a seat of kind
 * `saved`. `name` is the show's name for it; without one, show `labelKey`.
 */
export type ViewCamera = CameraSeat & { name?: string };

/** A snapshot of the current view, for adding or updating a saved view. */
export interface ViewPose {
    position: Vector3Tuple;
    target: Vector3Tuple;
    fovDeg: number;
    /** Degrees; positive rolls the camera clockwise as seen from behind. Level when omitted. */
    rollDeg?: number;
}

/** The kit's defaults as an editable list. */
export function defaultCameraList(
    kitCameras: readonly CameraSeat[],
): SavedCamera[] {
    return kitCameras.map((camera) => ({ kind: "kit", id: camera.id }));
}

/**
 * The cameras to show, in menu order: the kit's defaults when `saved` is
 * undefined, otherwise the saved list with kit entries resolved and missing
 * ones skipped.
 */
export function resolveCameras(
    kitCameras: readonly CameraSeat[],
    saved: readonly SavedCamera[] | undefined,
): ViewCamera[] {
    if (!saved) return [...kitCameras];
    const cameras: ViewCamera[] = [];
    for (const entry of saved) {
        if (entry.kind === "kit") {
            const seat = kitCameras.find((camera) => camera.id === entry.id);
            if (seat)
                cameras.push(entry.name ? { ...seat, name: entry.name } : seat);
        } else {
            cameras.push({
                id: entry.id,
                labelKey: "",
                name: entry.name,
                kind: "saved",
                position: [...entry.position],
                target: [...entry.target],
                fovDeg: entry.fovDeg,
                ...(entry.rollDeg ? { rollDeg: entry.rollDeg } : {}),
                ...(entry.follow ? { follow: { ...entry.follow } } : {}),
                ...(entry.focus ? { focus: structuredClone(entry.focus) } : {}),
            });
        }
    }
    return cameras;
}

/** An id no camera in `list` uses. */
export function newCameraId(list: readonly SavedCamera[]): string {
    const ids = new Set(list.map((camera) => camera.id));
    for (let n = 1; ; n++) if (!ids.has(`view${n}`)) return `view${n}`;
}

/**
 * `nameFor(n)` with the smallest n from 1 up that no shown name uses, so a
 * new view reads "Camera 1", "Camera 2" and so on.
 */
export function newCameraName(
    shownNames: readonly string[],
    nameFor: (n: number) => string,
): string {
    const names = new Set(shownNames);
    for (let n = 1; ; n++) if (!names.has(nameFor(n))) return nameFor(n);
}

function roundPoint(point: Vector3Tuple): Vector3Tuple {
    // Millimeters are plenty and keep the stored JSON short.
    return point.map((v) => Math.round(v * 1000) / 1000) as Vector3Tuple;
}

function clampFov(fovDeg: number): number {
    // Hundredths of a degree are plenty and keep the stored JSON short.
    const fov = Math.round(fovDeg * 100) / 100;
    return Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, fov));
}

/** Wraps a roll into -180..180 degrees, to a hundredth of a degree. */
export function normalizeRoll(rollDeg: number): number {
    if (!Number.isFinite(rollDeg)) return 0;
    const r = rollDeg - 360 * Math.round(rollDeg / 360);
    return Math.round(r * 100) / 100 || 0;
}

/** An angle in degrees as -180 (exclusive) to 180, so straight round is 180. */
export function wrapAngle(deg: number): number {
    return deg - 360 * Math.ceil((deg - 180) / 360);
}

/** How a view camera behaves besides its pose: following and focus. None when omitted. */
export interface ViewExtras {
    follow?: CameraFollow | null;
    focus?: CameraFocus | null;
}

/** A follow setting as stored: aim wrapped, clamped and rounded, defaults left out. */
export function followFields(follow: CameraFollow): CameraFollow {
    const out: CameraFollow = {
        marcherId: follow.marcherId,
        mode: follow.mode,
    };
    if (follow.angleDeg !== undefined) {
        const angle = Math.round(wrapAngle(follow.angleDeg) * 100) / 100 || 0;
        if (angle !== 0) out.angleDeg = angle;
    }
    if (follow.tiltDeg !== undefined && Number.isFinite(follow.tiltDeg))
        out.tiltDeg = clampRound(
            follow.tiltDeg,
            -MAX_FOLLOW_TILT_DEG,
            MAX_FOLLOW_TILT_DEG,
            100,
        );
    if (follow.mode === "third" && follow.distanceM !== undefined)
        out.distanceM = clampRound(
            follow.distanceM,
            MIN_FOLLOW_DISTANCE_M,
            MAX_FOLLOW_DISTANCE_M,
            1000,
        );
    return out;
}

function clampRound(v: number, min: number, max: number, per: number) {
    return Math.min(max, Math.max(min, Math.round(v * per) / per));
}

/** The stored fields of a pose, following and focus for a view entry. */
function viewFields(
    pose: ViewPose,
    { follow, focus }: ViewExtras,
): Pick<
    SavedView,
    "position" | "target" | "fovDeg" | "rollDeg" | "follow" | "focus"
> {
    const roll = normalizeRoll(pose.rollDeg ?? 0);
    return {
        position: roundPoint(pose.position),
        target: roundPoint(pose.target),
        fovDeg: clampFov(pose.fovDeg),
        ...(roll !== 0 ? { rollDeg: roll } : {}),
        ...(follow ? { follow: followFields(follow) } : {}),
        ...(focus
            ? {
                  focus: {
                      fStop: Math.min(
                          MAX_F_STOP,
                          Math.max(
                              MIN_F_STOP,
                              Math.round(focus.fStop * 100) / 100,
                          ),
                      ),
                      on:
                          focus.on.kind === "distance"
                              ? {
                                    kind: "distance",
                                    meters: Math.min(
                                        MAX_FOCUS_M,
                                        Math.max(0.1, focus.on.meters),
                                    ),
                                }
                              : { ...focus.on },
                  },
              }
            : {}),
    };
}

/** Edits to a camera list. Each returns a new list. */
export type CameraListEdit =
    | ({
          kind: "add";
          id: string;
          name: string;
          pose: ViewPose;
          /** Puts the new camera right after this one (a duplicate); last when omitted. */
          after?: string;
      } & ViewExtras)
    | { kind: "rename"; id: string; name: string }
    /**
     * Sets the camera's pose, following and focus (none when omitted): "Set
     * to current view" and the exact settings both use it.
     */
    | ({ kind: "setView"; id: string; pose: ViewPose } & ViewExtras)
    | { kind: "move"; id: string; by: -1 | 1 }
    /** Moves a camera to a place in the list (a drag), clamped to the list. */
    | { kind: "moveTo"; id: string; index: number }
    | { kind: "remove"; id: string };

/**
 * Applies one edit. `rename` to an empty name puts a kit camera's own label
 * back and leaves a saved view's name alone. `setView` on a kit camera turns
 * it into a saved view with its current label as the name (`label`).
 */
export function editCameraList(
    list: readonly SavedCamera[],
    edit: CameraListEdit,
    label: (camera: SavedCamera) => string = (camera) =>
        camera.kind === "view" ? camera.name : (camera.name ?? camera.id),
): SavedCamera[] {
    const index = list.findIndex((camera) => camera.id === edit.id);
    switch (edit.kind) {
        case "add": {
            if (index >= 0 || list.length >= MAX_CAMERAS) return [...list];
            const added: SavedCamera = {
                kind: "view",
                id: edit.id,
                name: edit.name.trim().slice(0, CAMERA_NAME_MAX),
                ...viewFields(edit.pose, edit),
            };
            const after = list.findIndex((camera) => camera.id === edit.after);
            if (after < 0) return [...list, added];
            return [
                ...list.slice(0, after + 1),
                added,
                ...list.slice(after + 1),
            ];
        }
        case "rename": {
            if (index < 0) return [...list];
            const name = edit.name.trim().slice(0, CAMERA_NAME_MAX);
            const camera = list[index];
            const next: SavedCamera =
                camera.kind === "view"
                    ? { ...camera, name: name || camera.name }
                    : name
                      ? { ...camera, name }
                      : { kind: "kit", id: camera.id };
            return list.map((c, i) => (i === index ? next : c));
        }
        case "setView": {
            if (index < 0) return [...list];
            const camera = list[index];
            const next: SavedCamera = {
                kind: "view",
                id: camera.id,
                name: camera.kind === "view" ? camera.name : label(camera),
                ...viewFields(edit.pose, edit),
            };
            return list.map((c, i) => (i === index ? next : c));
        }
        case "move": {
            const to = index + edit.by;
            if (index < 0 || to < 0 || to >= list.length) return [...list];
            const next = [...list];
            [next[index], next[to]] = [next[to], next[index]];
            return next;
        }
        case "moveTo": {
            if (index < 0) return [...list];
            const next = list.filter((_, i) => i !== index);
            const to = Math.max(
                0,
                Math.min(next.length, Math.round(edit.index)),
            );
            next.splice(to, 0, list[index]);
            return next;
        }
        case "remove":
            return list.filter((camera) => camera.id !== edit.id);
    }
}

// ------------------------------------------------------------------ show

/**
 * One venue's cameras in a show: its own list. Files from a fork build may also hold the camera
 * profile the list came from (`profile`, since parked); parsing drops it.
 */
export const venueCamerasSchema = z.object({
    list: cameraListSchema,
});
export type VenueCameras = z.infer<typeof venueCamerasSchema>;

export const SHOW_CAMERAS_VERSION = 1;

/**
 * Version 1 of the JSON in `view3d_cameras.json_data`. Venues are keyed by
 * any string, not only this build's kits: a show saved by a newer build may
 * hold a venue this one doesn't know, and that venue's cameras must survive
 * (`withVenueCameras` keeps them) rather than fail the whole parse and be
 * dropped on the next save.
 */
export const showCamerasSchema = z.object({
    version: z.literal(SHOW_CAMERAS_VERSION),
    venues: z.record(z.string(), venueCamerasSchema),
});
export type ShowCameras = z.infer<typeof showCamerasSchema>;
export type ShowVenueCameras = Partial<Record<VenueKitId, VenueCameras>>;

export const EMPTY_SHOW_CAMERAS: ShowCameras = Object.freeze({
    version: SHOW_CAMERAS_VERSION,
    venues: Object.freeze({}),
}) as ShowCameras;

/** The show's cameras with one venue's set, or with `undefined` back to its defaults. */
export function withVenueCameras(
    show: ShowCameras,
    kit: VenueKitId,
    cameras: VenueCameras | undefined,
): ShowCameras {
    const venues = { ...show.venues };
    if (cameras) venues[kit] = cameras;
    else delete venues[kit];
    return { version: SHOW_CAMERAS_VERSION, venues };
}

/** Parses stored JSON text, or returns `undefined` when it's malformed or invalid. */
export function parseShowCamerasJson(json: string): ShowCameras | undefined {
    try {
        const result = showCamerasSchema.safeParse(JSON.parse(json));
        return result.success ? result.data : undefined;
    } catch {
        return undefined;
    }
}
