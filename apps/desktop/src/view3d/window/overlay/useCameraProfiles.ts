/**
 * This computer's camera profiles (`window.view3d.cameraProfiles`), as a
 * query the window reloads after its own writes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CameraProfile } from "@/view3d/core/cameraList";
import type { View3dCameraProfileSave } from "@/view3d/sync/protocol";

export const cameraProfilesKey = ["view3d", "cameraProfiles"] as const;

export function useCameraProfiles(): CameraProfile[] {
    const { data } = useQuery({
        queryKey: cameraProfilesKey,
        queryFn: () => window.view3d.cameraProfiles.list(),
    });
    return data ?? [];
}

export function useCameraProfileMutations() {
    const queryClient = useQueryClient();
    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: cameraProfilesKey });
    const save = useMutation({
        mutationFn: (profile: View3dCameraProfileSave) =>
            window.view3d.cameraProfiles.save(profile),
        onSettled: refresh,
        onError: (error) =>
            console.error("3D View: couldn't save the camera profile", error),
    });
    const remove = useMutation({
        mutationFn: (id: string) => window.view3d.cameraProfiles.remove(id),
        onSettled: refresh,
        onError: (error) =>
            console.error("3D View: couldn't delete the camera profile", error),
    });
    return { save: save.mutateAsync, remove: remove.mutateAsync };
}
