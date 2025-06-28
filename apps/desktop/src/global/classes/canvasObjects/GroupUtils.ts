import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";

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
    for (const object of group.getObjects()) {
        object.rotate(-angle);
        object.setCoords();
    }
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
    const currentAngle = group.angle ?? 0;
    for (const object of group.getObjects()) {
        object.rotate(-currentAngle);
        object.setCoords();
    }
    group.setCoords();
    group.canvas?.requestRenderAll();
};

export const setGroupAttributes = (group: fabric.Group) => {
    group.hasControls = true;
    group.hasBorders = true;
    group.hasRotatingPoint = true;
    group.lockRotation = false;
    group.on("rotating", (e) => handleGroupRotating(e, group));

    // group.on("modified", handleGroupModified);
};
