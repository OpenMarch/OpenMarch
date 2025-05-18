import { useState, useRef, useCallback } from "react";
import { Button } from "../ui/Button";
import { Info } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import {
    ColorResult,
    RgbaColor,
    rgbaToHex,
    rgbaToHsva,
    Sketch,
} from "@uiw/react-color";
import { RxReset } from "react-icons/rx";
import clsx from "clsx";
interface ColorPickerProps {
    initialColor: RgbaColor;
    label: string;
    tooltip?: string;
    defaultColor?: RgbaColor;
    onChange: (color: RgbaColor) => void;
}

const formFieldClassname = clsx("grid grid-cols-12 gap-8 h-[40px] ml-16");
const labelClassname = clsx("text-body text-text/80 self-center col-span-5");

function getContrastingColor(color: RgbaColor): string {
    return color.r * 0.299 + color.g * 0.587 + color.b * 0.114 > 186
        ? "#000000"
        : "#ffffff";
}

export default function ColorPicker({
    initialColor,
    label,
    tooltip,
    defaultColor,
    onChange,
}: ColorPickerProps) {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [currentColor, setCurrentColor] = useState<RgbaColor>(initialColor);
    const pickerRef = useRef<HTMLDivElement>(null);

    const handleClick = () => setDisplayColorPicker(true);

    const handleClose = useCallback(() => {
        setDisplayColorPicker(false);
        onChange(currentColor);
    }, [currentColor, onChange]);

    const handleChange = (color: ColorResult) => {
        setCurrentColor(color.rgba);
    };

    const handleBlur = useCallback(
        (event: React.FocusEvent) => {
            if (
                pickerRef.current &&
                !pickerRef.current.contains(event.relatedTarget)
            ) {
                handleClose();
            }
        },
        [handleClose],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleClose();
            }
        },
        [handleClose],
    );

    const resetToDefault = useCallback(() => {
        if (defaultColor) {
            setCurrentColor(defaultColor);
            onChange(defaultColor);
        }
    }, [defaultColor, onChange]);

    return (
        <div className={formFieldClassname} ref={pickerRef}>
            <div className={labelClassname}>{label}</div>
            {/* Color Preview Box */}
            <div
                className="flex-between font border-fg-2 col-span-5 flex h-24 w-full cursor-pointer items-center justify-center rounded-full border-2 py-16 font-mono text-h5 tracking-wider"
                style={{
                    backgroundColor: rgbaToHex(currentColor),
                    color: getContrastingColor(currentColor),
                }}
                onClick={handleClick}
                tabIndex={0}
            >
                {rgbaToHex(currentColor).toUpperCase()}
                {"-a"}
                {currentColor.a === 1
                    ? 1
                    : currentColor.a === 0
                      ? 0
                      : currentColor.a.toPrecision(2)}
            </div>

            {/* Color Picker Popover */}
            {displayColorPicker && (
                <div className="rounded rounded absolute left-[50%] z-10 mt-32 bg-bg-1 p-2 shadow-lg">
                    <div className="z-50 my-8 flex justify-between gap-8">
                        <Button
                            size="compact"
                            variant="secondary"
                            className="w-full"
                            onClick={() => {
                                setCurrentColor(initialColor);
                                setDisplayColorPicker(false);
                            }}
                        >
                            Discard
                        </Button>
                        <Button
                            size="compact"
                            variant="primary"
                            className="w-full"
                            onClick={handleClose}
                        >
                            Apply
                        </Button>
                    </div>
                    <Sketch
                        color={rgbaToHsva(currentColor)}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="bg-fg-2"
                    />
                </div>
            )}

            <Button
                tooltipSide="right"
                size="compact"
                tooltipText={"Reset to default"}
                variant="secondary"
                onClick={resetToDefault}
                className="col-span-1 bg-transparent"
            >
                <RxReset />
            </Button>
            {tooltip && (
                <Tooltip.TooltipProvider>
                    <Tooltip.Root>
                        <Tooltip.Trigger type="button">
                            <Info size={18} className="text-text/60" />
                        </Tooltip.Trigger>
                        <TooltipContents className="p-16" side="right">
                            {tooltip}
                        </TooltipContents>
                    </Tooltip.Root>
                </Tooltip.TooltipProvider>
            )}
        </div>
    );
}
