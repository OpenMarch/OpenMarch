import {
    createLightingScenes,
    DatabaseLightingScene,
    FIRST_PAGE_ID,
} from "@/db-functions";
import { db, DB } from "@/global/database/db";
import { lightingKeys } from "@/hooks/queries";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

type EnsureSceneResult = {
    created: boolean;
    scene: DatabaseLightingScene;
};

/** Serialize ensure-default-scene work so concurrent callers (e.g. Strict Mode) share one insert. */
let ensureDefaultLightingSceneInFlight: Promise<EnsureSceneResult> | null =
    null;

/** Checks if there's not a lighting scene at all. If not, create one on the first page */
const checkOrCreateScene = async (
    db: DB,
    queryClient: QueryClient,
): Promise<EnsureSceneResult> => {
    if (ensureDefaultLightingSceneInFlight) {
        return ensureDefaultLightingSceneInFlight;
    }

    ensureDefaultLightingSceneInFlight = (async () => {
        const scene = await db.query.lighting_scenes.findFirst();
        if (scene) {
            return { created: false, scene: scene as DatabaseLightingScene };
        }

        console.debug("Creating default lighting scene");
        const newScene = await createLightingScenes({
            db,
            newScenes: [{ start_page_id: FIRST_PAGE_ID, name: null }],
        });
        void queryClient.invalidateQueries({
            queryKey: lightingKeys.allLightingScenes(),
        });
        return { created: true, scene: newScene[0] };
    })();

    try {
        return await ensureDefaultLightingSceneInFlight;
    } finally {
        ensureDefaultLightingSceneInFlight = null;
    }
};

export const useLightSceneManager = () => {
    const queryClient = useQueryClient();
    useEffect(() => {
        void checkOrCreateScene(db, queryClient);
    }, [queryClient]);
};
