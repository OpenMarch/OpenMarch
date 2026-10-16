/**
 * The show's own camera lists, and camera profiles (ADR 0002 D-5 and D-12,
 * amended 2026-10-16).
 *
 * Each kit ships default cameras (`KitResult.cameras`). A show can replace a
 * kit's list with its own: keep, rename, reorder or remove the defaults, and
 * add saved views. Lists are stored per kit in the show's `view3d_cameras`
 * row, so switching venues and back keeps each venue's list, and a kit with
 * no list uses its defaults ("Reset to defaults" removes the list). That row
 * is not in the undo history.
 *
 * A camera profile is a named list for one venue kit, kept in this
 * computer's Library so any show can use it. A show that picks a profile
 * keeps a copy of it (`ProfileCopy`), so it works on a computer without the
 * profile. Edits change the show's list only; the copy says what the list
 * started from, so the panel can tell "edited", "the profile changed on
 * this computer" and "not on this computer" apart (`profileStatus`).
 *
 * - A `kit` entry points at one of the kit's defaults by id, with an optional
 *   name. Its position comes from the kit, so it still fits when the field's
 *   size changes. Entries the kit no longer has are skipped.
 * - A `view` entry is a snapshot of the view: the eye, the point it looks
 *   at and the field of view, in world meters and degrees.
 *
 * Plain TypeScript and zod only, like the rest of `view3d/core/`.
 */
import * as z from "zod";
import type { Vector3Tuple } from "three";
import type { CameraSeat, VenueKitId } from "./types";
import { VENUE_KIT_IDS } from "./venueSettings";

/** More than enough for a show; keeps the menu usable. */
export const MAX_CAMERAS = 30;
/** Longest camera name. */
export const CAMERA_NAME_MAX = 40;
/** Field of view limits for a saved view, in degrees. */
export const MIN_FOV_DEG = 5;
export const MAX_FOV_DEG = 120;

const pointSchema = z.tuple([z.number(), z.number(), z.number()]);

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
 * `${base} ${n}` with the smallest n from 1 up that no shown name uses, so a
 * new view reads "Camera 1", "Camera 2" and so on.
 */
export function newCameraName(
    shownNames: readonly string[],
    base: string,
): string {
    const names = new Set(shownNames);
    for (let n = 1; ; n++)
        if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

function roundPoint(point: Vector3Tuple): Vector3Tuple {
    // Millimeters are plenty and keep the stored JSON short.
    return point.map((v) => Math.round(v * 1000) / 1000) as Vector3Tuple;
}

function clampFov(fovDeg: number): number {
    return Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, fovDeg));
}

/** Edits to a camera list. Each returns a new list. */
export type CameraListEdit =
    | { kind: "add"; id: string; name: string; pose: ViewPose }
    | { kind: "rename"; id: string; name: string }
    | { kind: "setView"; id: string; pose: ViewPose }
    | { kind: "move"; id: string; by: -1 | 1 }
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
        case "add":
            if (index >= 0 || list.length >= MAX_CAMERAS) return [...list];
            return [
                ...list,
                {
                    kind: "view",
                    id: edit.id,
                    name: edit.name.trim().slice(0, CAMERA_NAME_MAX),
                    position: roundPoint(edit.pose.position),
                    target: roundPoint(edit.pose.target),
                    fovDeg: clampFov(edit.pose.fovDeg),
                },
            ];
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
                position: roundPoint(edit.pose.position),
                target: roundPoint(edit.pose.target),
                fovDeg: clampFov(edit.pose.fovDeg),
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
        case "remove":
            return list.filter((camera) => camera.id !== edit.id);
    }
}

// ------------------------------------------------------------------ show

/** Longest profile name. */
export const PROFILE_NAME_MAX = 60;

const isoTime = z.iso.datetime();

/** The profile a show's list came from, as it was when picked or saved. */
export const profileCopySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(PROFILE_NAME_MAX),
    updatedAt: isoTime,
    cameras: cameraListSchema,
});
export type ProfileCopy = z.infer<typeof profileCopySchema>;

/** One venue's cameras in a show: its own list, and the profile it came from. */
export const venueCamerasSchema = z.object({
    list: cameraListSchema,
    profile: profileCopySchema.optional(),
});
export type VenueCameras = z.infer<typeof venueCamerasSchema>;

export const SHOW_CAMERAS_VERSION = 1;

/** Version 1 of the JSON in `view3d_cameras.json_data`. */
export const showCamerasSchema = z.object({
    version: z.literal(SHOW_CAMERAS_VERSION),
    venues: z.partialRecord(z.enum(VENUE_KIT_IDS), venueCamerasSchema),
});
export type ShowCameras = z.infer<typeof showCamerasSchema>;
export type ShowVenueCameras = ShowCameras["venues"];

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

// ------------------------------------------------------------------ profiles

/** What a profile holds; the Library adds the id, name and times. */
export const profileDataSchema = z.object({
    kit: z.enum(VENUE_KIT_IDS),
    cameras: cameraListSchema,
});
export type ProfileData = z.infer<typeof profileDataSchema>;

/** A camera profile in this computer's Library. */
export interface CameraProfile extends ProfileData {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

/** The show's copy of a profile. */
export function copyOfProfile(profile: CameraProfile): ProfileCopy {
    return {
        id: profile.id,
        name: profile.name,
        updatedAt: profile.updatedAt,
        cameras: profile.cameras,
    };
}

/** True when two lists hold the same cameras in the same order. */
export function sameCameraList(
    a: readonly SavedCamera[],
    b: readonly SavedCamera[],
): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Where a venue's cameras stand:
 *
 * - `defaults`: the kit's own cameras;
 * - `custom`: the show's own list, from no profile;
 * - `profile`: from `profile`. `edited` when the list no longer matches it.
 *   `local` compares this computer's profile with the copy: `missing` (not
 *   here, offer to add it), `newer` (changed here since, offer to update),
 *   or `same`.
 */
export type ProfileStatus =
    | { kind: "defaults" }
    | { kind: "custom" }
    | {
          kind: "profile";
          profile: ProfileCopy;
          edited: boolean;
          local: "same" | "newer" | "missing";
          localProfile: CameraProfile | null;
      };

export function profileStatus(
    cameras: VenueCameras | undefined,
    profiles: readonly CameraProfile[],
): ProfileStatus {
    if (!cameras) return { kind: "defaults" };
    const copy = cameras.profile;
    if (!copy) return { kind: "custom" };
    const localProfile = profiles.find((p) => p.id === copy.id) ?? null;
    const local = !localProfile
        ? "missing"
        : localProfile.updatedAt > copy.updatedAt &&
            !sameCameraList(localProfile.cameras, copy.cameras)
          ? "newer"
          : "same";
    return {
        kind: "profile",
        profile: copy,
        edited: !sameCameraList(cameras.list, copy.cameras),
        local,
        localProfile,
    };
}

/**
 * True when replacing the venue's cameras would lose work: a list that is
 * neither the defaults nor an unedited profile this computer still has.
 */
export function replacingLosesWork(status: ProfileStatus): boolean {
    if (status.kind === "defaults") return false;
    if (status.kind === "custom") return true;
    return status.edited || status.local === "missing";
}
