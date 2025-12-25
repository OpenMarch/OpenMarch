import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";

/**
 * Calculates the inverse transform of the group to counteract distortion on child objects.
 * This should be used when you want the children to move with the group but not inherit its
 * scale, rotation, or skew (e.g. dots in a formation).
 */
const getCounterTransform = (group: fabric.Group) => {
    // Calculate the inverse of the group's shape transform (rotation, scale, skew)
    const groupMatrix = group.calcTransformMatrix();
    // Zero out translation components (indexes 4 and 5) because we want the children
    // to move with the group, but not distort with it.
    const shapeMatrix = [...groupMatrix];
    shapeMatrix[4] = 0;
    shapeMatrix[5] = 0;

    const invertedMatrix = fabric.util.invertTransform(shapeMatrix);
    return fabric.util.qrDecompose(invertedMatrix);
};

/**
 * Actions that must be taken when a group is rotated
 */
const rotationSideEffects = (group: fabric.Group) => {
    if (!group || typeof group.getObjects !== "function") return;
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return;

    const decomposed = getCounterTransform(group);

    for (const object of objects) {
        if (object instanceof CanvasMarcher) {
            object.scaleX = decomposed.scaleX;
            object.scaleY = decomposed.scaleY;
            object.skewX = decomposed.skewX;
            object.skewY = decomposed.skewY;
            object.angle = decomposed.angle;

            object.updateTextLabelPosition();
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

    const decomposed = getCounterTransform(group);

    for (const object of objects) {
        if (object instanceof CanvasMarcher) {
            // Apply the inverted properties to counteract group distortion
            object.scaleX = decomposed.scaleX;
            object.scaleY = decomposed.scaleY;
            object.skewX = decomposed.skewX;
            object.skewY = decomposed.skewY;
            object.angle = decomposed.angle;

            object.updateTextLabelPosition();
            object.setCoords();
        }
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
