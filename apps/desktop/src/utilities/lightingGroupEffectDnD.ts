/** MIME type for HTML5 drag from lighting group rows to timeline effect bars. */
export const LIGHTING_GROUP_DRAG_MIME =
    "application/x-openmarch-lighting-group";

export type LightingGroupDragPayload = {
    groupId: number;
    sceneId: number;
};

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

function isLightingGroupDragPayload(
    value: unknown,
): value is LightingGroupDragPayload {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    return (
        typeof r.groupId === "number" &&
        Number.isFinite(r.groupId) &&
        typeof r.sceneId === "number" &&
        Number.isFinite(r.sceneId)
    );
}

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

/** Returns true if this drag interaction carries a lighting group payload (for dragOver). */
export function dataTransferHasLightingGroupDrag(
    dataTransfer: DataTransfer,
): boolean {
    return dataTransfer.types.includes(LIGHTING_GROUP_DRAG_MIME);
}

export function setLightingGroupDragData(
    dataTransfer: DataTransfer,
    payload: LightingGroupDragPayload,
): void {
    dataTransfer.effectAllowed = "copy";
    dataTransfer.setData(LIGHTING_GROUP_DRAG_MIME, JSON.stringify(payload));
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

export function getLightingGroupDragPayload(
    dataTransfer: DataTransfer,
): LightingGroupDragPayload | undefined {
    const raw = dataTransfer.getData(LIGHTING_GROUP_DRAG_MIME);
    if (!raw) return undefined;
    try {
        const parsed: unknown = JSON.parse(raw);
        return isLightingGroupDragPayload(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

/** Selectors for controls that must not initiate a row drag (buttons, inputs, links). */
const INTERACTIVE_DRAG_CANCEL_SELECTOR =
    "button, input, textarea, select, a[href], [contenteditable='true'], [role='button']";

/** True when drag began on a control—call `preventDefault()` on `dragstart` to keep clicks working. */
export function shouldCancelLightingGroupDragStart(
    target: EventTarget | null,
): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest(INTERACTIVE_DRAG_CANCEL_SELECTOR) != null;
}
