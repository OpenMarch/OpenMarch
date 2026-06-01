/** MIME type for HTML5 drag from marcher collection badges onto lighting group rows. */
export const LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME =
    "application/x-openmarch-lighting-group-marcher-collection";

export type LightingGroupMarcherCollectionSourceType =
    | "selection"
    | "section"
    | "tag"
    | "family";

export type LightingGroupMarcherCollectionDragPayload = {
    sourceType: LightingGroupMarcherCollectionSourceType;
    label: string;
    marcherIds: number[];
};

function isLightingGroupMarcherCollectionDragPayload(
    value: unknown,
): value is LightingGroupMarcherCollectionDragPayload {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    return (
        (r.sourceType === "selection" ||
            r.sourceType === "section" ||
            r.sourceType === "tag" ||
            r.sourceType === "family") &&
        typeof r.label === "string" &&
        Array.isArray(r.marcherIds) &&
        r.marcherIds.every(
            (id) => typeof id === "number" && Number.isFinite(id),
        )
    );
}

export function dataTransferHasLightingGroupMarcherCollectionDrag(
    dataTransfer: DataTransfer,
): boolean {
    return dataTransfer.types.includes(
        LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME,
    );
}

export function setLightingGroupMarcherCollectionDragData(
    dataTransfer: DataTransfer,
    payload: LightingGroupMarcherCollectionDragPayload,
): void {
    dataTransfer.effectAllowed = "copy";
    dataTransfer.setData(
        LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME,
        JSON.stringify({
            ...payload,
            marcherIds: [...new Set(payload.marcherIds)],
        }),
    );
}

export function getLightingGroupMarcherCollectionDragPayload(
    dataTransfer: DataTransfer,
): LightingGroupMarcherCollectionDragPayload | undefined {
    const raw = dataTransfer.getData(
        LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME,
    );
    if (!raw) return undefined;
    try {
        const parsed: unknown = JSON.parse(raw);
        return isLightingGroupMarcherCollectionDragPayload(parsed)
            ? parsed
            : undefined;
    } catch {
        return undefined;
    }
}

export function partitionLightingGroupDropMarcherIds({
    draggedMarcherIds,
    targetGroupId,
    membershipsByGroupId,
}: {
    draggedMarcherIds: readonly number[];
    targetGroupId: number;
    membershipsByGroupId: Map<number, Set<number>> | undefined;
}): {
    alreadyInTarget: number[];
    inOtherGroups: number[];
    unassigned: number[];
} {
    const targetSet =
        membershipsByGroupId?.get(targetGroupId) ?? new Set<number>();
    const uniqueDraggedIds = [...new Set(draggedMarcherIds)];

    const alreadyInTarget: number[] = [];
    const inOtherGroups: number[] = [];
    const unassigned: number[] = [];

    for (const marcherId of uniqueDraggedIds) {
        if (targetSet.has(marcherId)) {
            alreadyInTarget.push(marcherId);
            continue;
        }
        const inOtherGroup = Array.from(membershipsByGroupId ?? []).some(
            ([groupId, groupMembers]) =>
                groupId !== targetGroupId && groupMembers.has(marcherId),
        );
        if (inOtherGroup) {
            inOtherGroups.push(marcherId);
        } else {
            unassigned.push(marcherId);
        }
    }

    return { alreadyInTarget, inOtherGroups, unassigned };
}
