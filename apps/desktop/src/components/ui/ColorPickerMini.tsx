import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@openmarch/ui";
import {
    CheckIcon,
    TrashSimpleIcon,
    ArrowUUpLeftIcon,
} from "@phosphor-icons/react";
import {
    ColorResult,
    RgbaColor,
    rgbaToHex,
    rgbaToHsva,
    Sketch,
} from "@uiw/react-color";
import * as Popover from "@radix-ui/react-popover";
import { T, useTolgee } from "@tolgee/react";
import { twMerge } from "tailwind-merge";

interface ColorPickerMiniProps {
    initialColor: RgbaColor | null;
    label: string;
    tooltip?: string;
    onChange?: (color: RgbaColor | null) => void;
    onBlur?: (color: RgbaColor | null) => void;
    className?: string;
}

function getContrastingColor(color: RgbaColor): string {
    return color.r * 0.299 + color.g * 0.587 + color.b * 0.114 > 186
        ? "#000000"
        : "#ffffff";
}

/**
 *
 * @param initialColor - The initial color of the color picker
 * @param label - The label of the color picker
 * @param tooltip - The tooltip of the color picker
 * @param defaultColor - The default color of the color picker
 * @param onChange - The function to call when the color changes
 * @param className - The class name of the color picker
 * @param size - Compact or default
 * @param doNotUseForm - Whether to use the form field or not (if true, the color picker will not be inside a form field)
 * @returns
 */
export default function ColorPickerMini({
    initialColor,
    label,
    onChange,
    onBlur,
    className,
}: ColorPickerMiniProps) {
    const [currentColor, setCurrentColor] = useState<RgbaColor | null>(
        initialColor,
    );
    const pickerRef = useRef<HTMLDivElement>(null);
    const { t } = useTolgee();
    const handleClose = useCallback(
        (color?: RgbaColor | null) => {
            // If a color is provided, use that
            onChange && onChange(color !== undefined ? color : currentColor);
            onBlur && onBlur(color !== undefined ? color : currentColor);
        },
        [currentColor, onBlur, onChange],
    );

    useEffect(() => {
        setCurrentColor(initialColor);
    }, [initialColor]);

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

    return (
        <div className={twMerge("flex items-center gap-8", className)}>
            <Popover.Root>
                <Popover.Trigger
                    className={twMerge(
                        "flex-between text-text font border-stroke text-body rounded-6 col-span-5 flex h-fit w-fit cursor-pointer items-center justify-center border px-12 py-6 leading-none",
                        !currentColor &&
                            "text-text-subtitle border-text-subtitle border border-dashed",
                    )}
                    style={{
                        backgroundColor: currentColor
                            ? rgbaToHex(currentColor)
                            : "transparent",
                        color: currentColor
                            ? getContrastingColor(currentColor)
                            : "",
                    }}
                    tabIndex={0}
                >
                    {label}
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        align="start"
                        side="bottom"
                        sideOffset={8}
                        collisionPadding={20}
                        avoidCollisions={true}
                        className="rounded-6 shadow-modal animate-fade-in z-50 bg-white p-2"
                    >
                        <div className="z-50 my-8 flex items-center justify-between px-12">
                            <Popover.Close
                                className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-red-800"
                                onClick={() => {
                                    setCurrentColor(initialColor);
                                }}
                            >
                                <T keyName="colorPicker.discard" />
                                <TrashSimpleIcon size={22} />
                            </Popover.Close>
                            <Popover.Close
                                className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-green-800"
                                onClick={() => handleClose(currentColor)}
                            >
                                <T keyName="colorPicker.save" />
                                <CheckIcon size={22} />
                            </Popover.Close>
                        </div>
                        <Sketch
                            color={rgbaToHsva(
                                currentColor ?? { r: 0, g: 0, b: 0, a: 1 },
                            )}
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
                tooltipText={t("colorPicker.removeSetting")}
                variant="secondary"
                onClick={() => {
                    setCurrentColor(null);
                    handleClose(null);
                }}
                className="rounded-6 hover:text-accent h-full border-0 bg-transparent transition-colors duration-150 ease-out"
                content="icon"
            >
                <ArrowUUpLeftIcon size={20} />
            </Button>
        </div>
    );
}
