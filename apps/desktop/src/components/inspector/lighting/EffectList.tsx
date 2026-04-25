import EffectItem from "@/components/inspector/lighting/EffectItem";
import {
    buildLightingSceneTimeWindowsMs,
    findLightingSceneAtShowTime,
} from "@/components/timeline/SceneTimeline.utils";
import { useLightSceneManager } from "@/components/workspace/lightDesigner/useLightSceneManager";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    LightingEffectWithMarchers,
    ModifiedLightingEffectArgs,
} from "@/db-functions";
import { useTimingObjects } from "@/hooks";
import {
    createLightingEffectsMutationOptions,
    reorderLightingEffectsInSceneMutationOptions,
    updateLightingEffectsMutationOptions,
    useUpcomingLightingEffectsInSelectedPageQuery,
} from "@/hooks/queries";
import { getCurrentShowTimeMs } from "@/utilities/showTime";
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
    parseEffectArgs,
    updateLightingEffectType,
} from "@openmarch/core";
import { Button } from "@openmarch/ui";
import { DotsSixVerticalIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import { useEffect, useMemo, useState } from "react";

type EffectPlaybackState = "upcoming" | "active" | "played";
type EffectPlaybackInfo = {
    state: EffectPlaybackState;
    progressPct: number;
};

type OrderedEffectRuntime = {
    id: number;
    durationMs: number;
};

export function deriveEffectPlaybackStates(
    effects: readonly OrderedEffectRuntime[],
    tSceneMs: number | null,
): Map<number, EffectPlaybackInfo> {
    const out = new Map<number, EffectPlaybackInfo>();
    if (tSceneMs == null) {
        effects.forEach((effect) => {
            out.set(effect.id, { state: "upcoming", progressPct: 0 });
        });
        return out;
    }

    let cursorMs = 0;
    effects.forEach((effect) => {
        const startMs = cursorMs;
        const safeDurationMs = Math.max(0, effect.durationMs);
        const endMs = startMs + safeDurationMs;
        let state: EffectPlaybackState = "upcoming";
        let progressPct = 0;
        if (safeDurationMs > 0 && tSceneMs >= startMs && tSceneMs < endMs) {
            state = "active";
            progressPct = Math.min(
                100,
                Math.max(0, ((tSceneMs - startMs) / safeDurationMs) * 100),
            );
        } else if (tSceneMs >= endMs) {
            state = "played";
            progressPct = 100;
        }

        out.set(effect.id, { state, progressPct });
        cursorMs = endMs;
    });

    return out;
}

export default function EffectList() {
    const { isPlaying } = useIsPlaying()!;
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const playbackStartPageId =
        selectedPage == null
            ? undefined
            : selectedPage.id === 0
              ? selectedPage.id
              : (selectedPage.nextPageId ?? undefined);
    const { lightingSceneData, lightingEffectsData, isLoadingLightingScene } =
        useUpcomingLightingEffectsInSelectedPageQuery(playbackStartPageId);
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

    const [currentShowTimeMs, setCurrentShowTimeMs] = useState(() =>
        getCurrentShowTimeMs(isPlaying, selectedPage),
    );

    useEffect(() => {
        if (!isPlaying) {
            setCurrentShowTimeMs(getCurrentShowTimeMs(false, selectedPage));
            return;
        }
        let rafId = 0;
        const tick = () => {
            setCurrentShowTimeMs(getCurrentShowTimeMs(true, selectedPage));
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, selectedPage]);

    const effectById = useMemo(() => {
        const map = new Map<number, LightingEffectWithMarchers | undefined>();
        serverEffectIds.forEach((effectId, index) => {
            map.set(effectId, lightingEffectsData[index]?.data);
        });
        return map;
    }, [lightingEffectsData, serverEffectIds]);

    const sceneWindows = useMemo(
        () =>
            buildLightingSceneTimeWindowsMs(
                pages,
                lightingSceneData ? [lightingSceneData] : [],
            ),
        [pages, lightingSceneData],
    );
    const activeScene = useMemo(
        () => findLightingSceneAtShowTime(sceneWindows, currentShowTimeMs),
        [sceneWindows, currentShowTimeMs],
    );
    const shouldShowPlaybackState =
        activeScene?.sceneId != null &&
        lightingSceneData?.id != null &&
        activeScene.sceneId === lightingSceneData.id;

    const playbackByEffectId = useMemo(() => {
        const orderedEffects: OrderedEffectRuntime[] = localOrder
            .map((id) => {
                const effect = effectById.get(id);
                if (!effect) return null;
                return {
                    id,
                    durationMs: parseEffectArgs(effect.type, effect.args)
                        .durationMs,
                };
            })
            .filter((item): item is OrderedEffectRuntime => item != null);
        return deriveEffectPlaybackStates(
            orderedEffects,
            shouldShowPlaybackState ? activeScene!.tSceneMs : null,
        );
    }, [activeScene, effectById, localOrder, shouldShowPlaybackState]);

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
            <h3 className="text-h5 text-text">
                <T
                    keyName="workspace.lightDesigner.effects.sectionTitle"
                    defaultValue="Effects"
                />
            </h3>

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
                                    playbackInfo={playbackByEffectId.get(
                                        effectId,
                                    )}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
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
    );
}

function SortableEffectRow({
    effectId,
    effect,
    updateEffect,
    playbackInfo,
}: {
    effectId: number;
    effect: LightingEffectWithMarchers | undefined;
    updateEffect: (variables: ModifiedLightingEffectArgs) => void;
    playbackInfo?: EffectPlaybackInfo;
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
    const isPlayed = playbackInfo?.state === "played";
    const isActive = playbackInfo?.state === "active";

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
                    <div
                        className={`rounded-6 border-stroke bg-fg-1 relative overflow-clip border p-12 transition-opacity ${isPlayed ? "opacity-60" : ""}`}
                    >
                        {isPlayed && (
                            <div className="bg-accent/20 absolute top-0 left-0 z-0 h-full w-full" />
                        )}
                        {isActive && (
                            <div
                                className="bg-accent/25 absolute top-0 left-0 z-0 h-full"
                                style={{
                                    height: `${playbackInfo?.progressPct ?? 0}%`,
                                    width: "100%",
                                }}
                            />
                        )}
                        <div className="relative z-10 flex flex-col gap-8">
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
                    </div>
                )}
            </div>
        </li>
    );
}
