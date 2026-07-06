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
import FormField, { StaticFormField } from "./FormField";
import { T } from "@tolgee/react";

interface ColorPickerProps {
    initialColor: RgbaColor;
    label: string;
    tooltip?: string;
    defaultColor?: RgbaColor;
    onChange?: (color: RgbaColor) => void;
    onBlur?: (color: RgbaColor) => void;
    className?: string;
    doNotUseForm?: boolean;
    disableAlpha?: boolean;
}

type CloseAction = "save" | "discard";

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
export default function ColorPicker({
    initialColor,
    label,
    tooltip,
    defaultColor,
    onChange,
    onBlur,
    className,
    doNotUseForm = false,
    disableAlpha = false,
}: ColorPickerProps) {
    const [open, setOpen] = useState(false);
    const [currentColor, setCurrentColor] = useState<RgbaColor>(initialColor);
    const pickerRef = useRef<HTMLDivElement>(null);
    const currentColorRef = useRef<RgbaColor>(initialColor);
    const closeActionRef = useRef<CloseAction | null>(null);

    // Sync from props only while the popover is closed (avoid mid-edit resets after save).
    useEffect(() => {
        if (open) return;
        currentColorRef.current = initialColor;
        setCurrentColor(initialColor);
    }, [initialColor, open]);

    const commitColor = useCallback(() => {
        const color = currentColorRef.current;
        onChange?.(color);
        onBlur?.(color);
    }, [onBlur, onChange]);

    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            if (nextOpen) {
                closeActionRef.current = null;
                currentColorRef.current = initialColor;
                setCurrentColor(initialColor);
                setOpen(true);
                return;
            }

            if (!open) return;

            const action = closeActionRef.current;
            closeActionRef.current = null;

            if (action !== "discard") {
                commitColor();
            }
            setOpen(false);
        },
        [commitColor, initialColor, open],
    );

    const handleSaveClick = useCallback(() => {
        closeActionRef.current = "save";
    }, []);

    const handleDiscardClick = useCallback(() => {
        closeActionRef.current = "discard";
        currentColorRef.current = initialColor;
        setCurrentColor(initialColor);
    }, [initialColor]);

    const handleChange = (color: ColorResult) => {
        const next = disableAlpha ? { ...color.rgba, a: 1 } : color.rgba;
        currentColorRef.current = next;
        setCurrentColor(next);
    };

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === "Enter") {
                event.preventDefault();
                closeActionRef.current = "save";
                handleOpenChange(false);
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeActionRef.current = "discard";
                currentColorRef.current = initialColor;
                setCurrentColor(initialColor);
                handleOpenChange(false);
            }
        },
        [handleOpenChange, initialColor],
    );

    const resetToDefault = useCallback(() => {
        if (!defaultColor) return;
        currentColorRef.current = defaultColor;
        setCurrentColor(defaultColor);
        commitColor();
    }, [commitColor, defaultColor]);

    const internalComponent = (
        <DefaultColorPicker
            open={open}
            onOpenChange={handleOpenChange}
            currentColor={currentColor}
            disableAlpha={disableAlpha}
            onSaveClick={handleSaveClick}
            onDiscardClick={handleDiscardClick}
            handleKeyDown={handleKeyDown}
            resetToDefault={defaultColor ? resetToDefault : undefined}
            handleChange={handleChange}
        />
    );

    if (doNotUseForm)
        return (
            <StaticFormField
                label={label}
                tooltip={tooltip}
                className={className}
                ref={pickerRef}
            >
                {internalComponent}
            </StaticFormField>
        );
    else
        return (
            <FormField
                label={label}
                tooltip={tooltip}
                ref={pickerRef}
                className={className}
            >
                {internalComponent}
            </FormField>
        );
}

type InternalPickerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentColor: RgbaColor;
    disableAlpha: boolean;
    onSaveClick: () => void;
    onDiscardClick: () => void;
    handleKeyDown: (event: React.KeyboardEvent) => void;
    resetToDefault?: () => void;
    handleChange: (color: ColorResult) => void;
};

function DefaultColorPicker({
    open,
    onOpenChange,
    currentColor,
    disableAlpha,
    onSaveClick,
    onDiscardClick,
    handleKeyDown,
    resetToDefault,
    handleChange,
}: InternalPickerProps) {
    return (
        <div className="flex items-center gap-8">
            <Popover.Root open={open} onOpenChange={onOpenChange}>
                <Popover.Trigger
                    className="flex-between font border-stroke text-body rounded-6 col-span-5 flex h-fit w-fit cursor-pointer items-center justify-center border px-12 py-6 font-mono leading-none"
                    style={{
                        backgroundColor: rgbaToHex(currentColor),
                        color: getContrastingColor(currentColor),
                    }}
                    tabIndex={0}
                >
                    {rgbaToHex(currentColor).toUpperCase()}
                    {!disableAlpha && (
                        <>
                            {"-a"}
                            {currentColor.a === 1
                                ? 1
                                : currentColor.a === 0
                                  ? 0
                                  : currentColor.a.toPrecision(2)}
                        </>
                    )}
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        align="start"
                        side="bottom"
                        sideOffset={8}
                        collisionPadding={20}
                        avoidCollisions={true}
                        className="rounded-6 shadow-modal animate-fade-in z-50 bg-white p-2"
                        onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                        <div className="z-50 my-8 flex items-center justify-between px-12">
                            <Popover.Close
                                className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-red-800"
                                onClick={onDiscardClick}
                            >
                                <T keyName="colorPicker.discard" />
                                <TrashSimpleIcon size={22} />
                            </Popover.Close>
                            <Popover.Close
                                className="text-sub flex w-fit items-center gap-4 text-black duration-150 ease-out hover:text-green-800"
                                onClick={onSaveClick}
                            >
                                <T keyName="colorPicker.save" />
                                <CheckIcon size={22} />
                            </Popover.Close>
                        </div>
                        <Sketch
                            color={rgbaToHsva(currentColor)}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            disableAlpha={disableAlpha}
                            className="bg-fg-2"
                        />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            <Button
                tooltipSide="right"
                size="compact"
                hidden={resetToDefault == null}
                tooltipText={"Reset to default"}
                variant="secondary"
                onClick={resetToDefault}
                className="rounded-6 h-full"
                content="icon"
            >
                <ArrowUUpLeftIcon size={20} />
            </Button>
        </div>
    );
}
