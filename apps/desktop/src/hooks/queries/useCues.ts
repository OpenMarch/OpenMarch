import {
    mutationOptions,
    queryOptions,
    QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { conToastError } from "@/utilities/utils";
import {
    createCues,
    deleteCues,
    getCues,
    updateCues,
    type DatabaseCue,
    type ModifiedCueArgs,
    type NewCueArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";
import { phraseAssetKeys } from "./usePhraseAssets";
import { pagePerformerSettingsKeys } from "./usePagePerformerSettings";

/**
 * Matches the table name, so undo and redo (which invalidate by table name) refresh these
 * queries. `cue_marchers` maps here too (`utils.ts`): set members are read with their cue.
 */
const KEY_BASE = "cues";

export const cueKeys = {
    all: () => [KEY_BASE] as const,
};

/**
 * Refreshes what deleting beats, measures, tags or marchers can change in the cue tables: the
 * cues, the phrase assets and the per-set performer settings. The editor relays every
 * invalidation to the 3D View (`useView3dPublisher`), so its cue compile refreshes too.
 */
export const invalidateCueQueries = async (qc: QueryClient) => {
    await Promise.all(
        [
            cueKeys.all(),
            phraseAssetKeys.all(),
            pagePerformerSettingsKeys.all(),
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
};

/** Every cue, in id order, with set members inlined (ADR 0004 D-1, D-2). */
export const allCuesQueryOptions = () =>
    queryOptions<DatabaseCue[]>({
        queryKey: cueKeys.all(),
        queryFn: async () => await getCues({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

export const createCuesMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (newCues: NewCueArgs[]) => createCues({ db, newCues }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: cueKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error creating cues", e, variables);
        },
    });

export const updateCuesMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (modifiedCues: ModifiedCueArgs[]) =>
            updateCues({ db, modifiedCues }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: cueKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error updating cues", e, variables);
        },
    });

export const deleteCuesMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (cueIds: Set<number>) => deleteCues({ db, cueIds }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: cueKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error deleting cues", e, variables);
        },
    });
