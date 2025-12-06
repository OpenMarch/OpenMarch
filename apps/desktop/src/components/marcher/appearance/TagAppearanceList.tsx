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
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { useTimingObjects } from "@/hooks";

export default function SectionAppearanceList() {
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

    return (
        <div className="animate-scale-in flex flex-col gap-8">
            <div className="text-body text-text flex h-full w-[28rem] flex-col gap-48 overflow-y-auto">
                {pages.map((page) => (
                    <SinglePageTagAppearanceList
                        key={page.id}
                        page={page}
                        availableTags={allTags ?? []}
                        tagNamesByTagId={tagNamesByTagId}
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

function SinglePageTagAppearanceList({
    page,
    availableTags,
    tagNamesByTagId,
    handleCreateAppearance,
    handleUpdateAppearance,
    handleDeleteAppearance,
}: {
    page: { id: number; name: string };
    availableTags: DatabaseTag[];
    tagNamesByTagId: Map<number, string | null>;
    handleCreateAppearance: (tagId: number) => void;
    handleUpdateAppearance: (appearance: ModifiedTagAppearanceArgs) => void;
    handleDeleteAppearance: (tagId: number) => void;
}) {
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

    return (
        <div className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto">
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
                                <AppearanceEditor
                                    key={tagAppearance.id}
                                    label={getTagName({
                                        tag_id: tagAppearance.tag_id,
                                        name: tagNamesByTagId.get(
                                            tagAppearance.tag_id,
                                        ),
                                    })}
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
                                        handleDeleteAppearance(tagAppearance.id)
                                    }
                                />
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
}
