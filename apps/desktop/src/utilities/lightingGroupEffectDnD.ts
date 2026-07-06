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

/** Fallback when DataTransfer.getData is empty on drop (common in Chromium/Electron). */
let activeLightingGroupMarcherCollectionDragPayload: LightingGroupMarcherCollectionDragPayload | null =
    null;

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
    const normalized: LightingGroupMarcherCollectionDragPayload = {
        ...payload,
        marcherIds: [...new Set(payload.marcherIds)],
    };
    activeLightingGroupMarcherCollectionDragPayload = normalized;
    dataTransfer.effectAllowed = "copy";
    dataTransfer.setData(
        LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME,
        JSON.stringify(normalized),
    );
}

export function clearLightingGroupMarcherCollectionDragData(): void {
    activeLightingGroupMarcherCollectionDragPayload = null;
}

export function getLightingGroupMarcherCollectionDragPayload(
    dataTransfer: DataTransfer,
): LightingGroupMarcherCollectionDragPayload | undefined {
    const raw = dataTransfer.getData(
        LIGHTING_GROUP_MARCHER_COLLECTION_DRAG_MIME,
    );
    if (raw) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isLightingGroupMarcherCollectionDragPayload(parsed)) {
                return parsed;
            }
        } catch {
            // fall through to active payload
        }
    }

    return activeLightingGroupMarcherCollectionDragPayload ?? undefined;
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

export function groupMarcherIdsForRemovalByGroup({
    marcherIds,
    membershipsByGroupId,
}: {
    marcherIds: readonly number[];
    membershipsByGroupId: Map<number, Set<number>> | undefined;
}): Map<number, number[]> {
    const draggedSet = new Set(marcherIds);
    const result = new Map<number, number[]>();

    for (const [groupId, members] of membershipsByGroupId ?? []) {
        const toRemove = [...members].filter((id) => draggedSet.has(id));
        if (toRemove.length > 0) {
            result.set(groupId, toRemove);
        }
    }

    return result;
}
