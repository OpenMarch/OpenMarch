import {
    addMarchersToLightingGroup,
    createLightingEffects,
    createLightingGroups,
    createLightingScenes,
    deleteLightingGroups,
    deleteLightingSceneWithReassignment,
    deleteLightingEffects,
    deleteLightingScenes,
    DeleteLightingSceneWithReassignmentResult,
    getLightingGroupById,
    ModifiedLightingEffectArgs,
    ModifiedLightingGroupArgs,
    ModifiedLightingSceneArgs,
    NewLightingEffectArgs,
    NewLightingGroupArgs,
    NewLightingSceneArgs,
    removeMarchersFromLightingGroup,
    updateLightingEffects,
    updateLightingGroups,
    updateLightingScenes,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import {
    getLightingEffectBatchUpdateErrorMessage,
    getLightingEffectUpdateErrorMessage,
} from "./lightingMutationErrors";
import { lightingKeys } from "./queries";

const invalidateAllLightingQueries = (qc: {
    invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown;
}) => {
    void qc.invalidateQueries({
        queryKey: lightingKeys.allLightingScenes(),
    });
};

const invalidateLightingEffectQueries = (
    qc: QueryClient,
    effectIds: Iterable<number>,
) => {
    invalidateAllLightingQueries(qc);
    for (const id of effectIds) {
        void qc.invalidateQueries({
            queryKey: lightingKeys.lightingEffectById(id),
        });
    }
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
                void qc.invalidateQueries({
                    queryKey:
                        lightingKeys.lightingGroupMembershipsBySceneId(sceneId),
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

export const updateLightingGroupsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (modifiedGroups: ModifiedLightingGroupArgs[]) =>
            updateLightingGroups({ db, modifiedGroups }),
        onSuccess: async (data, _variables, _result, context) => {
            const qc = context.client;
            const sceneIds = new Set(data.map((group) => group.scene_id));
            for (const sceneId of sceneIds) {
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingGroupsBySceneId(sceneId),
                });
            }
        },
        onError: (e, variables) => {
            conToastError("Error updating lighting groups", e, variables);
        },
    });
};

export const addMarchersToLightingGroupMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            groupId,
            marcherIds,
        }: {
            groupId: number;
            marcherIds: readonly number[];
        }) => addMarchersToLightingGroup({ db, groupId, marcherIds }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            const group = await getLightingGroupById({
                db,
                id: variables.groupId,
            });
            if (group != null)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingGroupMembershipsBySceneId(
                        group.scene_id,
                    ),
                });
        },
        onError: (e, variables) => {
            conToastError(
                "Error adding marchers to lighting group",
                e,
                variables,
            );
        },
    });
};

export const removeMarchersFromLightingGroupMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            groupId,
            marcherIds,
        }: {
            groupId: number;
            marcherIds: readonly number[];
        }) => removeMarchersFromLightingGroup({ db, groupId, marcherIds }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            invalidateAllLightingQueries(qc);
            const group = await getLightingGroupById({
                db,
                id: variables.groupId,
            });
            if (group != null)
                void qc.invalidateQueries({
                    queryKey: lightingKeys.lightingGroupMembershipsBySceneId(
                        group.scene_id,
                    ),
                });
        },
        onError: (e, variables) => {
            conToastError(
                "Error removing marchers from lighting group",
                e,
                variables,
            );
        },
    });
};

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
        onSettled: async (_data, _error, variables, _result, context) => {
            invalidateLightingEffectQueries(context.client, [variables.id]);
        },
        onError: (e, variables) => {
            conToastError(getLightingEffectUpdateErrorMessage(e), e, variables);
        },
    });
};

/** Single-transaction updates for overlap moves (strip group + add group) or multi-effect edits. */
export const updateLightingEffectsBatchMutationOptions = () => {
    return mutationOptions({
        mutationFn: async (modifiedEffects: ModifiedLightingEffectArgs[]) => {
            if (modifiedEffects.length === 0) return [];
            return await updateLightingEffects({
                db,
                modifiedEffects,
            });
        },
        onSettled: async (_data, _error, variables, _result, context) => {
            invalidateLightingEffectQueries(
                context.client,
                variables.map((v) => v.id),
            );
        },
        onError: (e, variables) => {
            conToastError(
                getLightingEffectBatchUpdateErrorMessage(e),
                e,
                variables,
            );
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
