import {
    usePropDrawingStore,
    PropDrawingMode,
} from "@/stores/PropDrawingStore";
import { Button } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";

const INSTRUCTION_KEYS: Record<NonNullable<PropDrawingMode>, string> = {
    rectangle: "props.drawing.instructions.drag",
    circle: "props.drawing.instructions.drag",
    polygon: "props.drawing.instructions.polygon",
    arc: "props.drawing.instructions.arc",
    freehand: "props.drawing.instructions.drag",
};

export default function PropDrawingNotice() {
    const { t } = useTranslate();
    const { drawingMode, resetDrawingState } = usePropDrawingStore();

    if (!drawingMode) return null;

    return (
        <div className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed bottom-[140px] left-1/2 z-[999] flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg">
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    {t(INSTRUCTION_KEYS[drawingMode])}
                </span>
            </div>
            <Button
                size="compact"
                variant="secondary"
                onClick={resetDrawingState}
            >
                <T keyName="props.drawing.cancel" />
            </Button>
        </div>
    );
}
