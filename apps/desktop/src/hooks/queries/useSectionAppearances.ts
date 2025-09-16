import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import {
    DbConnection,
    DatabaseSectionAppearance,
    createSectionAppearances,
    getSectionAppearances,
    getSectionAppearanceById,
    getSectionAppearancesBySection,
    deleteSectionAppearances,
    updateSectionAppearances,
    NewSectionAppearanceArgs,
    ModifiedSectionAppearanceArgs,
} from "@/db-functions";
import { DEFAULT_STALE_TIME } from "./constants";

const KEY_BASE = "section_appearances";

// Query key factory
export const sectionAppearanceKeys = {
    all: () => [KEY_BASE] as const,
    byId: (id: number) => [KEY_BASE, "id", id] as const,
    bySection: (section: string) => [KEY_BASE, "section", section] as const,
};

const sectionAppearanceQueries = {
    getAll: async (db: DbConnection): Promise<DatabaseSectionAppearance[]> => {
        return await getSectionAppearances({ db });
    },
    getById: async (
        db: DbConnection,
        id: number,
    ): Promise<DatabaseSectionAppearance | undefined> => {
        return await getSectionAppearanceById({ db, id });
    },
    getBySection: async (
        db: DbConnection,
        section: string,
    ): Promise<DatabaseSectionAppearance[]> => {
        return await getSectionAppearancesBySection({ db, section });
    },
};

/**
 * Query options for getting all section appearances
 */
export const allSectionAppearancesQueryOptions = () => {
    return queryOptions<DatabaseSectionAppearance[]>({
        queryKey: sectionAppearanceKeys.all(),
        queryFn: async () => {
            return await sectionAppearanceQueries.getAll(db);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Query options for getting a section appearance by ID
 */
export const sectionAppearanceQueryByIdOptions = (id: number) => {
    return queryOptions<DatabaseSectionAppearance | undefined>({
        queryKey: sectionAppearanceKeys.byId(id),
        queryFn: async () => {
            return await sectionAppearanceQueries.getById(db, id);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

/**
 * Query options for getting section appearances by section name
 */
export const sectionAppearancesBySectionQueryOptions = (section: string) => {
    return queryOptions<DatabaseSectionAppearance[]>({
        queryKey: sectionAppearanceKeys.bySection(section),
        queryFn: async () => {
            return await sectionAppearanceQueries.getBySection(db, section);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchSectionAppearances = () => {
    queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
};

export const createSectionAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newItems: NewSectionAppearanceArgs[]) =>
            createSectionAppearances({ db, newItems }),
        onSuccess: (_, variables) => {
            // Invalidate all queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error creating section appearances`, e, variables);
        },
    });
};

export const updateSectionAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedItems: ModifiedSectionAppearanceArgs[]) =>
            updateSectionAppearances({ db, modifiedItems }),
        onSuccess: (_, variables) => {
            // Invalidate specific queries
            const itemIds = new Set<number>();
            const sections = new Set<string>();

            for (const modifiedArgs of variables) {
                itemIds.add(modifiedArgs.id);
                if (modifiedArgs.section) {
                    sections.add(modifiedArgs.section);
                }
            }

            // Invalidate by ID queries
            qc.invalidateQueries({
                queryKey: Array.from(itemIds).map((id) =>
                    sectionAppearanceKeys.byId(id),
                ),
            });

            // Invalidate by section queries
            qc.invalidateQueries({
                queryKey: Array.from(sections).map((section) =>
                    sectionAppearanceKeys.bySection(section),
                ),
            });

            // Invalidate all queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error updating section appearances`, e, variables);
        },
    });
};

export const deleteSectionAppearancesMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (itemIds: Set<number>) =>
            deleteSectionAppearances({ db, itemIds }),
        onSuccess: (_, variables) => {
            // Invalidate all queries
            qc.invalidateQueries({
                queryKey: [KEY_BASE],
            });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting section appearances`, e, variables);
        },
    });
};
