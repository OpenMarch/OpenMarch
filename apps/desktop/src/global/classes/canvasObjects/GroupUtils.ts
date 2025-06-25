import { fabric } from "fabric";

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
