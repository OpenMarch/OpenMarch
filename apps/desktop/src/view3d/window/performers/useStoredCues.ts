/**
 * The show's stored cues and performer settings, read in the 3D View window
 * (ADR 0004 D-1 to D-4; amendment of 2026-10-15). The editor relays every
 * query it invalidates (`useView3dPublisher`), so a cue edit, an undo or a
 * beat, tag or marcher delete refreshes these.
 *
 * The show's saved defaults win over the window's step-off foot toggle,
 * which stays an unsaved preview override (`sceneStore.ts`).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CueInput, ShowPhraseAsset } from "@openmarch/core";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";
import { allPhraseAssetsQueryOptions } from "@/hooks/queries/usePhraseAssets";
import { allPagePerformerSettingsQueryOptions } from "@/hooks/queries/usePagePerformerSettings";
import { allMarcherTagsQueryOptions } from "@/hooks/queries/tags/queries";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { performerDefaultsOf } from "@/settings/workspaceSettings";
import type { DatabasePagePerformerSettings } from "@/db-functions";

export interface StoredCues {
    /** The stored cues; empty when the show has none (or no cue tables). */
    cues: readonly CueInput[];
    /** Each marcher's tag ids. */
    tagIds: ReadonlyMap<number, readonly number[]>;
    phraseAssets: readonly ShowPhraseAsset[];
    /** The sets with a stored dot mode. */
    pageSettings: readonly DatabasePagePerformerSettings[];
}

const NO_CUES: readonly CueInput[] = [];
const NO_SETTINGS: readonly DatabasePagePerformerSettings[] = [];

/** The show's saved performer defaults (left foot and foot on the dot unless stored). */
export function useShowPerformerDefaults() {
    const { data } = useQuery(workspaceSettingsQueryOptions());
    return useMemo(() => performerDefaultsOf(data), [data]);
}

/**
 * The stored cues and what compiling them needs, or null while any of it is
 * still loading. A query that fails (a file without the cue tables) counts as
 * nothing stored.
 */
export function useStoredCues(): StoredCues | null {
    const cues = useQuery(allCuesQueryOptions());
    const tags = useQuery(allMarcherTagsQueryOptions());
    const phrases = useQuery(allPhraseAssetsQueryOptions());
    const settings = useQuery(allPagePerformerSettingsQueryOptions());
    const pending =
        cues.isPending ||
        tags.isPending ||
        phrases.isPending ||
        settings.isPending;
    return useMemo(() => {
        if (pending) return null;
        const tagIds = new Map<number, number[]>();
        for (const { marcher_id, tag_id } of tags.data ?? []) {
            const list = tagIds.get(marcher_id);
            if (list) list.push(tag_id);
            else tagIds.set(marcher_id, [tag_id]);
        }
        return {
            cues: cues.data ?? NO_CUES,
            tagIds,
            phraseAssets: (phrases.data ?? []).map(
                ({ id, name, label, channels }) => ({
                    id,
                    name,
                    label,
                    channels,
                }),
            ),
            pageSettings: settings.data ?? NO_SETTINGS,
        };
    }, [pending, cues.data, tags.data, phrases.data, settings.data]);
}
