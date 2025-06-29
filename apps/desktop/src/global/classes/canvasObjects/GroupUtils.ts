import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";

/**
 * Actions that must be taken when a group is rotated
 */
const rotationSideEffects = (group: fabric.Group) => {
    for (const object of group.getObjects()) {
        if (object instanceof CanvasMarcher) {
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

const handleGroupRotating = (e: fabric.IEvent<Event>, group: fabric.Group) => {
    const shiftKey = (e.e as MouseEvent).shiftKey;
    const angle = group.angle ?? 0;

    if (!shiftKey) {
        const snappedAngle = Math.round(angle / 15) * 15;
        group.rotate(snappedAngle);
    }
    rotationSideEffects(group);
};

const handleGroupMoving = (e: fabric.IEvent<Event>, group: fabric.Group) => {
    for (const object of group.getObjects()) {
        if (object instanceof CanvasMarcher) {
            object.updateTextLabelPosition();
        }
    }
};

export const handleGroupScaling = (
    e: fabric.IEvent<Event>,
    group: fabric.Group,
) => {
    const transformMatrix = group.calcTransformMatrix();
    const decomposed = fabric.util.qrDecompose(transformMatrix);

    for (const object of group.getObjects()) {
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
    group.hasControls = true;
    group.hasBorders = true;
    group.hasRotatingPoint = true;
    group.lockRotation = false;
    group.on("rotating", (e) => handleGroupRotating(e, group));
    group.on("scaling", (e) => handleGroupScaling(e, group));
    group.on("moving", (e) => handleGroupMoving(e, group));
};
