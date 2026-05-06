import {
    createLightingEffects,
    createLightingGroups,
    createLightingScenes,
    deleteLightingGroups,
    deleteLightingSceneWithReassignment,
    deleteLightingEffects,
    deleteLightingScenes,
    DeleteLightingSceneWithReassignmentResult,
    ModifiedLightingEffectArgs,
    ModifiedLightingSceneArgs,
    NewLightingEffectArgs,
    NewLightingGroupArgs,
    NewLightingSceneArgs,
    updateLightingEffects,
    updateLightingScenes,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { mutationOptions } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import { lightingKeys } from "./queries";

const invalidateAllLightingQueries = (qc: {
    invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown;
}) => {
    void qc.invalidateQueries({
        queryKey: lightingKeys.allLightingScenes(),
    });
};

// ============================================================================
// LIGHTING SCENES MUTATIONS
// ============================================================================

export const createLightingScenesMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newScenes: NewLightingSceneArgs[]) =>
            createLightingScenes({ db, newScenes }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            void qc.invalidateQueries({
                queryKey: lightingKeys.allLightingScenes(),
            });
            const pageIds = new Set(
                variables.map((scene) => scene.start_page_id),
            );
            for (const pageId of pageIds)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneIdInPageId(pageId),
                });
        },
        onError: (e, variables) => {
            conToastError("Error creating lighting scenes", e, variables);
        },
    });
};

export const updateLightingScenesMutationOptions = () => {
    return mutationOptions({
        mutationFn: async (modifiedScene: ModifiedLightingSceneArgs) => {
            const rows = await updateLightingScenes({
                db,
                modifiedScenes: [modifiedScene],
            });
            return rows[0];
        },
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            void qc.invalidateQueries({
                queryKey: lightingKeys.allLightingScenes(),
            });
            const sceneId = variables.id;
            void qc.invalidateQueries({
                queryKey: lightingKeys.lightingSceneDataById(sceneId),
            });
        },
        onError: (e, variables) => {
            conToastError("Error updating lighting scene", e, variables);
        },
    });
};

export const deleteLightingScenesMutationOptions = () => {
    return mutationOptions({
        mutationFn: (sceneIds: Set<number>) =>
            deleteLightingScenes({ db, sceneIds }),
        onSuccess: async (data, _variables, _result, context) => {
            const qc = context.client;
            void qc.invalidateQueries({
                queryKey: lightingKeys.allLightingScenes(),
            });
            const pageIds = new Set(data.map((scene) => scene.start_page_id));
            for (const pageId of pageIds)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneIdInPageId(pageId),
                });
        },
        onError: (e, variables) => {
            conToastError("Error deleting lighting scenes", e, variables);
        },
    });
};

export const deleteLightingSceneWithReassignmentMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            sceneId,
            reassignedSceneId,
            reassignedStartPageId,
        }: {
            sceneId: number;
            reassignedSceneId?: number | null;
            reassignedStartPageId?: number;
        }) =>
            deleteLightingSceneWithReassignment({
                db,
                sceneId,
                reassignedSceneId,
                reassignedStartPageId,
            }),
        onSuccess: async (
            data: DeleteLightingSceneWithReassignmentResult,
            _variables,
            _result,
            context,
        ) => {
            const qc = context.client;
            void qc.invalidateQueries({
                queryKey: lightingKeys.allLightingScenes(),
            });

            const pageIds = new Set<number>(
                data.deletedScenes.map((scene) => scene.start_page_id),
            );
            if (data.reassignedScene) {
                pageIds.add(data.reassignedScene.start_page_id);
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneDataById(
                        data.reassignedScene.id,
                    ),
                });
            }

            for (const pageId of pageIds) {
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneIdInPageId(pageId),
                });
            }
        },
        onError: (e, variables) => {
            conToastError(
                "Error deleting lighting scene with reassignment",
                e,
                variables,
            );
        },
    });
};

// ============================================================================
// LIGHTING GROUPS MUTATIONS
// ============================================================================

export const createLightingGroupsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newGroups: NewLightingGroupArgs[]) =>
            createLightingGroups({ db, newGroups }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            const sceneIds = new Set(variables.map((group) => group.scene_id));
            for (const sceneId of sceneIds) {
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingGroupsBySceneId(sceneId),
                });
            }
        },
        onError: (e, variables) => {
            conToastError("Error creating lighting groups", e, variables);
        },
    });
};

export const deleteLightingGroupsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (groupIds: Set<number>) =>
            deleteLightingGroups({ db, groupIds }),
        onSuccess: async (_data, _variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
        },
        onError: (e, variables) => {
            conToastError("Error deleting lighting groups", e, variables);
        },
    });
};

// ============================================================================
// LIGHTING EFFECTS MUTATIONS
// ============================================================================

export const createLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newEffects: NewLightingEffectArgs[]) =>
            createLightingEffects({ db, newEffects }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            const sceneIds = new Set(
                variables.map((effect) => effect.scene_id),
            );
            for (const sceneId of sceneIds)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneDataById(sceneId),
                });
        },
        onError: (e, variables) => {
            conToastError("Error creating lighting effects", e, variables);
        },
    });
};

export const updateLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: async (modifiedEffect: ModifiedLightingEffectArgs) => {
            const rows = await updateLightingEffects({
                db,
                modifiedEffects: [modifiedEffect],
            });
            return rows[0];
        },
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            void qc.invalidateQueries({
                queryKey: lightingKeys.lightingEffectById(variables.id),
            });
        },
        onError: (e, variables) => {
            conToastError("Error updating lighting effect", e, variables);
        },
    });
};

export const deleteLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (effectIds: Set<number>) =>
            deleteLightingEffects({ db, effectIds }),
        onSuccess: async (data, _variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            const sceneIds = new Set(data.map((effect) => effect.scene_id));
            for (const sceneId of sceneIds)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingSceneDataById(sceneId),
                });
        },
        onError: (e, variables) => {
            conToastError("Error deleting lighting effects", e, variables);
        },
    });
};
