/**
 * Camera profiles for the web builds, which have no Library: kept in this
 * browser's local storage instead, with the same calls as the desktop
 * window's `window.view3d.cameraProfiles`.
 */
import * as z from "zod";
import {
    PROFILE_NAME_MAX,
    profileDataSchema,
    type CameraProfile,
} from "@/view3d/core/cameraList";
import type { View3dCameraProfileSave } from "@/view3d/sync/protocol";

const STORAGE_KEY = "view3d.cameraProfiles";

const storedSchema = z.array(
    profileDataSchema.extend({
        id: z.string().min(1),
        name: z.string().min(1),
        createdAt: z.string(),
        updatedAt: z.string(),
    }),
);

function read(): CameraProfile[] {
    try {
        const parsed = storedSchema.safeParse(
            JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"),
        );
        return parsed.success ? parsed.data : [];
    } catch {
        return [];
    }
}

function write(profiles: CameraProfile[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export const localCameraProfiles = {
    list: async (): Promise<CameraProfile[]> => read(),
    save: async (input: View3dCameraProfileSave): Promise<CameraProfile> => {
        const data = profileDataSchema.parse(input.data);
        const name = input.name.trim().slice(0, PROFILE_NAME_MAX);
        if (!name) throw new Error("A camera profile needs a name");
        const profiles = read();
        const at = new Date().toISOString();
        const existing = profiles.find((p) => p.id === input.id);
        const profile: CameraProfile = {
            ...data,
            id: input.id ?? crypto.randomUUID(),
            name,
            createdAt: existing?.createdAt ?? at,
            updatedAt: at,
        };
        write([...profiles.filter((p) => p.id !== profile.id), profile]);
        return profile;
    },
    remove: async (id: string): Promise<void> => {
        write(read().filter((p) => p.id !== id));
    },
};
