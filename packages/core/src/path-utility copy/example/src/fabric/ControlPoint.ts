import { fabric } from "fabric";
import type {
    GlobalControlPoint,
    Point,
    PointProps,
    SegmentType,
} from "../../../interfaces";

const controlPointSharedArgs: fabric.IObjectOptions = {
    originX: "center",
    originY: "center",
    hasControls: false,
    hasBorders: false,
};

export const CONTROL_POINT = "controlPoint";

export const createFabricControlPoint = ({
    controlPointObj,
    onMove,
    type,
    config,
}: {
    controlPointObj: GlobalControlPoint;
    onMove: (point: Point) => void;
    type: SegmentType;
    config: PointProps;
}): fabric.Object => {
    const args: fabric.IObjectOptions = {
        ...controlPointSharedArgs,
        hoverCursor: "move",
        left: controlPointObj.point[0],
        top: controlPointObj.point[1],
        width: config.size,
        height: config.size,
        stroke: config.color,
        strokeWidth: config.strokeWidth,
        fill: config.filled ? config.color : "transparent",
        data: {
            type: CONTROL_POINT,
            segmentIndex: controlPointObj.segmentIndex,
            pointIndex: controlPointObj.pointIndex,
        },
    };

    let fabricObject: fabric.Object;

    if (type === "curved") {
        fabricObject = new fabric.Circle({
            ...args,
            radius: config.size / 2,
        });
    } else {
        fabricObject = new fabric.Rect(args);
    }
    fabricObject.on("moving", () => {
        const centerPoint = fabricObject.getCenterPoint();
        onMove([centerPoint.x, centerPoint.y]);
    });
    return fabricObject;
};

export const SPLIT_POINT = "splitPoint";

export const createFabricSplitPoint = ({
    splitPointObj,
    type,
    config,
}: {
    splitPointObj: {
        point: Point;
        segmentIndex: number;
        splitPointIndex: number;
    };
    type: SegmentType;
    config: PointProps;
}): fabric.Object => {
    const { point, segmentIndex, splitPointIndex } = splitPointObj;

    const args: fabric.IObjectOptions = {
        ...controlPointSharedArgs,
        hoverCursor: "pointer",
        stroke: config.color,
        strokeWidth: config.strokeWidth,
        left: point[0],
        top: point[1],
        width: config.size,
        height: config.size,
        fill: config.filled ? config.color : "transparent",
        data: {
            type: SPLIT_POINT,
            segmentIndex,
            splitPointIndex,
        },
    };

    let fabricObject: fabric.Object;

    if (type === "curved") {
        fabricObject = new fabric.Circle({
            ...args,
            radius: config.size / 2,
        });
    } else {
        fabricObject = new fabric.Rect(args);
    }

    return fabricObject;
};
