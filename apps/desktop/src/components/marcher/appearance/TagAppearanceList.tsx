import { PlusIcon } from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { T } from "@tolgee/react";
import {
    DatabaseTag,
    getTagName,
    ModifiedTagAppearanceArgs,
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
        handleDeleteAppearance,
    },
    ref,
) {
    const { highlightSelection } = useSidebarModalStore();
    const { data: tagAppearances } = useQuery(
        tagAppearancesByStartPageIdQueryOptions(page.id),
    );
    const tagAppearancesSorted = useMemo(() => {
        return tagAppearances?.sort((a, b) => a.priority - b.priority) ?? [];
    }, [tagAppearances]);

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

        const targetAppearance = tagAppearancesSorted.find(
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
    }, [targetTagId, tagAppearancesSorted, highlightSelection]);

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
                    {tagAppearancesSorted && tagAppearancesSorted.length > 0 ? (
                        <>
                            {tagAppearancesSorted.map((tagAppearance) => (
                                <div
                                    aria-label={`page_${page.id}-tag_appearance_${tagAppearance.id}`}
                                    className={twMerge(
                                        "text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto",
                                    )}
                                    key={tagAppearance.id}
                                    ref={(el) => {
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
                                >
                                    <AppearanceEditor
                                        label={getTagName({
                                            tag_id: tagAppearance.tag_id,
                                            name: tagNamesByTagId.get(
                                                tagAppearance.tag_id,
                                            ),
                                        })}
                                        className={twMerge(
                                            "transition-all duration-500 ease-out",
                                            highlightedTagId ===
                                                tagAppearance.tag_id
                                                ? "bg-accent/50 border-accent"
                                                : "",
                                        )}
                                        appearance={tagAppearance}
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
                                </div>
                            ))}
                        </>
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
