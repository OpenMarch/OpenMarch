import EffectItem from "@/components/inspector/lighting/EffectItem";
import { useLightSceneManager } from "@/components/workspace/lightDesigner/useLightSceneManager";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    createLightingEffectsMutationOptions,
    updateLightingEffectsMutationOptions,
    useLightingEffectsInSelectedPageQuery,
} from "@/hooks/queries";
import {
    createNewLightingEffect,
    updateLightingEffectType,
} from "@openmarch/core";
import { Button } from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { T } from "@tolgee/react";

export default function EffectList() {
    const { selectedPage } = useSelectedPage()!;
    const { lightingSceneData, lightingEffectsData, isLoadingLightingScene } =
        useLightingEffectsInSelectedPageQuery(selectedPage?.id);
    useLightSceneManager();

    const { mutate: createEffectsMutation } = useMutation(
        createLightingEffectsMutationOptions(),
    );
    const { mutate: updateEffect } = useMutation(
        updateLightingEffectsMutationOptions(),
    );

    const sceneId = lightingSceneData?.id;
    const effectIds = lightingSceneData?.lightingEffectIds ?? [];

    const handleAddEffect = () => {
        if (sceneId == null) return;
        createNewLightingEffect((name, type, argsJson) => {
            createEffectsMutation([
                {
                    scene_id: sceneId,
                    name,
                    type,
                    args: argsJson,
                },
            ]);
        });
    };

    if (!selectedPage) {
        return (
            <div className="flex w-full flex-col gap-16 px-6">
                <p className="text-body text-text/60">
                    <T
                        keyName="workspace.lightDesigner.effects.noPage"
                        defaultValue="Select a page to edit lighting effects."
                    />
                </p>
            </div>
        );
    }

    if (isLoadingLightingScene) {
        return (
            <div className="flex w-full flex-col gap-16 px-6">
                <p className="text-body text-text/60">
                    <T
                        keyName="workspace.lightDesigner.effects.loading"
                        defaultValue="Loading…"
                    />
                </p>
            </div>
        );
    }

    if (!lightingSceneData || sceneId == null) {
        return (
            <div className="flex w-full flex-col gap-16 px-6">
                <p className="text-body text-text/60">
                    <T
                        keyName="workspace.lightDesigner.effects.noScene"
                        defaultValue="No lighting scene for this page."
                    />
                </p>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-16 px-6">
            <div className="flex flex-col gap-8">
                <h3 className="text-h5 text-text">
                    <T
                        keyName="workspace.lightDesigner.effects.sectionTitle"
                        defaultValue="Effects"
                    />
                </h3>
                <Button
                    type="button"
                    variant="secondary"
                    className="flex w-full items-center justify-center gap-8"
                    disabled={sceneId == null}
                    onClick={handleAddEffect}
                >
                    <PlusIcon size={18} weight="bold" aria-hidden />
                    <T
                        keyName="workspace.lightDesigner.effects.addEffect"
                        defaultValue="Add effect"
                    />
                </Button>
            </div>

            {effectIds.length === 0 ? (
                <p className="text-body text-text/60">
                    <T
                        keyName="workspace.lightDesigner.effects.empty"
                        defaultValue="No effects in this scene yet."
                    />
                </p>
            ) : (
                <ul className="flex flex-col gap-16">
                    {effectIds.map((effectId, index) => {
                        const queryResult = lightingEffectsData[index];
                        const effect = queryResult?.data;

                        if (!effect) {
                            return (
                                <li key={effectId}>
                                    <div className="rounded-6 border-stroke bg-fg-1 border p-12">
                                        <p className="text-body text-text/60">
                                            <T
                                                keyName="workspace.lightDesigner.effects.rowLoading"
                                                defaultValue="Loading effect…"
                                            />
                                        </p>
                                    </div>
                                </li>
                            );
                        }

                        return (
                            <li key={effectId}>
                                <div className="rounded-6 border-stroke bg-fg-1 flex flex-col gap-8 border p-12">
                                    <EffectItem
                                        effectId={effect.id}
                                        name={effect.name ?? ""}
                                        type={effect.type}
                                        args={effect.args}
                                        nameChangeFn={(name) =>
                                            updateEffect({
                                                id: effect.id,
                                                name,
                                            })
                                        }
                                        typeChangeFn={(newType) =>
                                            updateLightingEffectType({
                                                newType,
                                                updateFunction: (
                                                    type,
                                                    argsJson,
                                                ) =>
                                                    updateEffect({
                                                        id: effect.id,
                                                        type,
                                                        args: argsJson,
                                                    }),
                                            })
                                        }
                                        argsChangeFn={(argsJson) =>
                                            updateEffect({
                                                id: effect.id,
                                                args: argsJson,
                                            })
                                        }
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
