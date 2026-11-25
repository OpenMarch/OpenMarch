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
    type CameraFocus,
    type CameraFollow,
    type CameraListEdit,
    type SavedCamera,
    type VenueCameras,
    type ViewCamera,
    type ViewPose,
} from "@/view3d/core/cameraList";
import type { VenueKitId } from "@/view3d/core/types";
import { useShowCameras } from "@/hooks/queries/useShowCameras";
import { useCameraStore } from "../camera/cameraStore";
import { SEAT_FOV_DEG, seatAim } from "../camera/rigMath";
import { framingOf, useFollowStore } from "../camera/followStore";
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
    /** Adds a copy of a camera right after it; returns the copy's id. */
    duplicate: (id: string) => string | null;
    /** Moves a camera to the current view (following whoever the view follows). */
    setToCurrentView: (id: string) => void;
    /** Sets a camera's exact settings and jumps the view there. */
    setExact: (
        id: string,
        pose: ViewPose,
        extras: { follow: CameraFollow | null; focus: CameraFocus | null },
    ) => void;
    /** Replaces the venue's cameras with `list` (an imported file's). */
    replaceAll: (list: SavedCamera[]) => void;
    /** Puts the venue's cameras back as they were (undo for a remove). */
    restore: (cameras: VenueCameras | undefined) => void;
    /** Back to the venue's default cameras. */
    chooseDefaults: () => void;
}

/** Who the view follows now and how it aims, as a camera's follow setting; null for nobody. */
function currentFollow(): CameraFollow | null {
    const store = useFollowStore.getState();
    const follow = store.follow;
    if (!follow) return null;
    return {
        marcherId: follow.marcherId,
        mode: follow.mode,
        ...(store.currentFraming() ?? follow.framing ?? {}),
    };
}

// eslint-disable-next-line max-lines-per-function
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
        saveList(
            editCameraList(list, {
                kind: "add",
                id,
                name,
                pose,
                follow: currentFollow(),
                focus: useCameraStore.getState().focus,
            }),
        );
        useCameraStore.getState().markActive(id);
        return id;
    };

    const duplicate = (id: string) => {
        const list = currentList();
        const camera = cameras.find((c) => c.id === id);
        if (!list || !camera || list.length >= MAX_CAMERAS) return null;
        const copyId = newCameraId(list);
        const original = label(camera);
        const name = newCameraName(cameras.map(label), (n) =>
            n === 1
                ? t("view3d.cameras.copyName", { name: original })
                : t("view3d.cameras.copyNameN", { name: original, n }),
        );
        saveList(
            editCameraList(list, {
                kind: "add",
                id: copyId,
                name,
                after: id,
                pose: {
                    // Where it actually looks, as the view shows it.
                    ...seatAim(camera),
                    fovDeg: camera.fovDeg ?? SEAT_FOV_DEG,
                    rollDeg: camera.rollDeg,
                },
                follow: camera.follow,
                focus: camera.focus,
            }),
        );
        return copyId;
    };

    const setToCurrentView = (id: string) => {
        const pose = useCameraStore.getState().currentPose();
        if (!pose) return;
        edit({
            kind: "setView",
            id,
            pose,
            follow: currentFollow(),
            focus: useCameraStore.getState().focus,
        });
        useCameraStore.getState().markActive(id);
    };

    const setExact: CameraList["setExact"] = (id, pose, { follow, focus }) => {
        const list = currentList();
        if (!list) return;
        const next = editCameraList(
            list,
            { kind: "setView", id, pose, follow, focus },
            labelOf,
        );
        saveList(next);
        // Show it now: the saved list takes a moment to come back.
        const camera = useCameraStore.getState();
        if (follow) {
            const store = useFollowStore.getState();
            const current = store.follow;
            if (
                current?.marcherId !== follow.marcherId ||
                current?.mode !== follow.mode
            )
                store.followMarcher(
                    follow.marcherId,
                    follow.mode,
                    pose.fovDeg,
                    framingOf(follow),
                );
            else store.setFraming(pose.fovDeg, framingOf(follow) ?? {});
            // After following starts, which clears the view's focus.
            camera._setFocus(focus);
        } else camera.showPose(pose, focus);
        camera.markActive(id);
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
        duplicate,
        setToCurrentView,
        setExact,
        replaceAll: (next) => saveList(next.slice(0, MAX_CAMERAS)),
        restore: write,
        chooseDefaults: () => write(undefined),
    };
}
