import { Button, Input } from "@openmarch/ui";
import {
    TagIcon,
    SparkleIcon,
    PlusIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { useState, useEffect, useRef, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createNewTagFromMarcherIdsMutationOptions } from "@/hooks/queries";

const buttonClassName = twMerge("flex items-center gap-4 w-full");

export const TagButtons = ({
    selectedMarcherIds,
}: {
    selectedMarcherIds: Set<number>;
}) => {
    return (
        <div className="grid w-full grid-cols-3 gap-8">
            <NewTagButton selectedMarcherIds={selectedMarcherIds} />
            <Button
                tooltipText="Add selected marchers to existing tag"
                size="compact"
                variant="secondary"
                className={buttonClassName}
            >
                <TagIcon size={16} />
                <PlusIcon size={16} />
            </Button>
            <Button
                tooltipText="Remove selected marchers from tag"
                size="compact"
                variant="secondary"
                className={buttonClassName}
            >
                <TagIcon size={16} />
                <TrashIcon size={16} />
            </Button>
        </div>
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
                    tooltipText="Create new tag with selected marchers"
                    size="compact"
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
