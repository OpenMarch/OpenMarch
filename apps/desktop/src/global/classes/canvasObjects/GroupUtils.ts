import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";

/**
 * Checks if a group contains any CanvasMarcher objects.
 * Used to determine if marcher-specific transformation logic should apply.
 */
const groupContainsMarchers = (group: fabric.Group): boolean => {
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return false;
    return objects.some((obj) => obj instanceof CanvasMarcher);
};

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
 * Actions that must be taken when a group is rotated.
 * Unlike scaling, rotation should keep marchers at their original size and shape.
 * We only apply the counter-rotation angle so marchers appear upright.
 */
const rotationSideEffects = (group: fabric.Group) => {
    if (!group || typeof group.getObjects !== "function") return;
    const objects = group.getObjects?.();
    if (!Array.isArray(objects)) return;

    const decomposed = getCounterTransform(group);

    for (const object of objects) {
        if (object instanceof CanvasMarcher) {
            // Apply counter-rotation to keep marchers appearing upright
            object.angle = decomposed.angle;

            // Apply counter-scale and skew to prevent any distortion during rotation.
            // This is necessary because the group may have non-1 scale values from
            // a previous scaling operation that we need to counteract.
            object.scaleX = decomposed.scaleX;
            object.scaleY = decomposed.scaleY;
            object.skewX = decomposed.skewX;
            object.skewY = decomposed.skewY;

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

    // Only apply axis-locking for groups containing marchers (not shapes)
    const hasMarchers = groupContainsMarchers(group);

    if (hasMarchers) {
        // Get the corner being dragged from the transform
        const transform = (group.canvas as any)?._currentTransform;
        const corner = transform?.corner;
        const shiftKey = (e.e as MouseEvent)?.shiftKey;

        // Track the scaling corner on first frame
        if (corner && !(group as any).__scalingCorner) {
            (group as any).__scalingCorner = corner;
            (group as any).__originalScaleX = group.scaleX ?? 1;
            (group as any).__originalScaleY = group.scaleY ?? 1;
        }

        const scalingCorner = (group as any).__scalingCorner;
        const originalScaleX = (group as any).__originalScaleX ?? 1;
        const originalScaleY = (group as any).__originalScaleY ?? 1;

        // Block all scaling when Shift is held on middle handles
        // Shift+click on scale handles should not be allowed
        if (
            shiftKey &&
            (scalingCorner === "ml" ||
                scalingCorner === "mr" ||
                scalingCorner === "mt" ||
                scalingCorner === "mb")
        ) {
            group.scaleX = originalScaleX;
            group.scaleY = originalScaleY;
            return; // Don't process any further
        }

        // For middle handles (without Shift), lock the non-dragged axis
        if (scalingCorner === "ml" || scalingCorner === "mr") {
            group.scaleY = originalScaleY;
        } else if (scalingCorner === "mt" || scalingCorner === "mb") {
            group.scaleX = originalScaleX;
        }
    }

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

    // Disable Shift key uniform scaling - we handle axis locking ourselves
    (group as any).uniScaleKey = null;

    // Prevent scaling to negative values (flipping) when dragging past center
    group.lockScalingFlip = true;

    if (isLocked) {
        group.evented = false;
    } else {
        group.on("scaling", (e) => handleGroupScaling(e, group));
        group.on("moving", (e) => handleGroupMoving(e, group));

        // Cleanup scaling state when scaling finishes
        const cleanupScalingState = () => {
            delete (group as any).__scalingCorner;
            delete (group as any).__originalScaleX;
            delete (group as any).__originalScaleY;
        };
        group.on("scaled", cleanupScalingState);
        group.on("modified", cleanupScalingState);
    }

    // rotation is handled in handleObjectMoving in Canvas.tsx
};

const anyObjectsAreLocked = (group: fabric.Group): boolean => {
    for (const obj of group._objects) {
        if ((obj as any).locked) return true;
    }
    return false;
};
