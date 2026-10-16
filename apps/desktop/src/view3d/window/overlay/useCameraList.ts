/**
 * Reads and edits the show's camera list for the current venue, and this
 * computer's camera profiles (`core/cameraList.ts`). List edits go to the
 * editor, which saves them with the show outside the undo history; profiles
 * go to the Library through `window.view3d.cameraProfiles`.
 */
import { useCallback } from "react";
import { useTranslate } from "@tolgee/react";
import {
    copyOfProfile,
    defaultCameraList,
    editCameraList,
    EMPTY_SHOW_CAMERAS,
    MAX_CAMERAS,
    newCameraId,
    newCameraName,
    profileStatus,
    withVenueCameras,
    type CameraListEdit,
    type CameraProfile,
    type ProfileStatus,
    type SavedCamera,
    type VenueCameras,
    type ViewCamera,
} from "@/view3d/core/cameraList";
import type { VenueKitId } from "@/view3d/core/types";
import { useShowCameras } from "@/hooks/queries/useShowCameras";
import { useCameraStore } from "../camera/cameraStore";
import { useView3dSceneStore } from "../sceneStore";
import {
    useCameraProfileMutations,
    useCameraProfiles,
} from "./useCameraProfiles";

export interface CameraList {
    /** The listed cameras, in menu order. */
    cameras: ViewCamera[];
    /** True when the show has its own list for this venue. */
    customized: boolean;
    /** Where the list came from: the defaults, the show, or a profile. */
    status: ProfileStatus;
    /** The venue's cameras as stored, for undoing a remove. */
    venueCameras: VenueCameras | undefined;
    /** The current venue, once built. */
    kitId: VenueKitId | null;
    /** How many cameras the venue has by default. */
    defaultCount: number;
    /** This computer's profiles, every venue, by name. */
    profiles: CameraProfile[];
    /** False until the cameras and the venue have loaded. */
    ready: boolean;
    /** True when no more cameras fit. */
    full: boolean;
    /** The name shown for a camera. */
    label: (camera: ViewCamera) => string;
    edit: (edit: Exclude<CameraListEdit, { kind: "add" }>) => void;
    /** Saves the current view as a new camera; returns its id. */
    addCurrentView: () => string | null;
    /** Moves a camera to the current view. */
    setToCurrentView: (id: string) => void;
    /** Puts the venue's cameras back as they were (undo for a remove). */
    restore: (cameras: VenueCameras | undefined) => void;
    /** Back to the venue's default cameras. */
    chooseDefaults: () => void;
    /** Replaces the list with a profile's, keeping a copy of it. */
    chooseProfile: (profile: CameraProfile) => void;
    /** Saves the list as a new profile on this computer and uses it. */
    saveAsProfile: (name: string) => Promise<void>;
    /** Writes the list into the profile it came from. */
    updateProfile: () => Promise<void>;
    /** Adds the show's copy of a profile this computer doesn't have. */
    addProfileToComputer: () => Promise<void>;
    renameProfile: (profile: CameraProfile, name: string) => Promise<void>;
    deleteProfile: (profile: CameraProfile) => Promise<void>;
}

// eslint-disable-next-line max-lines-per-function
export function useCameraList(): CameraList {
    const { t } = useTranslate();
    const { data: show } = useShowCameras();
    const kit = useView3dSceneStore((s) => s.kit);
    const kitId = useView3dSceneStore((s) => s.kitId);
    const cameras = useView3dSceneStore((s) => s.cameras);
    const customized = useView3dSceneStore((s) => s.camerasCustomized);
    const allProfiles = useCameraProfiles();
    const profileCalls = useCameraProfileMutations();
    const ready = !!show && !!kit && !!kitId;

    const venueCameras = kitId ? show?.venues[kitId] : undefined;
    const status = profileStatus(venueCameras, allProfiles);
    const profiles = [...allProfiles].sort((a, b) =>
        a.name.localeCompare(b.name),
    );

    const label = useCallback(
        (camera: ViewCamera) => camera.name ?? t(camera.labelKey),
        [t],
    );

    const write = (next: VenueCameras | undefined) => {
        if (!kitId) return;
        window.view3d.requestCamerasChange(
            withVenueCameras(show ?? EMPTY_SHOW_CAMERAS, kitId, next),
        );
    };

    /** The list to edit: the show's own, or the defaults as a starting point. */
    const currentList = (): SavedCamera[] | null => {
        if (!show || !kit || !kitId) return null;
        return venueCameras?.list ?? defaultCameraList(kit.cameras);
    };
    /** Changes the list, keeping the profile it came from. */
    const saveList = (list: SavedCamera[]) => write({ ...venueCameras, list });
    const labelOf = (entry: SavedCamera) => {
        const shown = cameras.find((camera) => camera.id === entry.id);
        return shown ? label(shown) : entry.id;
    };

    const edit: CameraList["edit"] = (change) => {
        const list = currentList();
        if (list) saveList(editCameraList(list, change, labelOf));
    };

    const addCurrentView = () => {
        const list = currentList();
        const pose = useCameraStore.getState().currentPose();
        if (!list || !pose || list.length >= MAX_CAMERAS) return null;
        const id = newCameraId(list);
        const name = newCameraName(
            cameras.map(label),
            t("view3d.cameras.newName"),
        );
        saveList(editCameraList(list, { kind: "add", id, name, pose }));
        useCameraStore.getState().markActive(id);
        return id;
    };

    const setToCurrentView = (id: string) => {
        const pose = useCameraStore.getState().currentPose();
        if (!pose) return;
        edit({ kind: "setView", id, pose });
        useCameraStore.getState().markActive(id);
    };

    const chooseProfile = (profile: CameraProfile) =>
        write({ list: profile.cameras, profile: copyOfProfile(profile) });

    const saveAsProfile = async (name: string) => {
        const list = currentList();
        if (!list || !kitId) return;
        const saved = await profileCalls.save({
            name,
            data: { kit: kitId, cameras: list },
        });
        write({ list, profile: copyOfProfile(saved) });
    };

    const updateProfile = async () => {
        const list = currentList();
        if (!list || !kitId || status.kind !== "profile") return;
        const saved = await profileCalls.save({
            id: status.profile.id,
            name: status.localProfile?.name ?? status.profile.name,
            data: { kit: kitId, cameras: list },
        });
        write({ list, profile: copyOfProfile(saved) });
    };

    const addProfileToComputer = async () => {
        if (!kitId || !venueCameras || status.kind !== "profile") return;
        const saved = await profileCalls.save({
            id: status.profile.id,
            name: status.profile.name,
            data: { kit: kitId, cameras: status.profile.cameras },
        });
        write({ ...venueCameras, profile: copyOfProfile(saved) });
    };

    return {
        cameras,
        customized,
        status,
        venueCameras,
        kitId,
        defaultCount: kit?.cameras.length ?? 0,
        profiles,
        ready,
        full: cameras.length >= MAX_CAMERAS,
        label,
        edit,
        addCurrentView,
        setToCurrentView,
        restore: write,
        chooseDefaults: () => write(undefined),
        chooseProfile,
        saveAsProfile,
        updateProfile,
        addProfileToComputer,
        renameProfile: async (profile, name) => {
            await profileCalls.save({
                id: profile.id,
                name,
                data: { kit: profile.kit, cameras: profile.cameras },
            });
        },
        deleteProfile: async (profile) => {
            await profileCalls.remove(profile.id);
        },
    };
}
