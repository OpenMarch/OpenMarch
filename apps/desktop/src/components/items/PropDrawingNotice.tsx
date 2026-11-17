import { Button, getButtonClassName } from "@openmarch/ui";
import { useFieldLayerRef } from "@/components/canvas/fieldLayers";
import { InfoIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { useIsTouchMode } from "@/stores/InputModeStore";
import ActionButton from "@/shortcuts/ActionButton";
import type { OutlineType } from "@/db-functions/items";

const INSTRUCTION_KEYS: Record<OutlineType, string> = {
    rectangle: "props.draw.instructions.drag",
    circle: "props.draw.instructions.circle",
    polygon: "props.draw.instructions.polygon",
    arc: "props.draw.instructions.arc",
    freehand: "props.draw.instructions.drag",
};

/** The touch layout's words where they differ: taps, and the Finish button for a double-click. */
const TOUCH_INSTRUCTION_KEYS: Partial<Record<OutlineType, string>> = {
    polygon: "props.draw.instructions.polygonTouch",
    arc: "props.draw.instructions.arcTouch",
};

/** Outlines drawn corner by corner, whose last corner can be taken back. */
const CLICKED: ReadonlySet<OutlineType> = new Set(["polygon", "arc"]);

/**
 * How to draw the chosen Outline, or place the chosen equipment, with a way
 * out, while the prop drawing tool is on. In the touch layout, where there's
 * no double-click to rely on, a corner-by-corner Outline also gets Undo point,
 * and a polygon Finish (tablet 1.4).
 */
export default function PropDrawingNotice() {
    const { t } = useTranslate();
    const drawingMode = useItemDrawingStore((s) => s.drawingMode);
    const placing = useItemDrawingStore((s) => s.placing);
    const reset = useItemDrawingStore((s) => s.resetDrawingState);
    const touch = useIsTouchMode();
    const layerRef = useFieldLayerRef<HTMLDivElement>();
    if (!drawingMode) return null;
    const instructions =
        (touch ? TOUCH_INSTRUCTION_KEYS[drawingMode] : undefined) ??
        INSTRUCTION_KEYS[drawingMode];
    const actionClass = (variant: "primary" | "secondary") =>
        // text-body after twMerge, which drops it (docs/conventions/ui-styling.md)
        `${getButtonClassName({ variant, size: "compact" })} text-body w-full`;
    return (
        <div
            ref={layerRef}
            // #927: the zoom box and the pill keep off its buttons
            data-field-layer="task"
            className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed bottom-[140px] left-1/2 z-[999] flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg"
        >
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    {placing
                        ? t("frontEnsemble.placeInstructions", {
                              name: placing.baseName,
                          })
                        : t(instructions)}
                </span>
            </div>
            {touch && CLICKED.has(drawingMode) && (
                <div className="flex gap-8">
                    <ActionButton
                        action="propRemoveLastPoint"
                        className={actionClass("secondary")}
                        data-testid="prop-draw-undo-point"
                    >
                        <T keyName="props.draw.undoPoint" />
                    </ActionButton>
                    {drawingMode === "polygon" && (
                        <ActionButton
                            action="propFinishDrawing"
                            className={actionClass("primary")}
                            data-testid="prop-draw-finish"
                        >
                            <T keyName="props.draw.finish" />
                        </ActionButton>
                    )}
                </div>
            )}
            <Button size="compact" variant="secondary" onClick={reset}>
                <T keyName="props.draw.cancel" />
            </Button>
        </div>
    );
}
