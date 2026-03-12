import {
    usePropDrawingStore,
    PropDrawingMode,
} from "@/stores/PropDrawingStore";
import { Button } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";

const INSTRUCTIONS: Record<NonNullable<PropDrawingMode>, string> = {
    rectangle: "Click and drag to draw. Press Esc to cancel.",
    circle: "Click and drag to draw. Press Esc to cancel.",
    polygon:
        "Click to add points. Double-click to finish. Press Esc to cancel.",
    arc: "Click 3 points: start, end, then curve. Press Esc to cancel.",
    freehand: "Click and drag to draw. Press Esc to cancel.",
};

export default function PropDrawingNotice() {
    const { drawingMode, resetDrawingState } = usePropDrawingStore();

    if (!drawingMode) return null;

    return (
        <div className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed bottom-[140px] left-1/2 z-[999] flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg">
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    {INSTRUCTIONS[drawingMode]}
                </span>
            </div>
            <Button
                size="compact"
                variant="secondary"
                onClick={resetDrawingState}
            >
                Cancel Drawing
            </Button>
        </div>
    );
}
