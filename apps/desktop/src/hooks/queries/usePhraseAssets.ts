import {
    mutationOptions,
    queryOptions,
    QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { conToastError } from "@/utilities/utils";
import {
    createPhraseAssets,
    deletePhraseAssets,
    getPhraseAssets,
    updatePhraseAssets,
    type DatabasePhraseAsset,
    type ModifiedPhraseAssetArgs,
    type NewPhraseAssetArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

/** Matches the table name, so undo and redo refresh these queries. */
const KEY_BASE = "phrase_assets";

export const phraseAssetKeys = {
    all: () => [KEY_BASE] as const,
};

/** The show's own phrase assets (ADR 0004 D-3), in id order. */
export const allPhraseAssetsQueryOptions = () =>
    queryOptions<DatabasePhraseAsset[]>({
        queryKey: phraseAssetKeys.all(),
        queryFn: async () => await getPhraseAssets({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

export const createPhraseAssetsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (newPhraseAssets: NewPhraseAssetArgs[]) =>
            createPhraseAssets({ db, newPhraseAssets }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: phraseAssetKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error creating phrases", e, variables);
        },
    });

export const updatePhraseAssetsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (modifiedPhraseAssets: ModifiedPhraseAssetArgs[]) =>
            updatePhraseAssets({ db, modifiedPhraseAssets }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: phraseAssetKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error updating phrases", e, variables);
        },
    });

/** Fails, with nothing deleted, while a cue still uses one of the phrases. */
export const deletePhraseAssetsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (phraseAssetIds: Set<number>) =>
            deletePhraseAssets({ db, phraseAssetIds }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: phraseAssetKeys.all() });
        },
        onError: (e, variables) => {
            conToastError("Error deleting phrases", e, variables);
        },
    });
