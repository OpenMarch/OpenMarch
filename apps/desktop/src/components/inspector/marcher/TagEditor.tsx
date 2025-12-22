import { Button, Input } from "@openmarch/ui";
import {
    TagIcon,
    SparkleIcon,
    PlusIcon,
    TrashIcon,
    PaletteIcon,
} from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarcherTagsQueryOptions,
    allTagsQueryOptions,
    createMarcherTagsMutationOptions,
    createNewTagFromMarcherIdsMutationOptions,
    deleteMarcherTagsMutationOptions,
    updateTagsMutationOptions,
    deleteTagsMutationOptions,
} from "@/hooks/queries";
import { DatabaseTag, getTagName, NewMarcherTagArgs } from "@/db-functions";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { AppearanceModalContents } from "@/components/marcher/appearance/AppearanceModal";
import { useSelectedPage } from "@/context/SelectedPageContext";

const buttonClassName = twMerge("flex items-center gap-4 w-full");

export const TagButtons = ({
    selectedMarcherIds,
}: {
    selectedMarcherIds: Set<number>;
}) => {
    const { data: allTags, isSuccess: tagsLoaded } = useQuery(
        allTagsQueryOptions(),
    );

    if (!tagsLoaded) return null;
    return (
        <div className="flex flex-col gap-8">
            <div className="grid w-full grid-cols-3 gap-8">
                <NewTagButton selectedMarcherIds={selectedMarcherIds} />
                <AddToTagButton
                    selectedMarcherIds={selectedMarcherIds}
                    allTags={allTags}
                />
                <DeleteFromTagButton
                    selectedMarcherIds={selectedMarcherIds}
                    allTags={allTags}
                />
            </div>
            <SelectedMarcherTags selectedMarcherIds={selectedMarcherIds} />
        </div>
    );
};

const SelectedMarcherTags = ({
    selectedMarcherIds,
}: {
    selectedMarcherIds: Set<number>;
}) => {
    const { data: allTags, isSuccess: tagsLoaded } = useQuery(
        allTagsQueryOptions(),
    );
    const { data: marcherTags } = useQuery(allMarcherTagsQueryOptions());
    const selectedTags = useMemo(() => {
        const selectedMarcherTags =
            marcherTags?.filter((mt) =>
                selectedMarcherIds.has(mt.marcher_id),
            ) ?? [];
        return allTags?.filter((tag) =>
            selectedMarcherTags.some((mt) => mt.tag_id === tag.id),
        );
    }, [allTags, marcherTags, selectedMarcherIds]);

    if (!tagsLoaded) return <></>;

    return (
        <div className="flex flex-wrap gap-4 text-xs">
            {selectedTags?.map((tag) => (
                <TagContextMenu key={tag.id} tag={tag} />
            ))}
        </div>
    );
};

const TagContextMenu = ({ tag }: { tag: DatabaseTag }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const {
        setOpen: setSidebarModalOpen,
        setContent: setSidebarModalContent,
        setHighlightSelection,
    } = useSidebarModalStore();
    const [renameValue, setRenameValue] = useState(tag.name ?? "");
    const [isRenaming, setIsRenaming] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { selectedPage } = useSelectedPage()!;

    const { mutate: updateTag, isPending: isUpdating } = useMutation(
        updateTagsMutationOptions(queryClient),
    );
    const { mutate: deleteTag } = useMutation(
        deleteTagsMutationOptions(queryClient),
    );

    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    useEffect(() => {
        setRenameValue(tag.name ?? "");
    }, [tag.name]);

    useEffect(() => {
        if (!popoverOpen) {
            setIsRenaming(false);
        }
    }, [popoverOpen]);

    const handleRename = useCallback(() => {
        if (renameValue.trim() !== (tag.name ?? "")) {
            updateTag([
                {
                    id: tag.id,
                    name: renameValue.trim() || null,
                },
            ]);
        }
        setIsRenaming(false);
    }, [renameValue, tag.id, tag.name, updateTag]);

    const handleDelete = useCallback(() => {
        deleteTag(new Set([tag.id]));
        setPopoverOpen(false);
    }, [tag.id, deleteTag]);

    const handleEditAppearance = useCallback(() => {
        // TODO: Open appearance context menu
        setPopoverOpen(false);
        setHighlightSelection(true);
        setSidebarModalOpen(true);
        setSidebarModalContent(
            <AppearanceModalContents
                mode="tag"
                launchArgs={{
                    targetTagId: tag.id,
                    targetPageId: selectedPage?.id,
                }}
            />,
            "marcher-appearance",
        );
    }, [
        selectedPage?.id,
        setHighlightSelection,
        setSidebarModalContent,
        setSidebarModalOpen,
        tag.id,
    ]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleRename();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setIsRenaming(false);
            setRenameValue(tag.name ?? "");
        }
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setPopoverOpen(true);
    };

    return (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
                <div
                    className="rounded-6 bg-fg-1 border-stroke hover:text-accent cursor-pointer border p-4 duration-150 ease-out"
                    onContextMenu={handleContextMenu}
                >
                    {getTagName({ tag_id: tag.id, name: tag.name })}
                </div>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex min-w-[200px] flex-col gap-8 border p-16 py-12 backdrop-blur-md outline-none"
                    sideOffset={8}
                    align="start"
                    onCloseAutoFocus={(e) => {
                        e.preventDefault();
                    }}
                >
                    {isRenaming ? (
                        <div className="flex flex-col gap-4">
                            <label className="text-text-subtitle text-sm">
                                Rename tag
                            </label>
                            <Input
                                aria-label="Rename tag"
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleRename}
                                className="bg-input border-stroke text-text rounded-4 focus:border-primary border px-8 py-4 outline-none"
                                placeholder="Enter tag name..."
                                disabled={isUpdating}
                            />
                        </div>
                    ) : (
                        <>
                            <div
                                className="text-text hover:text-accent flex cursor-pointer items-center gap-8 transition-all duration-150 ease-out"
                                onClick={() => setIsRenaming(true)}
                            >
                                <span className="text-sm">Rename tag</span>
                            </div>
                            <div
                                onClick={handleEditAppearance}
                                className="text-text-subtitle hover:text-accent flex cursor-pointer items-center justify-between gap-8 text-xs transition-all duration-150 ease-out"
                            >
                                Edit appearance
                                <PaletteIcon size={16} />
                            </div>
                            <div
                                onClick={handleDelete}
                                className="text-text-subtitle hover:text-red flex cursor-pointer items-center justify-between gap-8 text-xs transition-all duration-150 ease-out"
                            >
                                Delete tag
                                <TrashIcon size={16} />
                            </div>
                        </>
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const NewTagButton = ({
    selectedMarcherIds,
}: {
    selectedMarcherIds: Set<number>;
}) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [tagName, setTagName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { mutate: createNewTagFromMarcherIds, isPending } = useMutation(
        createNewTagFromMarcherIdsMutationOptions(queryClient),
    );

    useEffect(() => {
        if (popoverOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [popoverOpen]);

    const handleCreateTag = useCallback(() => {
        createNewTagFromMarcherIds({
            marcherIds: selectedMarcherIds,
            tagName,
        });
        setPopoverOpen(false);
        setTagName("");
    }, [tagName, selectedMarcherIds, createNewTagFromMarcherIds]);

    const handleCancel = () => {
        setPopoverOpen(false);
        setTagName("");
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleCreateTag();
        } else if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
        }
    };

    return (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
                <Button
                    aria-label="Create new tag with selected marchers"
                    tooltipText="Create new tag with selected marchers"
                    size="compact"
                    variant="secondary"
                    className={buttonClassName}
                    disabled={isPending}
                >
                    <TagIcon size={16} />
                    <SparkleIcon size={16} />
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal rounded-6 shadow-modal border-stroke z-10 flex flex-col gap-8 border p-12 outline-none"
                    sideOffset={8}
                    align="center"
                    onCloseAutoFocus={(e) => {
                        // Prevent focus from returning to trigger button to avoid tooltip
                        e.preventDefault();
                    }}
                >
                    <div className="flex flex-col gap-4">
                        <label
                            htmlFor="tag-name-input"
                            className="text-text-subtitle text-sm"
                        >
                            Define a name for the new tag (optional)
                        </label>
                        <Input
                            id="tag-name-input"
                            ref={inputRef}
                            type="text"
                            value={tagName}
                            onChange={(e) => setTagName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="bg-input border-stroke text-text rounded-4 focus:border-primary border px-8 py-4 outline-none"
                            placeholder="Enter tag name..."
                        />
                    </div>
                    <div className="flex gap-8">
                        <Button
                            size="compact"
                            variant="secondary"
                            className="flex-1"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="compact"
                            className="flex-1"
                            onClick={handleCreateTag}
                        >
                            Create Tag
                        </Button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const AddToTagButton = ({
    selectedMarcherIds,
    allTags,
}: {
    selectedMarcherIds: Set<number>;
    allTags: DatabaseTag[];
}) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const queryClient = useQueryClient();
    const { mutate: createMarcherTags, isPending } = useMutation(
        createMarcherTagsMutationOptions(queryClient),
    );

    const handleCreateTag = useCallback(
        (tagId: number) => {
            const newMarcherTags: NewMarcherTagArgs[] = Array.from(
                selectedMarcherIds,
            ).map((marcherId) => ({
                marcher_id: marcherId,
                tag_id: tagId,
            }));
            createMarcherTags(newMarcherTags);
            setPopoverOpen(false);
        },
        [createMarcherTags, selectedMarcherIds],
    );

    return (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
                <Button
                    aria-label="Add selected marchers to existing tag"
                    tooltipText="Add selected marchers to tag"
                    size="compact"
                    variant="secondary"
                    className={buttonClassName}
                    disabled={isPending || allTags.length === 0}
                >
                    <TagIcon size={16} />
                    <PlusIcon size={16} />
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal rounded-6 shadow-modal border-stroke z-10 flex flex-col gap-8 border p-12 outline-none"
                    sideOffset={8}
                    align="center"
                    onCloseAutoFocus={(e) => {
                        // Prevent focus from returning to trigger button to avoid tooltip
                        e.preventDefault();
                    }}
                >
                    <div className="flex flex-col gap-4">
                        <div className="text-text-subtitle text-sm">
                            Add selected marchers to tag
                        </div>
                        {allTags.map((tag) => (
                            <div
                                key={tag.id}
                                className="text-text hover:text-accent cursor-pointer"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleCreateTag(tag.id);
                                    setPopoverOpen(false);
                                }}
                            >
                                {getTagName({ tag_id: tag.id, name: tag.name })}
                            </div>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const DeleteFromTagButton = ({
    selectedMarcherIds,
    allTags,
}: {
    selectedMarcherIds: Set<number>;
    allTags: DatabaseTag[];
}) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const { data: allMarcherTags, isSuccess: marcherTagsLoaded } = useQuery(
        allMarcherTagsQueryOptions(),
    );
    const queryClient = useQueryClient();
    const { mutate: deleteMarcherTags, isPending } = useMutation(
        deleteMarcherTagsMutationOptions(queryClient),
    );
    const tagsInSelectedMarcherIds = useMemo(() => {
        return Array.from(
            new Set(
                allMarcherTags
                    ?.filter((mt) => selectedMarcherIds.has(mt.marcher_id))
                    .map((mt) => mt.tag_id),
            ),
        );
    }, [allMarcherTags, selectedMarcherIds]);

    const handleDeleteFromTag = useCallback(
        (tagId: number) => {
            if (!allMarcherTags) {
                console.error("No marcher tags found");
                return;
            }
            const marcherTagIds = allMarcherTags
                .filter(
                    (mt) =>
                        mt.tag_id === tagId &&
                        selectedMarcherIds.has(mt.marcher_id),
                )
                .map((mt) => mt.id);
            if (marcherTagIds) {
                deleteMarcherTags(new Set(marcherTagIds));
            }
        },
        [allMarcherTags, deleteMarcherTags, selectedMarcherIds],
    );
    if (!marcherTagsLoaded) return null;
    return (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
                <Button
                    aria-label="Remove selected marchers from tag"
                    tooltipText="Remove selected marchers from tag"
                    size="compact"
                    variant="secondary"
                    className={buttonClassName}
                    disabled={
                        isPending || tagsInSelectedMarcherIds.length === 0
                    }
                >
                    <TagIcon size={16} />
                    <TrashIcon size={16} />
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal rounded-6 shadow-modal border-stroke z-10 flex flex-col gap-8 border p-12 outline-none"
                    sideOffset={8}
                    align="center"
                    onCloseAutoFocus={(e) => {
                        // Prevent focus from returning to trigger button to avoid tooltip
                        e.preventDefault();
                    }}
                >
                    <div className="text-text-subtitle text-sm">
                        Remove selected marchers from tag
                    </div>
                    <div className="wrap flex flex-col gap-4">
                        {allTags
                            .filter((tag) =>
                                tagsInSelectedMarcherIds.includes(tag.id),
                            )
                            .map((tag) => (
                                <div
                                    key={tag.id}
                                    className="text-text hover:text-accent cursor-pointer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteFromTag(tag.id);
                                        setPopoverOpen(false);
                                    }}
                                >
                                    {getTagName({
                                        tag_id: tag.id,
                                        name: tag.name,
                                    })}
                                </div>
                            ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};
