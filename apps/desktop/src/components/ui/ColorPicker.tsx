import { useState, useRef, useCallback } from "react";
import { Button } from "@openmarch/ui";
import {
    CheckIcon,
<<<<<<< HEAD
=======
    InfoIcon,
>>>>>>> c1252eb (fix color picker & section styles modal)
    TrashSimpleIcon,
    ArrowUUpLeftIcon,
} from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "@openmarch/ui";
import {
    ColorResult,
    RgbaColor,
    rgbaToHex,
    rgbaToHsva,
    Sketch,
} from "@uiw/react-color";
<<<<<<< HEAD
import * as Popover from "@radix-ui/react-popover";
import FormField from "./FormField";
=======
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import * as Popover from "@radix-ui/react-popover";
>>>>>>> c1252eb (fix color picker & section styles modal)

interface ColorPickerProps {
    initialColor: RgbaColor;
    label: string;
    tooltip?: string;
    defaultColor?: RgbaColor;
    onChange: (color: RgbaColor) => void;
    className?: string;
}

<<<<<<< HEAD
=======
const formFieldClassname = clsx("flex justify-between items-center gap-12");
const labelClassname = clsx("text-body text-text/80 self-center");

>>>>>>> c1252eb (fix color picker & section styles modal)
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
    className,
}: ColorPickerProps) {
    const [currentColor, setCurrentColor] = useState<RgbaColor>(initialColor);
    const pickerRef = useRef<HTMLDivElement>(null);

    const handleClose = useCallback(() => {
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
        <FormField
            label={label}
            tooltip={tooltip}
            ref={pickerRef}
            className={className}
        >
            <div className="flex items-center gap-8">
                <Popover.Root>
                    <Popover.Trigger
                        className="flex-between font border-stroke text-body rounded-6 col-span-5 flex h-fit w-fit cursor-pointer items-center justify-center border px-12 py-6 font-mono leading-none"
                        style={{
                            backgroundColor: rgbaToHex(currentColor),
                            color: getContrastingColor(currentColor),
                        }}
                        tabIndex={0}
                    >
                        {rgbaToHex(currentColor).toUpperCase()}
                        {"-a"}
                        {currentColor.a === 1
                            ? 1
                            : currentColor.a === 0
                              ? 0
                              : currentColor.a.toPrecision(2)}
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content
                            align="start"
                            className="rounded-6 shadow-modal animate-fade-in absolute z-50 mt-8 bg-white p-2"
                        >
                            <div className="z-50 my-8 flex items-center justify-between px-12">
                                <Popover.Close
                                    className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-red-800"
                                    onClick={() => {
                                        setCurrentColor(initialColor);
                                    }}
                                >
                                    Discard
                                    <TrashSimpleIcon size={22} />
                                </Popover.Close>
                                <Popover.Close
                                    className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-green-800"
                                    onClick={handleClose}
                                >
                                    Save
                                    <CheckIcon size={22} />
                                </Popover.Close>
                            </div>
                            <Sketch
                                color={rgbaToHsva(currentColor)}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                onKeyDown={handleKeyDown}
                                className="bg-fg-2"
                            />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                <Button
                    tooltipSide="right"
                    size="compact"
                    tooltipText={"Reset to default"}
                    variant="secondary"
                    onClick={resetToDefault}
                    className="rounded-6 h-full"
                    content="icon"
                >
                    <ArrowUUpLeftIcon size={20} />
                </Button>
            </div>
        </FormField>
    );
}
