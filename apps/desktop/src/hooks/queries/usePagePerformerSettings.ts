import {
    mutationOptions,
    queryOptions,
    QueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { conToastError } from "@/utilities/utils";
import {
    getPagePerformerSettings,
    setPageDotModes,
    type DatabasePagePerformerSettings,
    type PageDotModeChange,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

/** Matches the table name, so undo and redo refresh these queries. */
const KEY_BASE = "page_performer_settings";

export const pagePerformerSettingsKeys = {
    all: () => [KEY_BASE] as const,
};

/** The pages with stored performer settings (ADR 0004 D-4); others use the show default. */
export const allPagePerformerSettingsQueryOptions = () =>
    queryOptions<DatabasePagePerformerSettings[]>({
        queryKey: pagePerformerSettingsKeys.all(),
        queryFn: async () => await getPagePerformerSettings({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });

export const setPageDotModesMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (changes: PageDotModeChange[]) =>
            setPageDotModes({ db, changes }),
        onSuccess: async () => {
            await qc.invalidateQueries({
                queryKey: pagePerformerSettingsKeys.all(),
            });
        },
        onError: (e, variables) => {
            conToastError("Error setting the dot mode", e, variables);
        },
    });
