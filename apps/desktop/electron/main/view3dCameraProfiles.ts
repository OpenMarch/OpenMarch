/**
 * The 3D View's camera profile calls (ADR 0002 D-12, amended 2026-10-16):
 * list, save and delete this computer's camera profiles in the Library. The
 * window can't reach the rest of the Library; these calls only read and
 * write `camera-profiles.json`, and every payload is checked here.
 */
import * as z from "zod";
import {
    PROFILE_NAME_MAX,
    profileDataSchema,
    type CameraProfile,
} from "../../src/view3d/core/cameraList";
import type { LibraryStore } from "./library/store";
import type { CameraProfileEntry } from "./library/types";

const saveRequestSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(PROFILE_NAME_MAX),
    data: profileDataSchema,
});

/** A stored entry as the window sees it, or null when its data isn't a valid profile. */
export function toCameraProfile(
    entry: CameraProfileEntry,
): CameraProfile | null {
    const data = profileDataSchema.safeParse(entry.data);
    if (!data.success) return null;
    return {
        ...data.data,
        id: entry.id,
        name: entry.name,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}

export function createCameraProfileHandlers(
    getStore: () => Promise<LibraryStore>,
) {
    return {
        /** Every valid profile; entries a newer app wrote in another shape are skipped. */
        async list(): Promise<CameraProfile[]> {
            const entries = await (await getStore()).listCameraProfiles();
            return entries
                .map(toCameraProfile)
                .filter((p): p is CameraProfile => p !== null);
        },
        async save(payload: unknown): Promise<CameraProfile> {
            const request = saveRequestSchema.parse(payload);
            const saved = await (await getStore()).saveCameraProfile(request);
            return toCameraProfile(saved)!;
        },
        async remove(payload: unknown): Promise<void> {
            const id = z.uuid().parse(payload);
            await (await getStore()).deleteCameraProfile(id);
        },
    };
}
