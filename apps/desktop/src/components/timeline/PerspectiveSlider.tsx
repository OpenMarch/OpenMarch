import { Slider } from "@openmarch/ui";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";
import { T } from "@tolgee/react";
import * as Popover from "@radix-ui/react-popover";
import {
    CornersInIcon,
    CornersOutIcon,
    PerspectiveIcon,
} from "@phosphor-icons/react";

export default function PerspectiveSlider() {
    const { perspective, setPerspective } = useFullscreenStore();
    const [value, setValue] = useState(perspective);

    // Sync with external changes to perspective
    useEffect(() => {
        setValue(perspective);
    }, [perspective]);

    const handleValueChange = (values: number[]) => {
        const newValue = values[0];
        setValue(newValue);
        setPerspective(newValue);
    };

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-4 border px-16 py-12">
            <div className="text-text-subtitle text-sub flex justify-between">
                <span>
                    <T keyName="timeline.perspective.label" />
                </span>
                <span>{value}°</span>
            </div>
            <Slider
                value={[value]}
                min={0}
                max={65}
                step={1}
                onValueChange={handleValueChange}
            />
        </div>
    );
}

/**
 * Perspective as a button on the field's zoom widget (UI-12, timeline mode): it tilts the field,
 * so it lives with the field's view controls, not the timeline. A popover holds the slider and a
 * reset. The button shows the angle whenever it isn't 0°, so a tilted field is never a hidden
 * state. It works in fullscreen, where the field is tilted, and is disabled (not hidden) outside it,
 * so the widget doesn't change shape.
 */
export function PerspectiveButton() {
    const { perspective, setPerspective, isFullscreen } = useFullscreenStore();
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    data-testid="field-perspective"
                    disabled={!isFullscreen}
                    aria-label={`Perspective, ${perspective}°`}
                    title={
                        isFullscreen
                            ? `Perspective: ${perspective}°`
                            : "Perspective (fullscreen only)"
                    }
                    className="border-stroke text-text flex items-center justify-center gap-4 border-r px-8 font-mono text-[11px] transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <PerspectiveIcon size={16} />
                    {perspective !== 0 && <span>{perspective}°</span>}
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    sideOffset={6}
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-50 flex w-224 flex-col gap-8 border px-16 py-12"
                >
                    <div className="text-sub flex justify-between">
                        <span>
                            <T keyName="timeline.perspective.label" />
                        </span>
                        <span className="font-mono">{perspective}°</span>
                    </div>
                    <Slider
                        value={[perspective]}
                        min={0}
                        max={65}
                        step={1}
                        onValueChange={(values) =>
                            setPerspective(values[0] ?? 0)
                        }
                        aria-label="Perspective"
                    />
                    <button
                        type="button"
                        className="text-sub text-text-subtitle hover:text-text self-start"
                        disabled={perspective === 0}
                        onClick={() => setPerspective(0)}
                    >
                        Reset to 0°
                    </button>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** Fullscreen (UI-12, timeline mode): gives the field the room; on the field's zoom widget */
export function FullscreenButton() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    return (
        <button
            type="button"
            data-testid="field-fullscreen"
            onClick={toggleFullscreen}
            aria-label="Toggle timeline fullscreen"
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Show the panels" : "Give the field the room"}
            className="border-stroke text-text flex items-center justify-center border-r px-8 transition-colors duration-150 hover:bg-white/10"
        >
            {isFullscreen ? (
                <CornersInIcon size={16} />
            ) : (
                <CornersOutIcon size={16} />
            )}
        </button>
    );
}
