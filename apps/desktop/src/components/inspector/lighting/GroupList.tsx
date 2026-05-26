import GroupDropConflictDialog, {
    type GroupDropConflictState,
} from "@/components/inspector/lighting/GroupDropConflictDialog";
import GroupItem from "@/components/inspector/lighting/GroupItem";
import GroupMarcherDragBadges from "@/components/inspector/lighting/GroupMarcherDragBadges";
import type { DatabaseLightingGroup } from "@/db-functions";
import {
    addMarchersToLightingGroupMutationOptions,
    createLightingGroupsMutationOptions,
    deleteLightingGroupsMutationOptions,
    lightingGroupMembershipsBySceneIdQueryOptions,
    lightingGroupsBySceneIdQueryOptions,
    updateLightingGroupsMutationOptions,
} from "@/hooks/queries";
import { useLightDesignerGroupFocusStore } from "@/stores/LightDesignerGroupFocusStore";
import {
    dataTransferHasLightingGroupMarcherCollectionDrag,
    getLightingGroupMarcherCollectionDragPayload,
    partitionLightingGroupDropMarcherIds,
    setLightingGroupDragData,
    shouldCancelLightingGroupDragStart,
} from "@/utilities/lightingGroupEffectDnD";
import { Button } from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import clsx from "clsx";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type DragEvent,
} from "react";

type GroupListProps = {
    sceneId: number | undefined;
};

export default function GroupList({ sceneId }: GroupListProps) {
    const { data: groups = [], isLoading } = useQuery({
        ...lightingGroupsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });
    const { data: memberships } = useQuery({
        ...lightingGroupMembershipsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });

    const toggleGroupFocus =
        useLightDesignerGroupFocusStore.use.toggleGroupFocus();
    const clearGroupFocus =
        useLightDesignerGroupFocusStore.use.clearGroupFocus();
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

    const [dropConflictState, setDropConflictState] =
        useState<GroupDropConflictState | null>(null);

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
    }, [sceneId, clearGroupFocus]);

    useEffect(() => {
        if (sceneId == null) return;
        const gf = useLightDesignerGroupFocusStore.getState().groupFocus;
        if (gf == null || gf.sceneId !== sceneId) return;
        if (groups.some((g) => g.id === gf.groupId)) return;
        clearGroupFocus();
    }, [groups, sceneId, clearGroupFocus]);

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
                            isFocused={groupFocus?.groupId === group.id}
                            onToggleFocus={() =>
                                toggleGroupFocus({
                                    groupId: group.id,
                                    sceneId,
                                })
                            }
                            onDropCollection={handleDropCollectionOnGroup}
                            onNameChange={(name) =>
                                updateGroupMutate([{ id: group.id, name }])
                            }
                            onDelete={() =>
                                deleteGroupMutate(new Set([group.id]))
                            }
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
        </div>
    );
}

function GroupDropRow({
    group,
    memberCount,
    isFocused,
    onToggleFocus,
    onDropCollection,
    onNameChange,
    onDelete,
}: {
    group: DatabaseLightingGroup;
    memberCount: number;
    isFocused: boolean;
    onToggleFocus: () => void;
    onDropCollection: (targetGroupId: number, marcherIds: number[]) => void;
    onNameChange: (name: string | null) => void;
    onDelete: () => void;
}) {
    const rowRef = useRef<HTMLLIElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleRowDragStart = useCallback(
        (e: DragEvent<HTMLLIElement>) => {
            if (shouldCancelLightingGroupDragStart(e.target)) {
                e.preventDefault();
                return;
            }
            setLightingGroupDragData(e.dataTransfer, {
                groupId: group.id,
                sceneId: group.scene_id,
            });
            const el = rowRef.current;
            if (el) {
                const r = el.getBoundingClientRect();
                e.dataTransfer.setDragImage(
                    el,
                    e.clientX - r.left,
                    e.clientY - r.top,
                );
            }
            setIsDragging(true);
        },
        [group.id, group.scene_id],
    );

    const handleRowDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

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

    return (
        <li
            ref={rowRef}
            draggable
            tabIndex={0}
            className={clsx(
                "rounded-6 border-stroke bg-fg-1 relative flex cursor-grab flex-col overflow-clip border p-12 active:cursor-grabbing",
                isDragging && "opacity-40",
                isDragOver && "ring-accent/70 ring-2 ring-inset",
            )}
            onDragStart={handleRowDragStart}
            onDragEnd={handleRowDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <span className="sr-only">
                <T
                    keyName="inspector.light.groups.dragToTimelineAria"
                    defaultValue="Drag to assign group to an effect bar on the timeline"
                />
            </span>
            {isFocused ? (
                <div className="bg-accent/10 ring-accent pointer-events-none absolute inset-0 z-0 ring-1 ring-inset" />
            ) : null}
            <div className="relative z-10">
                <GroupItem
                    groupId={group.id}
                    groupNickname={group.name}
                    numberOfMarchers={memberCount}
                    isFocused={isFocused}
                    onNameChange={onNameChange}
                    onDelete={onDelete}
                    onToggleFocus={onToggleFocus}
                />
            </div>
        </li>
    );
}
