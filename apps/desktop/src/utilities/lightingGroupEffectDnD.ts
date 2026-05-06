/** MIME type for HTML5 drag from lighting group rows to timeline effect bars. */
export const LIGHTING_GROUP_DRAG_MIME =
    "application/x-openmarch-lighting-group";

export type LightingGroupDragPayload = {
    groupId: number;
    sceneId: number;
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
