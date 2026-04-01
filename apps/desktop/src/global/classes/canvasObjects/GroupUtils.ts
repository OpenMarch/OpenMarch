import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";
import CanvasProp from "./CanvasProp";

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
        if (
            object instanceof CanvasMarcher &&
            !CanvasProp.isCanvasProp(object)
        ) {
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

    // Apply counter-transforms to marchers (not props) to keep them at original size
    const decomposed = getCounterTransform(group);

    for (const obj of objects) {
        if (obj instanceof CanvasMarcher && !CanvasProp.isCanvasProp(obj)) {
            obj.scaleX = decomposed.scaleX;
            obj.scaleY = decomposed.scaleY;
            obj.skewX = decomposed.skewX;
            obj.skewY = decomposed.skewY;
            obj.angle = decomposed.angle;
            obj.updateTextLabelPosition();
            obj.setCoords();
        }
    }

    group.setCoords();
    group.canvas?.requestRenderAll();
};

export const resetMarcherRotation = (group: fabric.Group) => {
    group._objects.forEach((o) => {
        if (o instanceof CanvasMarcher && !CanvasProp.isCanvasProp(o))
            o.angle = 0;
    });
};

/**
 * Symbol keys for storing handler references on group objects.
 * Using symbols prevents conflicts with other properties.
 */
const GROUP_HANDLERS = {
    scaling: Symbol("groupScalingHandler"),
    moving: Symbol("groupMovingHandler"),
    scaled: Symbol("groupScaledHandler"),
    modified: Symbol("groupModifiedHandler"),
} as const;

/**
 * Removes any previously attached group event handlers to prevent accumulation.
 * Should be called before adding new handlers or when disposing of a group.
 */
export const cleanupGroupHandlers = (group: fabric.Group) => {
    const groupAny = group as any;

    // Remove scaling handler
    if (groupAny[GROUP_HANDLERS.scaling]) {
        group.off("scaling", groupAny[GROUP_HANDLERS.scaling]);
        delete groupAny[GROUP_HANDLERS.scaling];
    }

    // Remove moving handler
    if (groupAny[GROUP_HANDLERS.moving]) {
        group.off("moving", groupAny[GROUP_HANDLERS.moving]);
        delete groupAny[GROUP_HANDLERS.moving];
    }

    // Remove scaled handler
    if (groupAny[GROUP_HANDLERS.scaled]) {
        group.off("scaled", groupAny[GROUP_HANDLERS.scaled]);
        delete groupAny[GROUP_HANDLERS.scaled];
    }

    // Remove modified handler
    if (groupAny[GROUP_HANDLERS.modified]) {
        group.off("modified", groupAny[GROUP_HANDLERS.modified]);
        delete groupAny[GROUP_HANDLERS.modified];
    }

    // Also cleanup scaling state if present
    delete groupAny.__scalingCorner;
    delete groupAny.__originalScaleX;
    delete groupAny.__originalScaleY;
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

    // Always cleanup existing handlers first to prevent accumulation
    cleanupGroupHandlers(group);

    if (isLocked) {
        group.evented = false;
    } else {
        const groupAny = group as any;

        // Create and store handler references so they can be removed later
        const scalingHandler = (e: fabric.IEvent<Event>) =>
            handleGroupScaling(e, group);
        const movingHandler = (e: fabric.IEvent<Event>) =>
            handleGroupMoving(e, group);

        // Cleanup scaling state when scaling finishes
        const cleanupScalingState = () => {
            delete groupAny.__scalingCorner;
            delete groupAny.__originalScaleX;
            delete groupAny.__originalScaleY;
        };

        // Store handler references on the group for later cleanup
        groupAny[GROUP_HANDLERS.scaling] = scalingHandler;
        groupAny[GROUP_HANDLERS.moving] = movingHandler;
        groupAny[GROUP_HANDLERS.scaled] = cleanupScalingState;
        groupAny[GROUP_HANDLERS.modified] = cleanupScalingState;

        // Attach the handlers
        group.on("scaling", scalingHandler);
        group.on("moving", movingHandler);
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
