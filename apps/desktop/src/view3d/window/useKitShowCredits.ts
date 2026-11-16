import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { showCreditsFrom } from "@/view3d/core/environment";
import type { ShowCredits } from "@/view3d/core/types";
import { requestDraw } from "./drawWake";
import { useView3dSceneStore } from "./sceneStore";

/**
 * Keeps the kit's video boards showing the show's name, designer and client
 * (Show settings), with the file name standing in for a missing show name,
 * and the board's words in the app's language.
 * Saving Show settings in the editor invalidates the query here too.
 */
export function useKitShowCredits(fileName: string): void {
    const kit = useView3dSceneStore((s) => s.kit);
    const { t } = useTranslate();
    const { data } = useQuery(workspaceSettingsQueryOptions());
    const base = showCreditsFrom(data ?? {}, fileName);
    const credits: ShowCredits = {
        ...base,
        text: {
            heading: t("view3d.board.nowPerforming"),
            untitled: t("view3d.board.untitled"),
            designer:
                base.designer &&
                t("view3d.board.designedBy", { name: base.designer }),
            client:
                base.client &&
                t("view3d.board.forClient", { name: base.client }),
        },
    };
    const key = JSON.stringify(credits);
    useEffect(() => {
        if (!kit?.setShowCredits) return;
        kit.setShowCredits(JSON.parse(key));
        requestDraw(500);
    }, [kit, key]);
}
