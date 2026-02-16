import { db } from "@/global/database/db";
import {
    queryOptions,
    mutationOptions,
    QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import {
    createProps,
    getPropsWithMarchers,
    getPropPageGeometry,
    getPropImages,
    updateProps,
    updatePropPageGeometry,
    updatePropGeometryWithPropagation,
    updatePropImage,
    deletePropImage,
    deleteProps,
    NewPropArgs,
    ModifiedPropArgs,
    ModifiedPropPageGeometryArgs,
    GeometryPropagation,
} from "@/db-functions";
import {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";
import { DEFAULT_STALE_TIME } from "./constants";
import { marcherKeys } from "./useMarchers";
import { marcherPageKeys } from "./useMarcherPages";

const KEY_BASE = "props";
const GEOMETRY_KEY = "prop_page_geometry";
const IMAGE_KEY = "prop_images";

export const propKeys = {
    all: () => [KEY_BASE] as const,
    byId: (propId: number) => [KEY_BASE, "id", propId] as const,
};

export const propGeometryKeys = {
    all: () => [GEOMETRY_KEY] as const,
    byPageId: (pageId: number) => [GEOMETRY_KEY, "page", pageId] as const,
};

export const propImageKeys = {
    all: () => [IMAGE_KEY] as const,
};

export const allPropsQueryOptions = () => {
    return queryOptions<PropWithMarcher[]>({
        queryKey: propKeys.all(),
        queryFn: async () => {
            return await getPropsWithMarchers({ db });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const propPageGeometryQueryOptions = () => {
    return queryOptions<DatabasePropPageGeometry[]>({
        queryKey: propGeometryKeys.all(),
        queryFn: async () => {
            return await getPropPageGeometry({ db });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const propImagesQueryOptions = () => {
    return queryOptions<{ prop_id: number; image: Uint8Array }[]>({
        queryKey: propImageKeys.all(),
        queryFn: async () => getPropImages({ db }),
        staleTime: DEFAULT_STALE_TIME,
    });
};

export const fetchProps = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY_BASE] });
    void queryClient.invalidateQueries({ queryKey: [GEOMETRY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [IMAGE_KEY] });
};

export const createPropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (newProps: NewPropArgs[]) => createProps({ db, newProps }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: [KEY_BASE] });
            void qc.invalidateQueries({ queryKey: [GEOMETRY_KEY] });
            void qc.invalidateQueries({ queryKey: marcherKeys.all() });
            void qc.invalidateQueries({ queryKey: marcherPageKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(`Error creating props`, e, variables);
        },
    });
};

export const updatePropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedProps: ModifiedPropArgs[]) =>
            updateProps({ db, modifiedProps }),
        onSuccess: (_data, modifiedProps) => {
            void qc.invalidateQueries({ queryKey: [KEY_BASE] });
            if (modifiedProps.some((m) => m.name != null))
                void qc.invalidateQueries({ queryKey: marcherKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(`Error updating props`, e, variables);
        },
    });
};

export const updatePropGeometryMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (modifiedGeometries: ModifiedPropPageGeometryArgs[]) =>
            updatePropPageGeometry({ db, modifiedGeometries }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [GEOMETRY_KEY] });
        },
        onError: (e, variables) => {
            conToastError(`Error updating prop geometry`, e, variables);
        },
    });
};

export const updatePropGeometryWithPropagationMutationOptions = (
    qc: QueryClient,
) => {
    return mutationOptions({
        mutationFn: (args: {
            propId: number;
            currentPageId: number;
            changes: Omit<ModifiedPropPageGeometryArgs, "id">;
            propagation: GeometryPropagation;
        }) => updatePropGeometryWithPropagation({ db, ...args }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [GEOMETRY_KEY] });
        },
        onError: (e, variables) => {
            conToastError(`Error updating prop geometry`, e, variables);
        },
    });
};

export const updatePropImageMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (args: { propId: number; image: Uint8Array }) =>
            updatePropImage({ db, ...args }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: propImageKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(`Error updating prop image`, e, variables);
        },
    });
};

export const deletePropImageMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (propId: number) => deletePropImage({ db, propId }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: propImageKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting prop image`, e, variables);
        },
    });
};

export const deletePropsMutationOptions = (qc: QueryClient) => {
    return mutationOptions({
        mutationFn: (propIds: Set<number>) => deleteProps({ db, propIds }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [KEY_BASE] });
            void qc.invalidateQueries({ queryKey: [GEOMETRY_KEY] });
            void qc.invalidateQueries({ queryKey: [IMAGE_KEY] });
            void qc.invalidateQueries({ queryKey: marcherKeys.all() });
            void qc.invalidateQueries({ queryKey: marcherPageKeys.all() });
        },
        onError: (e, variables) => {
            conToastError(`Error deleting props`, e, variables);
        },
    });
};
