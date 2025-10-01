import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";

/**
 * Actions that must be taken when a group is rotated
 */
const rotationSideEffects = (group: fabric.Group) => {
    if (!group || typeof group.getObjects !== "function") return;
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return;
    for (const object of objects) {
        if (object instanceof CanvasMarcher) {
            object.updateTextLabelPosition();
            object.angle = -(group.angle ?? 0); // Keeps the marcher dot upright
        }
    }
    group.setCoords();
    group.canvas?.requestRenderAll();
};

export const rotateGroup = ({
    group,
    angle,
}: {
    group: fabric.Group;
    angle: number;
}) => {
    group.rotate(angle);
    rotationSideEffects(group);
};

/**
 * Handles the rotation of a group in the canvas. Is called in handleObjectMoving in Canvas.tsx
 */
export const handleGroupRotating = (
    e: fabric.IEvent<Event>,
    group: fabric.Group,
) => {
    const shiftKey = (e.e as MouseEvent).shiftKey;
    const angle = group.angle ?? 0;

    if (!shiftKey) {
        const snappedAngle = Math.round(angle / 15) * 15;
        group.rotate(snappedAngle);
    }
    rotationSideEffects(group);
};

const handleGroupMoving = (e: fabric.IEvent<Event>, group: fabric.Group) => {
    if (!group || typeof group.getObjects !== "function") return;
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return;
    for (const object of objects) {
        if (object instanceof CanvasMarcher) {
            object.updateTextLabelPosition();
        }
    }
};

export const handleGroupScaling = (
    e: fabric.IEvent<Event>,
    group: fabric.Group,
) => {
    if (!group || typeof group.getObjects !== "function") return;
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return;
    const transformMatrix = group.calcTransformMatrix();
    const decomposed = fabric.util.qrDecompose(transformMatrix);

    for (const object of objects) {
        // Apply the inverse scale to the child so it visually stays the same size
        object.scaleX = 1 / decomposed.scaleX;
        object.scaleY = 1 / decomposed.scaleY;

        // Optionally, update position if needed (usually not necessary for simple groups)
        object.setCoords();
    }

    // Reset the group's scale to 1 so the frame stays at the new size
    group.setCoords();
    group.canvas?.requestRenderAll();
};

export const resetMarcherRotation = (group: fabric.Group) => {
    group._objects.forEach((o) => {
        if (o instanceof CanvasMarcher) o.angle = 0;
    });
};

export const setGroupAttributes = (group: fabric.Group) => {
    const isLocked = anyObjectsAreLocked(group);
    group.hasControls = !isLocked;
    group.hasBorders = true;
    group.hasRotatingPoint = !isLocked;
    group.lockRotation = isLocked; // Lock rotation if locked
    (group as any).locked = isLocked;

    if (isLocked) {
        group.evented = false;
    } else {
        group.on("scaling", (e) => handleGroupScaling(e, group));
        group.on("moving", (e) => handleGroupMoving(e, group));
    }

    // rotation is handled in handleObjectMoving in Canvas.tsx
};

const anyObjectsAreLocked = (group: fabric.Group): boolean => {
    for (const obj of group._objects) {
        if ((obj as any).locked) return true;
    }
    return false;
};
