import React from "react";
import {
    CircleIcon,
    SquareIcon,
    TriangleIcon,
    XIcon,
} from "@phosphor-icons/react";

export const shapeOptions = ["circle", "square", "triangle", "x"] as const;

export const shapeIcons: Record<
    (typeof shapeOptions)[number],
    React.ReactNode
> = {
    circle: <CircleIcon size={18} />,
    square: <SquareIcon size={18} />,
    triangle: <TriangleIcon size={18} />,
    x: <XIcon size={18} />,
};
