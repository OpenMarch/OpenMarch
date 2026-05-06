import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
} from "@openmarch/ui";
import {
    CaretDownIcon,
    CaretRightIcon,
    PlusIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import type { DatabaseLightingGroup } from "@/db-functions";
import type Marcher from "@/global/classes/Marcher";
import {
    addMarchersToLightingGroupMutationOptions,
    allMarchersQueryOptions,
    createLightingGroupsMutationOptions,
    deleteLightingGroupsMutationOptions,
    lightingGroupMembershipsBySceneIdQueryOptions,
    lightingGroupsBySceneIdQueryOptions,
    removeMarchersFromLightingGroupMutationOptions,
} from "@/hooks/queries";
import { useLightDesignerGroupFocusStore } from "@/stores/LightDesignerGroupFocusStore";
import {
    getDistinctSortedDrillPrefixesFromMarchers,
    getFamiliesInShow,
    getMarcherIdsByDrillPrefix,
    getMarcherIdsByFamily,
    getMarcherIdsBySectionName,
    sectionsFromMarchers,
} from "@/utilities/lightingGroupMarcherSelection";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import { useCallback, useEffect, useMemo } from "react";

/** Groups for the inspector's current upcoming lighting scene. */
export default function SceneGroupsSection({
    sceneId,
}: {
    sceneId: number | undefined;
}) {
    const { data: groups = [] } = useQuery({
        ...lightingGroupsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });

    const { data: memberships } = useQuery({
        ...lightingGroupMembershipsBySceneIdQueryOptions(sceneId ?? -1),
        enabled: sceneId != null,
    });

    const { data: marchers = [] } = useQuery(allMarchersQueryOptions());

    const toggleGroupFocus =
        useLightDesignerGroupFocusStore.use.toggleGroupFocus();
    const clearGroupFocus =
        useLightDesignerGroupFocusStore.use.clearGroupFocus();
    const groupFocus = useLightDesignerGroupFocusStore.use.groupFocus();

    const { mutate: createGroupsMutate } = useMutation(
        createLightingGroupsMutationOptions(),
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

    return (
        <div className="flex min-h-0 min-w-0 flex-col gap-8 px-6">
            <div className="flex items-center justify-between gap-8">
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
            </div>

            <ul className="flex min-h-0 flex-col gap-16 overflow-y-auto pr-4">
                {groups.map((group) => (
                    <LightingGroupRow
                        key={group.id}
                        group={group}
                        memberships={memberships}
                        marchers={marchers ?? []}
                        isFocused={groupFocus?.groupId === group.id}
                        onToggleFocus={() =>
                            toggleGroupFocus({ groupId: group.id, sceneId })
                        }
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
        </div>
    );
}

function LightingGroupRow({
    group,
    memberships,
    marchers,
    isFocused,
    onToggleFocus,
}: {
    group: DatabaseLightingGroup;
    memberships: Map<number, Set<number>> | undefined;
    marchers: Marcher[];
    isFocused: boolean;
    onToggleFocus: () => void;
}) {
    const { t } = useTolgee();

    const { selectedMarchers } = useSelectedMarchers()!;
    const memberSet = memberships?.get(group.id) ?? new Set<number>();

    const { mutate: addMarchersMutate } = useMutation(
        addMarchersToLightingGroupMutationOptions(),
    );
    const { mutate: removeMarchersMutate } = useMutation(
        removeMarchersFromLightingGroupMutationOptions(),
    );
    const { mutate: deleteGroupMutate } = useMutation(
        deleteLightingGroupsMutationOptions(),
    );

    const addFromIds = useCallback(
        (ids: number[]) => {
            if (ids.length === 0) return;
            addMarchersMutate({ groupId: group.id, marcherIds: ids });
        },
        [group.id, addMarchersMutate],
    );

    const sections = useMemo(() => sectionsFromMarchers(marchers), [marchers]);
    const families = useMemo(() => getFamiliesInShow(), []);
    const drillPrefixes = useMemo(
        () => getDistinctSortedDrillPrefixesFromMarchers(marchers),
        [marchers],
    );

    const selectedIds = useMemo(
        () => selectedMarchers.map((m) => m.id),
        [selectedMarchers],
    );

    const toAddSelectionCount = selectedIds.filter(
        (id) => !memberSet.has(id),
    ).length;
    const toRemoveSelectionCount = selectedIds.filter((id) =>
        memberSet.has(id),
    ).length;

    const displayName =
        group.name?.trim() ?? t("inspector.light.groups.groupFallback");

    return (
        <li className="rounded-6 border-stroke bg-fg-1 relative flex flex-col gap-8 overflow-clip border p-12">
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
                        <Dropdown.Root>
                            <Dropdown.Trigger asChild>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="compact"
                                    className="gap-6"
                                >
                                    <T
                                        defaultValue="Add"
                                        keyName="inspector.light.groups.add"
                                    />{" "}
                                    <CaretDownIcon size={14} aria-hidden />
                                </Button>
                            </Dropdown.Trigger>
                            <Dropdown.Portal>
                                <Dropdown.Content
                                    collisionPadding={8}
                                    className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[52] inline-block max-h-[min(40vh,var(--radix-dropdown-menu-content-available-height))] min-w-max overflow-y-auto border p-8 shadow-xl"
                                >
                                    <Dropdown.Sub>
                                        <Dropdown.SubTrigger className="text-text hover:bg-overlay rounded-8 [&[data-state=open]]:bg-overlay flex cursor-default items-center justify-between gap-24 px-8 py-4 outline-hidden">
                                            <T
                                                keyName="inspector.light.groups.addBy.section"
                                                defaultValue="Section"
                                            />
                                            <CaretRightIcon
                                                size={16}
                                                aria-hidden
                                            />
                                        </Dropdown.SubTrigger>
                                        <Dropdown.Portal>
                                            <Dropdown.SubContent
                                                alignOffset={-4}
                                                className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[53] mt-[-4px] max-h-[40vh] min-w-[140px] overflow-y-auto border p-8 shadow-xl"
                                                collisionPadding={8}
                                                sideOffset={6}
                                            >
                                                {sections.map((sec) => (
                                                    <Dropdown.Item
                                                        key={sec.name}
                                                        className="text-text hover:bg-overlay rounded-8 cursor-pointer px-8 py-4 outline-hidden"
                                                        onSelect={() =>
                                                            addFromIds(
                                                                getMarcherIdsBySectionName(
                                                                    marchers,
                                                                    sec.name,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <T
                                                            keyName={sec.tName}
                                                        />
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.SubContent>
                                        </Dropdown.Portal>
                                    </Dropdown.Sub>

                                    <Dropdown.Sub>
                                        <Dropdown.SubTrigger className="text-text hover:bg-overlay rounded-8 [&[data-state=open]]:bg-overlay flex cursor-default items-center justify-between gap-24 px-8 py-4 outline-hidden">
                                            <T
                                                keyName="inspector.light.groups.addBy.family"
                                                defaultValue="Family"
                                            />
                                            <CaretRightIcon
                                                size={16}
                                                aria-hidden
                                            />
                                        </Dropdown.SubTrigger>
                                        <Dropdown.Portal>
                                            <Dropdown.SubContent
                                                alignOffset={-4}
                                                className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[53] max-h-[40vh] min-w-[140px] overflow-y-auto border p-8 shadow-xl"
                                                collisionPadding={8}
                                                sideOffset={6}
                                            >
                                                {families.map((fam) => (
                                                    <Dropdown.Item
                                                        key={fam.name}
                                                        className="text-text hover:bg-overlay rounded-8 cursor-pointer px-8 py-4 outline-hidden"
                                                        onSelect={() =>
                                                            addFromIds(
                                                                getMarcherIdsByFamily(
                                                                    marchers,
                                                                    fam,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <T
                                                            keyName={fam.tName}
                                                        />
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.SubContent>
                                        </Dropdown.Portal>
                                    </Dropdown.Sub>

                                    <Dropdown.Sub>
                                        <Dropdown.SubTrigger className="text-text hover:bg-overlay rounded-8 [&[data-state=open]]:bg-overlay flex cursor-default items-center justify-between gap-24 px-8 py-4 outline-hidden">
                                            <T
                                                keyName="inspector.light.groups.addBy.prefix"
                                                defaultValue="Drill prefix"
                                            />
                                            <CaretRightIcon
                                                size={16}
                                                aria-hidden
                                            />
                                        </Dropdown.SubTrigger>
                                        <Dropdown.Portal>
                                            <Dropdown.SubContent
                                                alignOffset={-4}
                                                className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[53] max-h-[40vh] min-w-[140px] overflow-y-auto border p-8 shadow-xl"
                                                collisionPadding={8}
                                                sideOffset={6}
                                            >
                                                {drillPrefixes.map((prefix) => (
                                                    <Dropdown.Item
                                                        key={prefix}
                                                        className="text-text hover:bg-overlay rounded-8 cursor-pointer px-8 py-4 outline-hidden"
                                                        onSelect={() =>
                                                            addFromIds(
                                                                getMarcherIdsByDrillPrefix(
                                                                    marchers,
                                                                    prefix,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        {prefix ||
                                                            t(
                                                                "inspector.light.groups.emptyPrefixLabel",
                                                            )}
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.SubContent>
                                        </Dropdown.Portal>
                                    </Dropdown.Sub>

                                    <Dropdown.Item
                                        className="text-text hover:bg-overlay rounded-8 cursor-pointer px-8 py-4 outline-hidden"
                                        onSelect={() =>
                                            addFromIds(
                                                selectedMarchers.map(
                                                    (m) => m.id,
                                                ),
                                            )
                                        }
                                    >
                                        <T
                                            keyName="inspector.light.groups.addSelection"
                                            defaultValue="Current selection"
                                        />
                                    </Dropdown.Item>
                                </Dropdown.Content>
                            </Dropdown.Portal>
                        </Dropdown.Root>

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

                {(toAddSelectionCount > 0 || toRemoveSelectionCount > 0) && (
                    <div className="flex flex-wrap gap-8">
                        {toAddSelectionCount > 0 && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                className="shrink"
                                onClick={() =>
                                    addMarchersMutate({
                                        groupId: group.id,
                                        marcherIds: selectedIds.filter(
                                            (id) => !memberSet.has(id),
                                        ),
                                    })
                                }
                            >
                                <T
                                    keyName="inspector.light.groups.addSelectionPartial"
                                    params={{
                                        count: String(toAddSelectionCount),
                                    }}
                                    defaultValue="Add {count} marchers to group"
                                />
                            </Button>
                        )}
                        {toRemoveSelectionCount > 0 && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                className="shrink"
                                onClick={() =>
                                    removeMarchersMutate({
                                        groupId: group.id,
                                        marcherIds: selectedIds.filter((id) =>
                                            memberSet.has(id),
                                        ),
                                    })
                                }
                            >
                                <T
                                    keyName="inspector.light.groups.removeSelectionPartial"
                                    params={{
                                        count: String(toRemoveSelectionCount),
                                    }}
                                    defaultValue="Remove {count} marchers from group"
                                />
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}
