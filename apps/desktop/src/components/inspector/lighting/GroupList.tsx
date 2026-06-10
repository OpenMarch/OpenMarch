import { findOverlappingEffectsWithGroup } from "@/components/timeline/SceneTimeline.utils";
import GroupDropConflictDialog, {
    type GroupDropConflictState,
} from "@/components/inspector/lighting/GroupDropConflictDialog";
import GroupItem from "@/components/inspector/lighting/GroupItem";
import GroupMarcherDragBadges from "@/components/inspector/lighting/GroupMarcherDragBadges";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import type {
    DatabaseLightingGroup,
    ModifiedLightingEffectArgs,
} from "@/db-functions";
import {
    addMarchersToLightingGroupMutationOptions,
    allMarchersQueryOptions,
    createLightingGroupsMutationOptions,
    deleteLightingGroupsMutationOptions,
    lightingEffectByIdQueryOptions,
    lightingGroupMembershipsBySceneIdQueryOptions,
    lightingGroupsBySceneIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
    updateLightingEffectsBatchMutationOptions,
    updateLightingEffectsMutationOptions,
    updateLightingGroupsMutationOptions,
} from "@/hooks/queries";
import { useHighlightedMarchersStore } from "@/stores/HighlightedMarchersStore";
import { useLightDesignerGroupFocusStore } from "@/stores/LightDesignerGroupFocusStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import {
    dataTransferHasLightingGroupMarcherCollectionDrag,
    getLightingGroupMarcherCollectionDragPayload,
    partitionLightingGroupDropMarcherIds,
} from "@/utilities/lightingGroupEffectDnD";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
    TooltipClassName,
} from "@openmarch/ui";
import {
    Tooltip,
    TooltipContent,
    TooltipPortal,
    TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type DragEvent,
} from "react";

type EffectGroupOverlapPrompt = {
    groupId: number;
    targetEffectId: number;
    conflicts: { id: number; name: string }[];
};

type GroupListProps = {
    sceneId: number | undefined;
};

export default function GroupList({ sceneId }: GroupListProps) {
    const { t } = useTolgee();
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const selectedEffectId =
        sceneId != null &&
        selectedEffect != null &&
        selectedEffect.sceneId === sceneId
            ? selectedEffect.effectId
            : null;
    const showEffectAssignmentControls = selectedEffectId != null;

    const { data: groups = [], isLoading } = useQuery({
        ...lightingGroupsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });
    const { data: memberships } = useQuery({
        ...lightingGroupMembershipsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });
    const { data: allMarchers = [] } = useQuery(allMarchersQueryOptions());
    const { setSelectedMarchers } = useSelectedMarchers()!;

    const selectMarchersInGroup = useCallback(
        (marcherIds: readonly number[]) => {
            const idSet = new Set(marcherIds);
            setSelectedMarchers(
                allMarchers.filter((marcher) => idSet.has(marcher.id)),
            );
        },
        [allMarchers, setSelectedMarchers],
    );

    const toggleGroupFocus =
        useLightDesignerGroupFocusStore.use.toggleGroupFocus();
    const setGroupFocus = useLightDesignerGroupFocusStore.use.setGroupFocus();
    const clearGroupFocus =
        useLightDesignerGroupFocusStore.use.clearGroupFocus();
    const clearHighlightedMarchers =
        useHighlightedMarchersStore.use.clearHighlightedMarchers();
    const setHighlightedMarcherIds =
        useHighlightedMarchersStore.use.setHighlightedMarcherIds();
    const groupFocus = useLightDesignerGroupFocusStore.use.groupFocus();

    const { mutate: createGroupsMutate } = useMutation(
        createLightingGroupsMutationOptions(),
    );
    const { mutate: addMarchersMutate } = useMutation(
        addMarchersToLightingGroupMutationOptions(),
    );
    const { mutate: deleteGroupMutate } = useMutation(
        deleteLightingGroupsMutationOptions(),
    );
    const { mutate: updateGroupMutate } = useMutation(
        updateLightingGroupsMutationOptions(),
    );
    const { mutate: updateEffect } = useMutation(
        updateLightingEffectsMutationOptions(),
    );
    const { mutate: updateEffectsBatch } = useMutation(
        updateLightingEffectsBatchMutationOptions(),
    );

    const { data: selectedEffectData } = useQuery({
        ...lightingEffectByIdQueryOptions(selectedEffectId ?? -1),
        enabled: selectedEffectId != null,
    });

    const selectedEffectGroupIds = useMemo(
        () => new Set(selectedEffectData?.lighting_group_ids ?? []),
        [selectedEffectData?.lighting_group_ids],
    );

    const { data: sceneData } = useQuery({
        ...lightingSceneDataByIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null && selectedEffectId != null,
    });
    const sceneEffectIds = useMemo(
        () => sceneData?.lightingEffectIds ?? [],
        [sceneData?.lightingEffectIds],
    );
    const sceneEffectQueries = useQueries({
        queries: sceneEffectIds.map((id) => ({
            ...lightingEffectByIdQueryOptions(id),
            enabled: selectedEffectId != null,
        })),
    });
    const sceneEffects = (() => {
        const out = [];
        for (const q of sceneEffectQueries) {
            if (q.data) out.push(q.data);
        }
        return out;
    })();

    const [dropConflictState, setDropConflictState] =
        useState<GroupDropConflictState | null>(null);
    const [overlapPrompt, setOverlapPrompt] =
        useState<EffectGroupOverlapPrompt | null>(null);

    const addMarchersToGroup = useCallback(
        (groupId: number, marcherIds: readonly number[]) => {
            const uniqueIds = [...new Set(marcherIds)];
            if (uniqueIds.length === 0) return;
            addMarchersMutate({ groupId, marcherIds: uniqueIds });
        },
        [addMarchersMutate],
    );

    useEffect(() => {
        clearGroupFocus();
        clearHighlightedMarchers();
    }, [sceneId, clearGroupFocus, clearHighlightedMarchers]);

    useEffect(() => {
        if (sceneId == null) return;
        const gf = useLightDesignerGroupFocusStore.getState().groupFocus;
        if (gf == null || gf.sceneId !== sceneId) return;
        const surviving = gf.groupIds.filter((id) =>
            groups.some((g) => g.id === id),
        );
        if (surviving.length === gf.groupIds.length) return;
        if (surviving.length === 0) {
            clearGroupFocus();
            return;
        }
        setGroupFocus({ sceneId, groupIds: surviving });
    }, [groups, sceneId, clearGroupFocus, setGroupFocus]);

    const handleDropCollectionOnGroup = useCallback(
        (targetGroupId: number, payloadMarcherIds: number[]) => {
            const partitions = partitionLightingGroupDropMarcherIds({
                draggedMarcherIds: payloadMarcherIds,
                targetGroupId,
                membershipsByGroupId: memberships,
            });
            const allToMove = [
                ...partitions.unassigned,
                ...partitions.inOtherGroups,
            ];

            if (allToMove.length === 0) return;
            if (partitions.inOtherGroups.length === 0) {
                addMarchersToGroup(targetGroupId, partitions.unassigned);
                return;
            }
            setDropConflictState({
                targetGroupId,
                allToMove,
                unassignedToMove: partitions.unassigned,
            });
        },
        [addMarchersToGroup, memberships],
    );

    const handleCreateGroup = () => {
        if (sceneId == null) return;
        createGroupsMutate([
            {
                scene_id: sceneId,
                name: `Group ${groups.length + 1}`,
                marcher_ids: [],
            },
        ]);
    };

    const effectNameFallback =
        t("workspace.lightDesigner.effects.unnamedFallback") ??
        "Lighting effect";

    const addGroupToSelectedEffect = useCallback(
        (groupId: number) => {
            if (selectedEffectId == null || selectedEffectData == null) return;
            if (selectedEffectData.lighting_group_ids.includes(groupId)) {
                return;
            }

            const conflicts = findOverlappingEffectsWithGroup({
                effects: sceneEffects,
                targetEffectId: selectedEffectId,
                groupId,
                effectNameFallback,
            });

            if (conflicts.length === 0) {
                updateEffect({
                    id: selectedEffectId,
                    lighting_group_ids: [
                        ...new Set([
                            ...selectedEffectData.lighting_group_ids,
                            groupId,
                        ]),
                    ],
                });
                return;
            }

            setOverlapPrompt({
                groupId,
                targetEffectId: selectedEffectId,
                conflicts,
            });
        },
        [
            effectNameFallback,
            sceneEffects,
            selectedEffectData,
            selectedEffectId,
            updateEffect,
        ],
    );

    const removeGroupFromSelectedEffect = useCallback(
        (groupId: number) => {
            if (selectedEffectId == null || selectedEffectData == null) return;
            updateEffect({
                id: selectedEffectId,
                lighting_group_ids:
                    selectedEffectData.lighting_group_ids.filter(
                        (id) => id !== groupId,
                    ),
            });
        },
        [selectedEffectData, selectedEffectId, updateEffect],
    );

    const confirmOverlapAndMoveGroup = useCallback(() => {
        const prompt = overlapPrompt;
        if (prompt == null) return;
        const target = sceneEffects.find((e) => e.id === prompt.targetEffectId);
        if (!target) {
            setOverlapPrompt(null);
            return;
        }
        const updates: ModifiedLightingEffectArgs[] = [];
        for (const c of prompt.conflicts) {
            const e = sceneEffects.find((x) => x.id === c.id);
            if (!e) continue;
            updates.push({
                id: e.id,
                lighting_group_ids: e.lighting_group_ids.filter(
                    (g) => g !== prompt.groupId,
                ),
            });
        }
        updates.push({
            id: target.id,
            lighting_group_ids: [
                ...new Set([...target.lighting_group_ids, prompt.groupId]),
            ],
        });
        updateEffectsBatch(updates);
        setOverlapPrompt(null);
    }, [overlapPrompt, sceneEffects, updateEffectsBatch]);

    if (sceneId == null) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.noScene"
                    defaultValue="No lighting scene for this page."
                />
            </p>
        );
    }

    if (isLoading) {
        return (
            <p className="text-body text-text/60">
                <T
                    keyName="workspace.lightDesigner.effects.loading"
                    defaultValue="Loading…"
                />
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-12">
            <GroupMarcherDragBadges />

            {showEffectAssignmentControls && sceneEffectIds.length > 0 ? (
                <p className="text-text-subtitle text-xs">
                    <T
                        keyName="inspector.light.groups.clickGroupToToggleEffect"
                        defaultValue="Click on a group to add or remove it from the selected effect"
                    />
                </p>
            ) : null}

            {groups.length === 0 ? (
                <p className="text-body text-text/60">
                    <T
                        keyName="inspector.light.groups.empty"
                        defaultValue="Create a group to target effects on marchers."
                    />
                </p>
            ) : (
                <ul className="flex flex-col gap-8">
                    {groups.map((group) => (
                        <GroupDropRow
                            key={group.id}
                            group={group}
                            memberCount={memberships?.get(group.id)?.size ?? 0}
                            memberMarcherIds={[
                                ...(memberships?.get(group.id) ?? []),
                            ]}
                            onSelectMarchersInGroup={selectMarchersInGroup}
                            isFocused={
                                groupFocus?.sceneId === sceneId &&
                                groupFocus.groupIds.includes(group.id)
                            }
                            showFocusControls={!showEffectAssignmentControls}
                            showEffectAssignmentControls={
                                showEffectAssignmentControls
                            }
                            isInSelectedEffect={selectedEffectGroupIds.has(
                                group.id,
                            )}
                            onToggleFocus={() =>
                                toggleGroupFocus({
                                    groupId: group.id,
                                    sceneId,
                                })
                            }
                            onAddToSelectedEffect={() =>
                                addGroupToSelectedEffect(group.id)
                            }
                            onRemoveFromSelectedEffect={() =>
                                removeGroupFromSelectedEffect(group.id)
                            }
                            onDropCollection={handleDropCollectionOnGroup}
                            onNameChange={(name) =>
                                updateGroupMutate([{ id: group.id, name }])
                            }
                            onDelete={() =>
                                deleteGroupMutate(new Set([group.id]))
                            }
                            setHighlightedMarcherIds={setHighlightedMarcherIds}
                        />
                    ))}
                </ul>
            )}

            <Button
                type="button"
                variant="secondary"
                size="compact"
                className="shrink-0 gap-6 self-start"
                onClick={handleCreateGroup}
            >
                <PlusIcon size={18} aria-hidden />
                <T
                    keyName="inspector.light.groups.newGroup"
                    defaultValue="New group"
                />
            </Button>

            <GroupDropConflictDialog
                conflict={dropConflictState}
                onClose={() => setDropConflictState(null)}
                onMoveAll={() => {
                    if (!dropConflictState) return;
                    addMarchersToGroup(
                        dropConflictState.targetGroupId,
                        dropConflictState.allToMove,
                    );
                    setDropConflictState(null);
                }}
                onMoveUnassignedOnly={() => {
                    if (!dropConflictState) return;
                    addMarchersToGroup(
                        dropConflictState.targetGroupId,
                        dropConflictState.unassignedToMove,
                    );
                    setDropConflictState(null);
                }}
            />

            <AlertDialog
                open={overlapPrompt != null}
                onOpenChange={(open) => {
                    if (!open) setOverlapPrompt(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        <T
                            keyName="workspace.lightDesigner.effects.groupOverlapConfirmTitle"
                            defaultValue="Group already affects an overlapping effect"
                        />
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <p>
                            <T
                                keyName="workspace.lightDesigner.effects.groupOverlapConfirmDescription"
                                defaultValue="Overlapping timing windows cannot reuse the same group. Remove this group from the conflicting effect(s) below and assign it here instead?"
                            />
                        </p>
                        {overlapPrompt != null &&
                        overlapPrompt.conflicts.length > 0 ? (
                            <ul className="border-stroke mt-16 list-inside list-disc border-t pt-16 text-[0.9375rem]">
                                {overlapPrompt.conflicts.map((c) => (
                                    <li key={c.id}>{c.name}</li>
                                ))}
                            </ul>
                        ) : null}
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8 pt-16">
                        <AlertDialogCancel>
                            <Button variant="secondary" size="compact">
                                <T
                                    keyName="workspace.lightDesigner.effects.groupOverlapCancel"
                                    defaultValue="Cancel"
                                />
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="primary"
                                size="compact"
                                onClick={() => confirmOverlapAndMoveGroup()}
                            >
                                <T
                                    keyName="workspace.lightDesigner.effects.groupOverlapConfirm"
                                    defaultValue="Move group"
                                />
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function GroupDropRow({
    group,
    memberCount,
    memberMarcherIds,
    onSelectMarchersInGroup,
    isFocused,
    showFocusControls,
    showEffectAssignmentControls,
    isInSelectedEffect,
    onToggleFocus,
    onAddToSelectedEffect,
    onRemoveFromSelectedEffect,
    onDropCollection,
    onNameChange,
    onDelete,
    setHighlightedMarcherIds,
}: {
    group: DatabaseLightingGroup;
    memberCount: number;
    memberMarcherIds: readonly number[];
    onSelectMarchersInGroup: (marcherIds: readonly number[]) => void;
    isFocused: boolean;
    showFocusControls: boolean;
    showEffectAssignmentControls: boolean;
    isInSelectedEffect: boolean;
    onToggleFocus: () => void;
    onAddToSelectedEffect: () => void;
    onRemoveFromSelectedEffect: () => void;
    onDropCollection: (targetGroupId: number, marcherIds: number[]) => void;
    onNameChange: (name: string | null) => void;
    onDelete: () => void;
    setHighlightedMarcherIds: (ids: Iterable<number> | null) => void;
}) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: DragEvent<HTMLLIElement>) => {
        if (!dataTransferHasLightingGroupMarcherCollectionDrag(e.dataTransfer))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: DragEvent<HTMLLIElement>) => {
        setIsDragOver(false);
        const payload = getLightingGroupMarcherCollectionDragPayload(
            e.dataTransfer,
        );
        if (!payload) return;
        e.preventDefault();
        onDropCollection(group.id, payload.marcherIds);
    };

    const handleRowClick = () => {
        if (!showEffectAssignmentControls) return;
        if (isInSelectedEffect) onRemoveFromSelectedEffect();
        else onAddToSelectedEffect();
    };

    const row = (
        <li
            className={clsx(
                "rounded-6 border-stroke bg-fg-1 relative flex flex-col overflow-clip border p-12",
                isDragOver && "ring-accent/70 ring-2 ring-inset",
                showEffectAssignmentControls && "cursor-pointer",
                isInSelectedEffect && "ring-accent ring-1 ring-inset",
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleRowClick}
            onMouseEnter={() => setHighlightedMarcherIds(memberMarcherIds)}
            onMouseLeave={() => setHighlightedMarcherIds(null)}
        >
            {isFocused ? (
                <div className="bg-accent/10 ring-accent pointer-events-none absolute inset-0 z-0 ring-1 ring-inset" />
            ) : null}
            {isInSelectedEffect ? (
                <div className="bg-accent/10 pointer-events-none absolute inset-0 z-0" />
            ) : null}
            <div className="relative z-10">
                <GroupItem
                    groupId={group.id}
                    groupNickname={group.name}
                    numberOfMarchers={memberCount}
                    isFocused={isFocused}
                    showFocusControls={showFocusControls}
                    showEffectAssignmentControls={showEffectAssignmentControls}
                    onNameChange={onNameChange}
                    onDelete={onDelete}
                    onToggleFocus={onToggleFocus}
                    onSelectMarchersInGroup={() =>
                        onSelectMarchersInGroup(memberMarcherIds)
                    }
                />
            </div>
        </li>
    );

    if (!showEffectAssignmentControls) return row;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{row}</TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    side="bottom"
                    align="start"
                    className={clsx(TooltipClassName, "p-16")}
                >
                    {isInSelectedEffect ? (
                        <T
                            keyName="inspector.light.groups.removeFromSelectedEffect"
                            defaultValue="Remove from selected effect"
                        />
                    ) : (
                        <T
                            keyName="inspector.light.groups.addToSelectedEffect"
                            defaultValue="Add to selected effect"
                        />
                    )}
                </TooltipContent>
            </TooltipPortal>
        </Tooltip>
    );
}
