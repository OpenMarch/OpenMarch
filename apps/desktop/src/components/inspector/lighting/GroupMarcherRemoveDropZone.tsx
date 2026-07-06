import {
    dataTransferHasLightingGroupMarcherCollectionDrag,
    getLightingGroupMarcherCollectionDragPayload,
    groupMarcherIdsForRemovalByGroup,
} from "@/utilities/lightingGroupEffectDnD";
import { TrashIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import clsx from "clsx";
import { useState, type DragEvent } from "react";

type GroupMarcherRemoveDropZoneProps = {
    visible: boolean;
    memberships: Map<number, Set<number>> | undefined;
    onRemoveMarchers: (removals: Map<number, number[]>) => void;
    onDragComplete?: () => void;
};

export default function GroupMarcherRemoveDropZone({
    visible,
    memberships,
    onRemoveMarchers,
    onDragComplete,
}: GroupMarcherRemoveDropZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    if (!visible) return null;

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        if (!dataTransferHasLightingGroupMarcherCollectionDrag(e.dataTransfer))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        setIsDragOver(false);
        if (!dataTransferHasLightingGroupMarcherCollectionDrag(e.dataTransfer))
            return;
        e.preventDefault();
        e.stopPropagation();

        const payload = getLightingGroupMarcherCollectionDragPayload(
            e.dataTransfer,
        );
        if (payload) {
            const removals = groupMarcherIdsForRemovalByGroup({
                marcherIds: payload.marcherIds,
                membershipsByGroupId: memberships,
            });
            if (removals.size > 0) {
                onRemoveMarchers(removals);
            }
        }
        onDragComplete?.();
    };

    return (
        <div
            className={clsx(
                "rounded-6 border-stroke text-text-subtitle text-body flex items-center justify-center gap-8 border border-dashed p-12 transition-colors",
                isDragOver &&
                    "border-red bg-red/10 text-red ring-red/70 ring-2 ring-inset",
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <TrashIcon size={18} aria-hidden />
            <T
                keyName="inspector.light.groups.removeFromGroups"
                defaultValue="Remove from groups"
            />
        </div>
    );
}
