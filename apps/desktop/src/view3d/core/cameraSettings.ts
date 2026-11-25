// cspell:ignore hyperfocal
/**
 * The numbers behind a camera's advanced settings, and the cameras file.
 *
 * - Lens: the stored field of view (vertical, degrees) shown as a focal
 *   length on a full-frame (36 × 24 mm) sensor, the "35 mm equivalent" that
 *   camera people quote. One setting, two ways to read it.
 * - Aim: the look-at point shown as pan and tilt from the camera. Pan 0
 *   looks from the audience toward the back of the field (−Z), positive
 *   turns toward side 2 (+X); tilt is up positive. Changing pan or tilt keeps
 *   the camera where it is and its distance to the look-at point.
 * - The cameras file: a venue's cameras as JSON, for keeping, sharing and
 *   editing outside the app. Every camera is written as a full view, the
 *   venue's own defaults included, so the file says exactly where each one
 *   is.
 *
 * World units are meters: +X toward side 2, +Y up, +Z toward the audience,
 * origin at the center of the front sideline. Plain TypeScript and zod only.
 */
import * as z from "zod";
import type { Vector3Tuple } from "three";
import {
    cameraListSchema,
    MAX_FOV_DEG,
    MIN_FOV_DEG,
    type SavedCamera,
    type SavedView,
    type ViewCamera,
} from "./cameraList";

/** Height of a full-frame sensor, mm. */
export const SENSOR_HEIGHT_MM = 24;

const DEG = Math.PI / 180;

/** The focal length (mm, full frame) that gives a vertical field of view. */
export function focalLengthFromFov(fovDeg: number): number {
    return SENSOR_HEIGHT_MM / 2 / Math.tan((fovDeg * DEG) / 2);
}

/** The vertical field of view (degrees) of a focal length (mm, full frame). */
export function fovFromFocalLength(mm: number): number {
    return (2 * Math.atan(SENSOR_HEIGHT_MM / 2 / mm)) / DEG;
}

/** Focal lengths the field of view limits allow, mm. */
export const MIN_FOCAL_MM = focalLengthFromFov(MAX_FOV_DEG);
export const MAX_FOCAL_MM = focalLengthFromFov(MIN_FOV_DEG);

export interface Aim {
    /** Degrees; 0 looks toward the back of the field, positive toward side 2. */
    panDeg: number;
    /** Degrees; positive looks up. */
    tiltDeg: number;
    /** Meters from the camera to the look-at point. */
    distance: number;
}

/** Pan, tilt and distance from the camera to its look-at point. */
export function aimOf(position: Vector3Tuple, target: Vector3Tuple): Aim {
    const dx = target[0] - position[0];
    const dy = target[1] - position[1];
    const dz = target[2] - position[2];
    const flat = Math.hypot(dx, dz);
    return {
        panDeg: flat < 1e-9 ? 0 : Math.atan2(dx, -dz) / DEG,
        tiltDeg: Math.atan2(dy, flat) / DEG,
        distance: Math.hypot(dx, dy, dz),
    };
}

/** Tilt stops this short of straight up or down, so pan still means something. */
export const MAX_TILT_DEG = 89;

/** The look-at point for an aim from `position`. */
export function targetFromAim(position: Vector3Tuple, aim: Aim): Vector3Tuple {
    const tilt =
        Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, aim.tiltDeg)) * DEG;
    const pan = aim.panDeg * DEG;
    const d = Math.max(0.01, aim.distance);
    const flat = Math.cos(tilt) * d;
    return [
        position[0] + Math.sin(pan) * flat,
        position[1] + Math.sin(tilt) * d,
        position[2] - Math.cos(pan) * flat,
    ];
}

// ------------------------------------------------------------------ focus

/**
 * The blur circle a full-frame camera accepts as sharp, mm: the usual
 * 0.03 mm (about 1/1440 of the frame's diagonal).
 */
export const SHARP_CIRCLE_MM = 0.03;

/**
 * Blur at depth: a point at distance z (m) from a lens of focal length
 * `focalMm` at f-number `fStop`, focused at `focusM`, blurs into a circle
 * `scale * |z − focus| / z` pixels across, on a picture `heightPx` tall
 * (the thin-lens circle of confusion, scaled from a 24 mm sensor).
 */
export function blurScalePx(
    focalMm: number,
    fStop: number,
    focusM: number,
    heightPx: number,
): number {
    const focusMm = Math.max(focusM * 1000, focalMm * 1.001);
    const cocMm = (focalMm * focalMm) / (fStop * (focusMm - focalMm));
    return (cocMm / SENSOR_HEIGHT_MM) * heightPx;
}

/**
 * The nearest and farthest distances (m) that look sharp around a focus
 * distance; `far` is Infinity past the hyperfocal distance.
 */
export function depthOfField(
    focalMm: number,
    fStop: number,
    focusM: number,
): { near: number; far: number } {
    const f = focalMm / 1000;
    const hyperfocal = (f * f) / (fStop * (SHARP_CIRCLE_MM / 1000)) + f;
    const s = Math.max(focusM, f * 1.001);
    const near = (s * (hyperfocal - f)) / (hyperfocal + s - 2 * f);
    const far =
        s >= hyperfocal ? Infinity : (s * (hyperfocal - f)) / (hyperfocal - s);
    return { near, far };
}

// ------------------------------------------------------------------ file

export const CAMERAS_FILE_FORMAT = "openmarch.cameras";
export const CAMERAS_FILE_VERSION = 1;
/** Written into the file so a person reading it knows what the numbers mean. */
export const CAMERAS_FILE_AXES =
    "Meters. x: toward side 2, y: up, z: toward the audience. 0,0,0 is the center of the front sideline. fovDeg is the vertical field of view.";

export const camerasFileSchema = z.object({
    format: z.literal(CAMERAS_FILE_FORMAT),
    version: z.literal(CAMERAS_FILE_VERSION),
    /** The venue the cameras were made for. Other venues can use them too. */
    venue: z.string().optional(),
    axes: z.string().optional(),
    cameras: cameraListSchema,
});
export type CamerasFile = z.infer<typeof camerasFileSchema>;

/**
 * The shown cameras as a file. A venue default becomes a full view with its
 * shown name; `defaultFovDeg` stands in for a default without its own field
 * of view.
 */
export function camerasFile(
    cameras: readonly ViewCamera[],
    venue: string,
    label: (camera: ViewCamera) => string,
    defaultFovDeg: number,
): CamerasFile {
    return {
        format: CAMERAS_FILE_FORMAT,
        version: CAMERAS_FILE_VERSION,
        venue,
        axes: CAMERAS_FILE_AXES,
        cameras: cameras.map((camera): SavedView => {
            const view: SavedView = {
                kind: "view",
                id: camera.id,
                name: label(camera),
                position: [...camera.position],
                target: [...camera.target],
                fovDeg: camera.fovDeg ?? defaultFovDeg,
            };
            if (camera.rollDeg) view.rollDeg = camera.rollDeg;
            if (camera.follow) view.follow = { ...camera.follow };
            if (camera.focus) view.focus = structuredClone(camera.focus);
            return view;
        }),
    };
}

export type CamerasFileResult =
    | { ok: true; cameras: SavedCamera[]; venue?: string }
    | { ok: false; reason: "notJson" | "notCameras" | "invalid" };

/** Reads a cameras file's text. */
export function parseCamerasFile(text: string): CamerasFileResult {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { ok: false, reason: "notJson" };
    }
    if (
        typeof json !== "object" ||
        json === null ||
        (json as { format?: unknown }).format !== CAMERAS_FILE_FORMAT
    )
        return { ok: false, reason: "notCameras" };
    const result = camerasFileSchema.safeParse(json);
    if (!result.success) return { ok: false, reason: "invalid" };
    return {
        ok: true,
        cameras: result.data.cameras,
        venue: result.data.venue,
    };
}

/** A file name for a venue's cameras, from the show's name. */
export function camerasFileName(showName: string | undefined): string {
    const base = (showName ?? "")
        .replace(/\.dots$/i, "")
        .replace(/[\\/:*?"<>|]+/g, " ")
        .trim();
    return `${base || "OpenMarch"} cameras.json`;
}
