import { DotsSixVerticalIcon, PlusIcon } from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { T } from "@tolgee/react";
import {
    DatabaseTag,
    getTagName,
    ModifiedTagAppearanceArgs,
    TagAppearance,
} from "@/db-functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allTagsQueryOptions,
    createTagAppearancesMutationOptions,
    deleteTagAppearancesMutationOptions,
    tagAppearancesByStartPageIdQueryOptions,
    updateTagAppearancesMutationOptions,
} from "@/hooks/queries";
import { AppearanceEditor } from "@/components/marcher/appearance/AppearanceEditor";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useTimingObjects } from "@/hooks";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function TagAppearanceList({
    targetPageId,
    targetTagId,
}: {
    targetPageId?: number;
    targetTagId?: number;
} = {}) {
    const { setHighlightSelection, highlightSelection } =
        useSidebarModalStore();
    const queryClient = useQueryClient();
    const { data: allTags } = useQuery(allTagsQueryOptions());
    const tagNamesByTagId = useMemo(() => {
        return new Map(allTags?.map((tag) => [tag.id, tag.name]) ?? []);
    }, [allTags]);
    const { pages } = useTimingObjects();

    const { mutateAsync: createTagAppearances } = useMutation(
        createTagAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: updateTagAppearances } = useMutation(
        updateTagAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: deleteTagAppearances } = useMutation(
        deleteTagAppearancesMutationOptions(queryClient),
    );

    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Check if tag appearance exists and create it if needed, then scroll
    useEffect(() => {
        if (targetPageId == null || targetTagId == null || !highlightSelection)
            return;

        const checkAndCreateTagAppearance = async () => {
            // Check if tag appearance exists for this page/tag combination
            const tagAppearances = await queryClient.fetchQuery(
                tagAppearancesByStartPageIdQueryOptions(targetPageId),
            );

            const existingAppearance = tagAppearances?.find(
                (appearance) => appearance.tag_id === targetTagId,
            );

            if (!existingAppearance) {
                // Create the tag appearance and wait for persistence
                await createTagAppearances([
                    { tag_id: targetTagId, start_page_id: targetPageId },
                ]);
                // Allow React Query to invalidate and re-render
                await queryClient.invalidateQueries();
            } else {
                // Appearance already exists, just wait for render cycle
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            resolve();
                        });
                    });
                });
            }

            const pageElement = pageRefs.current.get(targetPageId);
            if (pageElement && scrollContainerRef.current) {
                // Scroll the container to show the page
                pageElement.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }
        };

        void checkAndCreateTagAppearance();
    }, [
        targetPageId,
        targetTagId,
        createTagAppearances,
        queryClient,
        highlightSelection,
    ]);

    if (allTags?.length === 0) {
        return (
            <div className="animate-scale-in flex flex-col gap-8">
                <p className="text-body text-text-subtitle">
                    <T keyName="marchers.list.createTagsFirst" />
                </p>
            </div>
        );
    }

    return (
        <div
            className="animate-scale-in flex flex-col gap-8"
            onClick={() => setHighlightSelection(false)}
        >
            <div
                ref={scrollContainerRef}
                className="text-body text-text flex h-full w-[28rem] flex-col gap-48 overflow-y-auto"
            >
                {pages.map((page) => (
                    <SinglePageTagAppearanceList
                        key={page.id}
                        ref={(el) => {
                            if (el) {
                                pageRefs.current.set(page.id, el);
                            } else {
                                pageRefs.current.delete(page.id);
                            }
                        }}
                        page={page}
                        availableTags={allTags ?? []}
                        tagNamesByTagId={tagNamesByTagId}
                        targetTagId={
                            page.id === targetPageId ? targetTagId : undefined
                        }
                        handleCreateAppearance={(tagId) =>
                            void createTagAppearances([
                                { tag_id: tagId, start_page_id: page.id },
                            ])
                        }
                        handleUpdateAppearance={(modifiedAppearance) =>
                            void updateTagAppearances([modifiedAppearance])
                        }
                        handleUpdatePriorities={(appearances) =>
                            void updateTagAppearances(appearances)
                        }
                        handleDeleteAppearance={(tagId) =>
                            void deleteTagAppearances(new Set([tagId]))
                        }
                    />
                ))}
            </div>
        </div>
    );
}

const SinglePageTagAppearanceList = React.forwardRef<
    HTMLDivElement,
    {
        page: { id: number; name: string };
        availableTags: DatabaseTag[];
        tagNamesByTagId: Map<number, string | null>;
        targetTagId?: number;
        handleCreateAppearance: (tagId: number) => void;
        handleUpdateAppearance: (appearance: ModifiedTagAppearanceArgs) => void;
        handleUpdatePriorities: (
            appearances: ModifiedTagAppearanceArgs[],
        ) => void;
        handleDeleteAppearance: (tagId: number) => void;
    }
>(function SinglePageTagAppearanceList(
    {
        page,
        availableTags,
        tagNamesByTagId,
        targetTagId,
        handleCreateAppearance,
        handleUpdateAppearance,
        handleUpdatePriorities,
        handleDeleteAppearance,
    },
    ref,
) {
    const { highlightSelection } = useSidebarModalStore();
    const { data: tagAppearances } = useQuery(
        tagAppearancesByStartPageIdQueryOptions(page.id),
    );

    // Server-sorted data (descending priority - higher priority first)
    const serverSorted = useMemo(() => {
        return [...(tagAppearances ?? [])].sort(
            (a, b) => b.priority - a.priority,
        );
    }, [tagAppearances]);

    // Local state for immediate UI updates (prevents dnd-kit snap-back)
    const [localOrder, setLocalOrder] = useState(serverSorted);

    // Sync local state with server data when it changes
    useEffect(() => {
        setLocalOrder(serverSorted);
    }, [serverSorted]);

    const sensors = useSensors(useSensor(PointerSensor));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = localOrder.findIndex((a) => a.id === active.id);
        const newIndex = localOrder.findIndex((a) => a.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(localOrder, oldIndex, newIndex);

        // Update local state immediately to prevent snap-back
        setLocalOrder(reordered);

        const updates: ModifiedTagAppearanceArgs[] = reordered.map(
            (appearance, index) => ({
                ...appearance,
                priority: reordered.length - 1 - index,
            }),
        );
        handleUpdatePriorities(updates);
    };

    const takenTagIds: Set<number> = useMemo(
        () => new Set(tagAppearances?.map((a) => a.tag_id) ?? []),
        [tagAppearances],
    );

    const tagAppearanceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const [highlightedTagId, setHighlightedTagId] = useState<number | null>(
        null,
    );

    // Scroll to the target tag appearance when it becomes available
    useEffect(() => {
        if (targetTagId == null || !highlightSelection) {
            setHighlightedTagId(null);
            return;
        }

        const targetAppearance = localOrder.find(
            (appearance) => appearance.tag_id === targetTagId,
        );

        if (targetAppearance) {
            // Set highlight state
            setHighlightedTagId(targetTagId);

            const tagElement = tagAppearanceRefs.current.get(
                targetAppearance.id,
            );
            let scrollTimer: ReturnType<typeof setTimeout> | undefined;
            if (tagElement) {
                scrollTimer = setTimeout(() => {
                    tagElement.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                }, 300);
            }

            // Fade out the highlight after 2 seconds
            const fadeOutTimer = setTimeout(() => {
                setHighlightedTagId(null);
            }, 1500);

            return () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                clearTimeout(fadeOutTimer);
            };
        }
    }, [targetTagId, localOrder, highlightSelection]);

    return (
        <div
            aria-label={`page ${page.name} tag appearance list`}
            ref={ref}
            className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto"
        >
            <div className="flex flex-col gap-16">
                <h3 className="text-text-subtitle text-lg leading-none">
                    Page {page.name}
                </h3>
                <Dropdown.Root>
                    <Dropdown.Trigger
                        disabled={availableTags.length === 0}
                        asChild
                    >
                        <div className="hover:text-accent flex cursor-pointer items-center gap-6 transition-colors duration-150">
                            <PlusIcon size={16} />
                            <T keyName="marchers.list.addTagAppearance" />
                        </div>
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                        <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke z-[999] flex max-h-[70vh] flex-col items-start gap-0 overflow-y-auto border p-8">
                            {availableTags.map((tag) => (
                                <Dropdown.Item
                                    disabled={takenTagIds.has(tag.id)}
                                    key={tag.id}
                                    onSelect={() =>
                                        handleCreateAppearance(tag.id)
                                    }
                                    className={twMerge(
                                        "text-body w-full px-6 py-4 text-left outline-none",
                                        takenTagIds.has(tag.id)
                                            ? "text-text-disabled"
                                            : "text-text hover:text-accent cursor-pointer duration-150 ease-out",
                                    )}
                                >
                                    {getTagName({
                                        tag_id: tag.id,
                                        name: tag.name,
                                    })}
                                </Dropdown.Item>
                            ))}
                        </Dropdown.Content>
                    </Dropdown.Portal>
                </Dropdown.Root>
                <div className="flex h-fit w-full min-w-0 flex-col gap-16">
                    {localOrder && localOrder.length > 0 ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={localOrder.map((a) => a.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {localOrder.map((tagAppearance) => (
                                    <SortableTagAppearance
                                        key={tagAppearance.id}
                                        tagAppearance={tagAppearance}
                                        pageId={page.id}
                                        tagName={getTagName({
                                            tag_id: tagAppearance.tag_id,
                                            name: tagNamesByTagId.get(
                                                tagAppearance.tag_id,
                                            ),
                                        })}
                                        isHighlighted={
                                            highlightedTagId ===
                                            tagAppearance.tag_id
                                        }
                                        setRef={(el) => {
                                            if (el) {
                                                tagAppearanceRefs.current.set(
                                                    tagAppearance.id,
                                                    el,
                                                );
                                            } else {
                                                tagAppearanceRefs.current.delete(
                                                    tagAppearance.id,
                                                );
                                            }
                                        }}
                                        handleUpdateAppearance={(
                                            modifiedAppearance,
                                        ) =>
                                            void handleUpdateAppearance({
                                                id: tagAppearance.id,
                                                ...modifiedAppearance,
                                            })
                                        }
                                        handleDeleteAppearance={() =>
                                            handleDeleteAppearance(
                                                tagAppearance.id,
                                            )
                                        }
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    ) : (
                        <p className="text-body text-text-subtitle">
                            <T keyName="marchers.list.none" />
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
});

function SortableTagAppearance({
    tagAppearance,
    pageId,
    tagName,
    isHighlighted,
    setRef,
    handleUpdateAppearance,
    handleDeleteAppearance,
}: {
    tagAppearance: TagAppearance;
    pageId: number;
    tagName: string;
    isHighlighted: boolean;
    setRef: (el: HTMLDivElement | null) => void;
    handleUpdateAppearance: (
        appearance: Omit<ModifiedTagAppearanceArgs, "id">,
    ) => void;
    handleDeleteAppearance: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tagAppearance.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={(el) => {
                setNodeRef(el);
                setRef(el);
            }}
            style={style}
            aria-label={`page_${pageId}-tag_appearance_${tagAppearance.id}`}
            className={twMerge(
                "text-body text-text flex w-[28rem] items-start gap-4",
                isDragging ? "z-50 opacity-90" : "",
            )}
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
                <AppearanceEditor
                    label={tagName}
                    className={twMerge(
                        "transition-all duration-500 ease-out",
                        isHighlighted ? "bg-accent/50 border-accent" : "",
                    )}
                    appearance={tagAppearance}
                    handleUpdateAppearance={handleUpdateAppearance}
                    handleDeleteAppearance={handleDeleteAppearance}
                />
            </div>
        </div>
    );
}
