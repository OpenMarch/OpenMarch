import { useLayoutEffect, useRef, type ReactNode } from "react";
import { touchReadoutPlacement } from "./readoutPlacement";
import {
    fieldLayersIn,
    type FieldLayerKind,
} from "@/components/canvas/fieldLayers";

/**
 * The layers over the field a touch readout keeps off (#936): the modifier pill, the field
 * display rail and the other controls, the toolbar panel and the task's bars
 */
export const READOUT_AVOIDS: readonly FieldLayerKind[] = [
    "pill",
    "control",
    "cover",
    "task",
    "info",
    "mover",
];

/**
 * A readout that follows a touch drag, placed clear of the finger (`touchReadoutPlacement`). It
 * measures itself before it paints, so it can center over the finger and stay inside the field.
 * Absolutely positioned in its nearest positioned ancestor, which spans the field. It keeps off the
 * layers floating over the field (`READOUT_AVOIDS`, #936).
 */
export default function ClearOfFinger({
    finger,
    bounds,
    children,
}: {
    /** The fingertip, in CSS px from the field's top left */
    finger: { x: number; y: number };
    /** The field's size in CSS px */
    bounds: { width: number; height: number };
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    // Every render: the text, and so the size, changes with the drag
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const parent = element.offsetParent;
        const { left, top } = touchReadoutPlacement(
            finger,
            { width: element.offsetWidth, height: element.offsetHeight },
            bounds,
            parent ? fieldLayersIn(parent, READOUT_AVOIDS) : [],
        );
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
    });
    return (
        <div
            ref={ref}
            className="pointer-events-none absolute top-0 left-0 z-20"
            data-testid="readoutClearOfFinger"
        >
            {children}
        </div>
    );
}
