import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { showCreditsFrom } from "@/view3d/core/environment";
import { requestDraw } from "./drawWake";
import { useView3dSceneStore } from "./sceneStore";

/**
 * Keeps the kit's video boards showing the show's name, designer and client
 * (Show settings), with the file name standing in for a missing show name.
 * Saving Show settings in the editor invalidates the query here too.
 */
export function useKitShowCredits(fileName: string): void {
    const kit = useView3dSceneStore((s) => s.kit);
    const { data } = useQuery(workspaceSettingsQueryOptions());
    const credits = showCreditsFrom(data ?? {}, fileName);
    const key = JSON.stringify(credits);
    useEffect(() => {
        if (!kit?.setShowCredits) return;
        kit.setShowCredits(JSON.parse(key));
        requestDraw(500);
    }, [kit, key]);
}
