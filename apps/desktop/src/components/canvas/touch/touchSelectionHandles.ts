import { fabric } from "fabric";

/** Smallest selection box (screen px) a finger can grab handles on */
export const TOUCH_MIN_BOX_PX = 48;
/** Hit size (screen px) of a handle for a finger */
export const TOUCH_HANDLE_HIT_PX = 40;
/** How far (screen px) the rotate handle sits above the box for a finger: clear of labels, and less touchy */
export const TOUCH_ROTATE_OFFSET_PX = 96;
/** Handles sit at least this far (screen px) outside the marchers for a finger */
export const TOUCH_HANDLE_CLEARANCE_PX = 20;

/**
 * Padding (screen px) that grows a selection box to at least `minPx` on its
 * shorter side, so its handles don't stack on top of each other.
 */
export function paddingForMinimumBox(
    widthPx: number,
    heightPx: number,
    minPx = TOUCH_MIN_BOX_PX,
): number {
    const shorter = Math.min(widthPx, heightPx);
    if (!Number.isFinite(shorter)) return 0;
    return Math.max(0, (minPx - shorter) / 2);
}

let touchControls: Record<string, fabric.Control> | null = null;
const getTouchControls = () => {
    if (!touchControls) {
        const base = fabric.Object.prototype.controls;
        touchControls = {
            ...base,
            mtr: new fabric.Control({
                ...(base.mtr as unknown as Record<string, unknown>),
                offsetY: -TOUCH_ROTATE_OFFSET_PX,
            }),
        };
    }
    return touchControls;
};

/**
 * Sizes a multi-selection's handles for fingers (touch mode) or puts them back
 * (mouse): a larger hit area, a box at least TOUCH_MIN_BOX_PX on each side,
 * and the rotate handle further out, which also makes rotation less touchy.
 */
export function applyTouchHandleSizing(
    group: fabric.Object,
    zoom: number,
    touch: boolean,
) {
    const g = group as fabric.Object & {
        controls: Record<string, fabric.Control>;
        touchCornerSize: number;
    };
    if (!touch) {
        if (Object.prototype.hasOwnProperty.call(g, "controls"))
            delete (g as any).controls;
        delete (g as any).touchCornerSize;
        g.padding = 0;
        g.setCoords();
        return;
    }
    g.controls = getTouchControls();
    g.touchCornerSize = TOUCH_HANDLE_HIT_PX;
    g.padding = Math.max(
        TOUCH_HANDLE_CLEARANCE_PX,
        paddingForMinimumBox(
            (g.width ?? 0) * Math.abs(g.scaleX ?? 1) * zoom,
            (g.height ?? 0) * Math.abs(g.scaleY ?? 1) * zoom,
        ),
    );
    g.setCoords();
}
