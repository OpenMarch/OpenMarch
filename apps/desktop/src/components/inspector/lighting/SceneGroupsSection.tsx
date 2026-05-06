import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Badge,
    Button,
} from "@openmarch/ui";
import { CaretDownIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import type { DatabaseLightingGroup } from "@/db-functions";
import {
    addMarchersToLightingGroupMutationOptions,
    allTagsQueryOptions,
    allMarchersQueryOptions,
    createLightingGroupsMutationOptions,
    deleteLightingGroupsMutationOptions,
    lightingGroupMembershipsBySceneIdQueryOptions,
    lightingGroupsBySceneIdQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
} from "@/hooks/queries";
import { useLightDesignerGroupFocusStore } from "@/stores/LightDesignerGroupFocusStore";
import {
    dataTransferHasLightingGroupMarcherCollectionDrag,
    getLightingGroupMarcherCollectionDragPayload,
    partitionLightingGroupDropMarcherIds,
    setLightingGroupMarcherCollectionDragData,
    setLightingGroupDragData,
    shouldCancelLightingGroupDragStart,
} from "@/utilities/lightingGroupEffectDnD";
import {
    getFamiliesInShow,
    getMarcherIdsByFamily,
    getMarcherIdsBySectionName,
    sectionsFromMarchers,
} from "@/utilities/lightingGroupMarcherSelection";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type DragEvent,
    type MouseEvent,
    type ReactNode,
} from "react";

/** Groups for the inspector's current upcoming lighting scene. */
export default function SceneGroupsSection({
    sceneId,
}: {
    sceneId: number | undefined;
}) {
    const { t } = useTolgee();
    const { selectedMarchers } = useSelectedMarchers()!;
    const { data: groups = [] } = useQuery({
        ...lightingGroupsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });

    const { data: memberships } = useQuery({
        ...lightingGroupMembershipsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });

    const { data: marchers = [] } = useQuery(allMarchersQueryOptions());
    const { data: tags = [] } = useQuery(allTagsQueryOptions());
    const { data: marcherIdsByTagIdMap } = useQuery(
        marcherIdsForAllTagIdsQueryOptions(),
    );

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

    const [dropConflictState, setDropConflictState] = useState<{
        targetGroupId: number;
        allToMove: number[];
        unassignedToMove: number[];
    } | null>(null);

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
            <p className="text-body text-text/50 px-6 pt-4">
                <T
                    defaultValue="No lighting scene for this page."
                    keyName="workspace.lightDesigner.effects.noScene"
                />
            </p>
        );
    }

    const selectedIds = selectedMarchers.map((marcher) => marcher.id);
    const sections = sectionsFromMarchers(marchers);
    const families = getFamiliesInShow();

    const tagBadgeItems = tags
        .map((tag) => ({
            id: tag.id,
            label:
                tag.name?.trim().length && tag.name.trim().length > 0
                    ? tag.name
                    : `tag-${tag.id}`,
            marcherIds: marcherIdsByTagIdMap?.get(tag.id) ?? [],
        }))
        .filter((tag) => tag.marcherIds.length > 0);

    const handleDropCollectionOnGroup = (
        targetGroupId: number,
        payloadMarcherIds: number[],
    ) => {
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
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-col gap-8 px-6">
            <div className="flex flex-wrap gap-8">
                {selectedIds.length > 0 ? (
                    <MarcherCollectionDragBadge
                        sourceType="selection"
                        label={t("inspector.light.groups.addSelection", {
                            defaultValue: "Current Selection",
                        })}
                        marcherIds={selectedIds}
                        variant="primary"
                    >
                        <T
                            keyName="inspector.light.groups.currentSelectionCount"
                            defaultValue="Current Selection ({count})"
                            params={{ count: selectedIds.length }}
                        />
                    </MarcherCollectionDragBadge>
                ) : null}

                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.section"
                            defaultValue="Section"
                        />
                    }
                    items={sections.map((sec) => ({
                        key: sec.name,
                        label: <T keyName={sec.tName} />,
                        marcherIds: getMarcherIdsBySectionName(
                            marchers,
                            sec.name,
                        ),
                        sourceType: "section" as const,
                    }))}
                />

                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.tag"
                            defaultValue="Tag"
                        />
                    }
                    items={tagBadgeItems.map((tag) => ({
                        key: String(tag.id),
                        label: tag.label,
                        marcherIds: tag.marcherIds,
                        sourceType: "tag" as const,
                    }))}
                />

                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.family"
                            defaultValue="Family"
                        />
                    }
                    items={families.map((fam) => ({
                        key: fam.name,
                        label: <T keyName={fam.tName} />,
                        marcherIds: getMarcherIdsByFamily(marchers, fam),
                        sourceType: "family" as const,
                    }))}
                />
            </div>
            <ul className="flex min-h-0 flex-col gap-16 overflow-y-auto pr-4">
                {groups.map((group) => (
                    <LightingGroupRow
                        key={group.id}
                        group={group}
                        memberships={memberships}
                        isFocused={groupFocus?.groupId === group.id}
                        onToggleFocus={() =>
                            toggleGroupFocus({ groupId: group.id, sceneId })
                        }
                        onDropCollection={handleDropCollectionOnGroup}
                    />
                ))}
                {groups.length === 0 ? (
                    <li className="text-body text-text/50 px-4 py-8">
                        <T
                            defaultValue="Create a group to target effects on marchers."
                            keyName="inspector.light.groups.empty"
                        />
                    </li>
                ) : null}
            </ul>
            <Button
                type="button"
                variant="secondary"
                size="compact"
                className="shrink-0 gap-6"
                onClick={handleCreateGroup}
            >
                <PlusIcon size={18} aria-hidden />
                <T
                    defaultValue="New group"
                    keyName="inspector.light.groups.newGroup"
                />
            </Button>
            <AlertDialog
                open={dropConflictState != null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) setDropConflictState(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        <T
                            keyName="inspector.light.groups.moveConflictTitle"
                            defaultValue="Some marchers are already in another group"
                        />
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <T
                            keyName="inspector.light.groups.moveConflictDescription"
                            defaultValue="Choose how to assign the dragged marchers."
                        />
                    </AlertDialogDescription>
                    <div className="flex flex-wrap justify-end gap-8 pt-16">
                        <AlertDialogCancel asChild>
                            <Button variant="secondary" size="compact">
                                <T
                                    keyName="inspector.light.groups.cancel"
                                    defaultValue="Cancel"
                                />
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="secondary"
                                size="compact"
                                className="whitespace-nowrap"
                                onClick={() => {
                                    if (!dropConflictState) return;
                                    addMarchersToGroup(
                                        dropConflictState.targetGroupId,
                                        dropConflictState.unassignedToMove,
                                    );
                                    setDropConflictState(null);
                                }}
                            >
                                <T
                                    keyName="inspector.light.groups.moveUnassignedOnly"
                                    defaultValue="Move only unassigned marchers"
                                />
                            </Button>
                        </AlertDialogAction>
                        <AlertDialogAction>
                            <Button
                                variant="red"
                                size="compact"
                                className="whitespace-nowrap"
                                onClick={() => {
                                    if (!dropConflictState) return;
                                    addMarchersToGroup(
                                        dropConflictState.targetGroupId,
                                        dropConflictState.allToMove,
                                    );
                                    setDropConflictState(null);
                                }}
                            >
                                <T
                                    keyName="inspector.light.groups.moveAllToThisGroup"
                                    defaultValue="Move all marchers to this group"
                                />
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function LightingGroupRow({
    group,
    memberships,
    isFocused,
    onToggleFocus,
    onDropCollection,
}: {
    group: DatabaseLightingGroup;
    memberships: Map<number, Set<number>> | undefined;
    isFocused: boolean;
    onToggleFocus: () => void;
    onDropCollection: (targetGroupId: number, marcherIds: number[]) => void;
}) {
    const { t } = useTolgee();
    const memberSet = memberships?.get(group.id) ?? new Set<number>();
    const { mutate: deleteGroupMutate } = useMutation(
        deleteLightingGroupsMutationOptions(),
    );

    const displayName =
        group.name?.trim() ?? t("inspector.light.groups.groupFallback");

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
                "rounded-6 border-stroke bg-fg-1 relative flex cursor-grab flex-col gap-8 overflow-clip border p-12 active:cursor-grabbing",
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
            <div className="relative z-10 flex w-full min-w-0 flex-col gap-8">
                <div className="flex w-full min-w-0 items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-h5 text-text truncate">
                            {displayName}
                        </span>
                        <span className="text-sub text-text/60 leading-tight">
                            <T
                                keyName="inspector.light.groups.memberCount"
                                params={{
                                    count: memberSet.size,
                                }}
                                defaultValue="{count} marchers"
                            />
                        </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-start gap-8">
                        <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            aria-pressed={isFocused}
                            onClick={onToggleFocus}
                        >
                            {isFocused ? (
                                <T
                                    defaultValue="Clear focus"
                                    keyName="inspector.light.groups.clearFocus"
                                />
                            ) : (
                                <T
                                    defaultValue="Focus on canvas"
                                    keyName="inspector.light.groups.focusCanvas"
                                />
                            )}
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    content="icon"
                                    size="compact"
                                    className="rounded-6"
                                    aria-label={t(
                                        "inspector.light.groups.deleteAria",
                                    )}
                                >
                                    <TrashIcon aria-hidden />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogTitle>
                                    <T
                                        keyName="inspector.light.groups.deleteTitle"
                                        defaultValue="Delete this group?"
                                    />
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    <T
                                        keyName="inspector.light.groups.deleteDescription"
                                        defaultValue="This group may be referenced by lighting effects. Those links will be removed."
                                    />
                                </AlertDialogDescription>
                                <div className="flex justify-end gap-8 pt-16">
                                    <AlertDialogCancel>
                                        <Button
                                            variant="secondary"
                                            size="compact"
                                        >
                                            <T
                                                keyName="inspector.light.groups.cancel"
                                                defaultValue="Cancel"
                                            />
                                        </Button>
                                    </AlertDialogCancel>
                                    <AlertDialogAction>
                                        <Button
                                            variant="red"
                                            size="compact"
                                            onClick={() =>
                                                deleteGroupMutate(
                                                    new Set([group.id]),
                                                )
                                            }
                                        >
                                            <T
                                                keyName="inspector.light.groups.deleteConfirm"
                                                defaultValue="Delete"
                                            />
                                        </Button>
                                    </AlertDialogAction>
                                </div>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>
        </li>
    );
}

function MarcherCollectionDragBadge({
    sourceType,
    label,
    marcherIds,
    variant,
    children,
    className,
    onMouseDown,
    onDragStart,
}: {
    sourceType: "selection" | "section" | "tag" | "family";
    label: string;
    marcherIds: number[];
    variant: "primary" | "secondary";
    children: ReactNode;
    className?: string;
    onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
    onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
}) {
    const handleDragStartInternal = (e: DragEvent<HTMLButtonElement>) => {
        setLightingGroupMarcherCollectionDragData(e.dataTransfer, {
            sourceType,
            label,
            marcherIds,
        });
        onDragStart?.(e);
    };

    return (
        <button
            type="button"
            className={clsx("cursor-grab active:cursor-grabbing", className)}
            draggable={marcherIds.length > 0}
            onDragStart={handleDragStartInternal}
            onMouseDown={onMouseDown}
            aria-label={label}
        >
            <Badge variant={variant} className="py-4">
                {children}
            </Badge>
        </button>
    );
}

function CollectionDropdownBadge({
    label,
    items,
}: {
    label: ReactNode;
    items: Array<{
        key: string;
        label: ReactNode;
        marcherIds: number[];
        sourceType: "selection" | "section" | "tag" | "family";
    }>;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dropdown.Root open={open} onOpenChange={setOpen}>
            <Dropdown.Trigger asChild>
                <button type="button">
                    <Badge variant="secondary" className="gap-6 py-4">
                        {label}
                        <CaretDownIcon size={14} aria-hidden />
                    </Badge>
                </button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
                <Dropdown.Content
                    collisionPadding={8}
                    className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[52] inline-block max-h-[min(40vh,var(--radix-dropdown-menu-content-available-height))] min-w-max overflow-y-auto border p-8 shadow-xl"
                >
                    {items.map((item) => (
                        <Dropdown.Item
                            key={item.key}
                            asChild
                            onSelect={(e) => e.preventDefault()}
                        >
                            <MarcherCollectionDragBadge
                                sourceType={item.sourceType}
                                label={
                                    typeof item.label === "string"
                                        ? item.label
                                        : `${item.sourceType}-${item.key}`
                                }
                                marcherIds={item.marcherIds}
                                variant="secondary"
                                className="text-text hover:bg-overlay rounded-8 w-full px-8 py-4 text-left outline-hidden"
                                onMouseDown={(e) => e.stopPropagation()}
                                onDragStart={() => {
                                    // Close after drag init so unmounting the menu doesn't cancel drag.
                                    window.setTimeout(() => setOpen(false), 0);
                                }}
                            >
                                {item.label}
                            </MarcherCollectionDragBadge>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Content>
            </Dropdown.Portal>
        </Dropdown.Root>
    );
}
