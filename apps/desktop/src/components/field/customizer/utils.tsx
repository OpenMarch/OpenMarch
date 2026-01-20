import React from "react";
import clsx from "clsx";
import {
    CircleIcon,
    SquareIcon,
    TriangleIcon,
    XIcon,
} from "@phosphor-icons/react";

export const inputClassname = clsx("col-span-6 self-center ");

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

export const blurOnEnterFunc = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
};
