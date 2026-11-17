import {
    mutationOptions,
    queryOptions,
    QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
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
 * queries. `cue_marchers` maps here too (`utils.ts`): a cue is read with its performers.
 *
 * Deleting beats, measures or marchers can change the cue tables (ADR 0004 amendment of
 * 2026-10-15), so those write paths invalidate this key as well. The editor relays every
 * invalidation to the 3D View (`useView3dPublisher`), so its cue compile refreshes too.
 */
const KEY_BASE = "cues";

export const cueKeys = {
    all: () => [KEY_BASE] as const,
};

/** Every cue, in id order, with its performers (ADR 0015 D-9). */
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
            conToastError(tolgee.t("cues.errors.create"), e, variables);
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
            conToastError(tolgee.t("cues.errors.update"), e, variables);
        },
    });

export const deleteCuesMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (cueIds: Set<number>) => deleteCues({ db, cueIds }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: cueKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(tolgee.t("cues.errors.delete"), e, variables);
        },
    });
