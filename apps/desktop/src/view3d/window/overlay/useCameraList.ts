/**
 * Reads and edits the show's camera list for the current venue
 * (`core/cameraList.ts`). Edits go to the editor, which saves them with the
 * show outside the undo history.
 */
import { useCallback } from "react";
import { useTranslate } from "@tolgee/react";
import {
    defaultCameraList,
    editCameraList,
    EMPTY_SHOW_CAMERAS,
    MAX_CAMERAS,
    newCameraId,
    newCameraName,
    withVenueCameras,
    type CameraListEdit,
    type SavedCamera,
    type VenueCameras,
    type ViewCamera,
} from "@/view3d/core/cameraList";
import type { VenueKitId } from "@/view3d/core/types";
import { useShowCameras } from "@/hooks/queries/useShowCameras";
import { useCameraStore } from "../camera/cameraStore";
import { useView3dSceneStore } from "../sceneStore";

export interface CameraList {
    /** The listed cameras, in menu order. */
    cameras: ViewCamera[];
    /** True when the show has its own list for this venue. */
    customized: boolean;
    /** The venue's cameras as stored, for undoing a remove. */
    venueCameras: VenueCameras | undefined;
    /** The current venue, once built. */
    kitId: VenueKitId | null;
    /** How many cameras the venue has by default. */
    defaultCount: number;
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
}

export function useCameraList(): CameraList {
    const { t } = useTranslate();
    const { data: show } = useShowCameras();
    const kit = useView3dSceneStore((s) => s.kit);
    const kitId = useView3dSceneStore((s) => s.kitId);
    const cameras = useView3dSceneStore((s) => s.cameras);
    const customized = useView3dSceneStore((s) => s.camerasCustomized);
    const ready = !!show && !!kit && !!kitId;

    const venueCameras = kitId ? show?.venues[kitId] : undefined;

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
    const saveList = (list: SavedCamera[]) => write({ list });
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
        const name = newCameraName(cameras.map(label), (n) =>
            t("view3d.cameras.newName", { n }),
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

    return {
        cameras,
        customized,
        venueCameras,
        kitId,
        defaultCount: kit?.cameras.length ?? 0,
        ready,
        full: cameras.length >= MAX_CAMERAS,
        label,
        edit,
        addCurrentView,
        setToCurrentView,
        restore: write,
        chooseDefaults: () => write(undefined),
    };
}
