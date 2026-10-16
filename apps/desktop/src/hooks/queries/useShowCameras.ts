import {
    mutationOptions,
    queryOptions,
    useQuery,
    type QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import {
    getShowCameras,
    updateShowCameras,
} from "@/db-functions/view3dCameras";
import type { ShowCameras } from "@/view3d/core/cameraList";
import { conToastError } from "@/utilities/utils";
import { DEFAULT_STALE_TIME } from "./constants";

/**
 * The key matches the table name, like every other table query, so the 3D
 * View relay refreshes it after a write.
 */
export const showCamerasKeys = {
    all: () => ["view3d_cameras"] as const,
};

/** The show's camera lists for every venue it changed. Reading never writes. */
export const showCamerasQueryOptions = () =>
    queryOptions<ShowCameras>({
        queryKey: showCamerasKeys.all(),
        queryFn: () => getShowCameras({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

export const useShowCameras = () => useQuery(showCamerasQueryOptions());

/**
 * Stores the show's camera lists, outside the undo history, then
 * invalidates `["view3d_cameras"]`.
 */
export const updateShowCamerasMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (cameras: ShowCameras) =>
            updateShowCameras({ db, cameras }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: showCamerasKeys.all() });
        },
        onError: (error, cameras) => {
            conToastError("Failed to save the 3D View cameras", error, cameras);
        },
    });
