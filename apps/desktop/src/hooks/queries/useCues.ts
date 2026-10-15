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

/**
 * Matches the table name, so undo and redo (which invalidate by table name) refresh these
 * queries. `cue_marchers` maps here too (`utils.ts`): set members are read with their cue.
 */
const KEY_BASE = "cues";

export const cueKeys = {
    all: () => [KEY_BASE] as const,
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
