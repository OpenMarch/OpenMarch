import {
    createLightingEffects,
    createLightingScenes,
    createMarcherLightingEffects,
    deleteLightingEffects,
    deleteLightingScenes,
    deleteMarcherLightingEffects,
    ModifiedLightingEffectArgs,
    ModifiedLightingSceneArgs,
    NewLightingEffectArgs,
    NewLightingSceneArgs,
    NewMarcherLightingEffectArgs,
    updateLightingEffects,
    updateLightingScenes,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { mutationOptions } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import { lightingKeys } from "./queries";

// ============================================================================
// LIGHTING SCENES MUTATIONS
// ============================================================================

export const createLightingScenesMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newScenes: NewLightingSceneArgs[]) =>
            createLightingScenes({ db, newScenes }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
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

// ============================================================================
// LIGHTING EFFECTS MUTATIONS
// ============================================================================

export const createLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newEffects: NewLightingEffectArgs[]) =>
            createLightingEffects({ db, newEffects }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
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
            const queryKey = lightingKeys.lightingEffectById(variables.id);
            void qc.invalidateQueries({ queryKey });
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

// ============================================================================
// MARCHER LIGHTING EFFECTS MUTATIONS
// ============================================================================

export const createMarcherLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (newLinks: NewMarcherLightingEffectArgs[]) =>
            createMarcherLightingEffects({ db, newLinks }),
        onSuccess: async (_data, variables, _result, context) => {
            const qc = context.client;
            const effectIds = new Set(
                variables.map(
                    (marcherLightingEffect) =>
                        marcherLightingEffect.lighting_effect_id,
                ),
            );
            for (const effectId of effectIds)
                void qc.invalidateQueries({
                    queryKey:
                        lightingKeys.marcherLightingEffectsByLightingEffectId(
                            effectId,
                        ),
                });
        },
        onError: (e, variables) => {
            conToastError(
                "Error creating marcher lighting effects",
                e,
                variables,
            );
        },
    });
};

export const deleteMarcherLightingEffectsMutationOptions = () => {
    return mutationOptions({
        mutationFn: (linkIds: Set<number>) =>
            deleteMarcherLightingEffects({ db, linkIds }),
        onSuccess: async (data, _variables, _result, context) => {
            const qc = context.client;
            const effectIds = new Set(
                data.map(
                    (marcherLightingEffect) =>
                        marcherLightingEffect.lighting_effect_id,
                ),
            );
            for (const effectId of effectIds)
                void qc.invalidateQueries({
                    queryKey:
                        lightingKeys.marcherLightingEffectsByLightingEffectId(
                            effectId,
                        ),
                });
        },
        onError: (e, variables) => {
            conToastError(
                "Error deleting marcher lighting effects",
                e,
                variables,
            );
        },
    });
};
