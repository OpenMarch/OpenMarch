import EffectItem from "@/components/inspector/lighting/EffectItem";
import { useLightSceneManager } from "@/components/workspace/lightDesigner/useLightSceneManager";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    LightingEffectWithMarchers,
    ModifiedLightingEffectArgs,
} from "@/db-functions";
import {
    createLightingEffectsMutationOptions,
    reorderLightingEffectsInSceneMutationOptions,
    updateLightingEffectsMutationOptions,
    useUpcomingLightingEffectsInSelectedPageQuery,
} from "@/hooks/queries";
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    createNewLightingEffect,
    updateLightingEffectType,
} from "@openmarch/core";
import { Button } from "@openmarch/ui";
import { DotsSixVerticalIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import { useEffect, useMemo, useState } from "react";

export default function EffectList() {
    const { selectedPage } = useSelectedPage()!;
    const { lightingSceneData, lightingEffectsData, isLoadingLightingScene } =
        useUpcomingLightingEffectsInSelectedPageQuery(selectedPage?.id);
    useLightSceneManager();

    const { mutate: createEffectsMutation } = useMutation(
        createLightingEffectsMutationOptions(),
    );
    const { mutate: updateEffect } = useMutation(
        updateLightingEffectsMutationOptions(),
    );
    const { mutate: reorderEffects } = useMutation(
        reorderLightingEffectsInSceneMutationOptions(),
    );

    const sceneId = lightingSceneData?.id;
    const serverEffectIds = useMemo(
        () => lightingSceneData?.lightingEffectIds ?? [],
        [lightingSceneData?.lightingEffectIds],
    );
    const [localOrder, setLocalOrder] = useState<number[]>(serverEffectIds);
    const sensors = useSensors(useSensor(PointerSensor));

    useEffect(() => {
        setLocalOrder(serverEffectIds);
    }, [serverEffectIds]);

    const effectById = useMemo(() => {
        const map = new Map<number, LightingEffectWithMarchers | undefined>();
        serverEffectIds.forEach((effectId, index) => {
            map.set(effectId, lightingEffectsData[index]?.data);
        });
        return map;
    }, [lightingEffectsData, serverEffectIds]);

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

    const handleDragEnd = (event: DragEndEvent) => {
        if (sceneId == null) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = localOrder.findIndex((id) => id === active.id);
        const newIndex = localOrder.findIndex((id) => id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(localOrder, oldIndex, newIndex);
        setLocalOrder(reordered);
        reorderEffects({ sceneId, effectIdsInOrder: reordered });
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

            {localOrder.length === 0 ? (
                <p className="text-body text-text/60">
                    <T
                        keyName="workspace.lightDesigner.effects.empty"
                        defaultValue="No effects in this scene yet."
                    />
                </p>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={localOrder}
                        strategy={verticalListSortingStrategy}
                    >
                        <ul className="flex flex-col gap-16">
                            {localOrder.map((effectId) => (
                                <SortableEffectRow
                                    key={effectId}
                                    effectId={effectId}
                                    effect={effectById.get(effectId)}
                                    updateEffect={updateEffect}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}

function SortableEffectRow({
    effectId,
    effect,
    updateEffect,
}: {
    effectId: number;
    effect: LightingEffectWithMarchers | undefined;
    updateEffect: (variables: ModifiedLightingEffectArgs) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: effectId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-start gap-4 ${isDragging ? "z-50 opacity-90" : ""}`}
        >
            <button
                {...attributes}
                {...listeners}
                className="hover:text-accent mt-8 cursor-grab active:cursor-grabbing"
                aria-label="Drag to reorder"
            >
                <DotsSixVerticalIcon size={16} weight="bold" />
            </button>
            <div className="flex-1">
                {!effect ? (
                    <div className="rounded-6 border-stroke bg-fg-1 border p-12">
                        <p className="text-body text-text/60">
                            <T
                                keyName="workspace.lightDesigner.effects.rowLoading"
                                defaultValue="Loading effect…"
                            />
                        </p>
                    </div>
                ) : (
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
                                    updateFunction: (type, argsJson) =>
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
                )}
            </div>
        </li>
    );
}
