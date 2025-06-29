import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";

export const rotateGroup = ({
    group,
    centerOffset,
    angle,
}: {
    group: fabric.Group;
    centerOffset?: { x: number; y: number };
    angle: number;
}) => {
    group.rotate(angle);
    group.setCoords();
    group.canvas?.requestRenderAll();
};

// const handleGroupModified = (e: fabric.IEvent<Event>) => {
//     const group = e.target as fabric.Group;
//     const canvas: OpenMarchCanvas = group.canvas as OpenMarchCanvas;
//     console.log("canvas", canvas.getCanvasMarchers());
//     console.log("modified", e);
// };

const handleGroupRotating = (e: fabric.IEvent<Event>, group: fabric.Group) => {
    const shiftKey = (e.e as MouseEvent).shiftKey;
    const angle = group.angle ?? 0;

    if (!shiftKey) {
        const snappedAngle = Math.round(angle / 15) * 15;
        group.rotate(snappedAngle);
    }

    group.setCoords();
    group.canvas?.requestRenderAll();
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
    console.log("transform", transformMatrix);
    const scaleX = transformMatrix[0];
    const scaleY = transformMatrix[3];

    console.debug("SCALE X", scaleX);
    console.debug("SCALE Y", scaleY);
    for (const object of group.getObjects()) {
        console.debug("original scale", object.scaleX, object.scaleY);
        object.scaleX = 1;
        object.scaleY = 1;
        // Apply the inverse scale to the child so it visually stays the same size
        object.scaleX = 1 / scaleX;
        object.scaleY = 1 / scaleY;

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
