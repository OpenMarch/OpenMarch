import { useState, useRef, useCallback } from "react";
import { RgbaColor } from "@uiw/react-color";
import { rgbaToString } from "@/global/classes/FieldTheme";
import Sketch from "@uiw/react-color-sketch";
import { Button } from "./Button";

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
}

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [currentColor, setCurrentColor] = useState<RgbaColor>(
        stringToRgba(color),
    );
    const pickerRef = useRef<HTMLDivElement>(null);

    // Convert string color to RgbaColor object
    function stringToRgba(colorStr: string): RgbaColor {
        // Default to black if conversion fails
        const defaultColor: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };

        if (!colorStr) return defaultColor;

        // Parse rgba string like "rgba(0, 0, 0, 1)"
        const match = colorStr.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/,
        );
        if (!match) return defaultColor;

        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] ? parseFloat(match[4]) : 1,
        };
    }

    // Convert RGB components to hex
    function rgbaToHex(color: RgbaColor): string {
        return `#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
    }

    const handleClick = () => setDisplayColorPicker(true);

    const handleClose = useCallback(() => {
        setDisplayColorPicker(false);
        onChange(rgbaToString(currentColor));
    }, [currentColor, onChange]);

    const handleChange = (color: any) => {
        const newColor = color.rgba;
        setCurrentColor(newColor);
    };

    const handleCancel = () => {
        setCurrentColor(stringToRgba(color));
        setDisplayColorPicker(false);
    };

    return (
        <div className="flex flex-col" ref={pickerRef}>
            {label && (
                <label className="mb-2 text-body text-text">{label}</label>
            )}

            {/* Color Preview Box */}
            <div
                className="text-xs flex h-8 w-full cursor-pointer items-center justify-center rounded-full border border-stroke font-mono tracking-wider"
                style={{
                    backgroundColor: rgbaToHex(currentColor),
                    color:
                        currentColor.r * 0.299 +
                            currentColor.g * 0.587 +
                            currentColor.b * 0.114 >
                        186
                            ? "#000000"
                            : "#ffffff",
                }}
                onClick={handleClick}
            >
                {rgbaToHex(currentColor).toUpperCase()}
            </div>

            {/* Color Picker Popover */}
            {displayColorPicker && (
                <div className="rounded absolute z-10 mt-10 border border-stroke bg-modal shadow-lg">
                    <div className="z-50 mb-2 flex justify-between gap-2 p-2">
                        <Button
                            size="compact"
                            variant="secondary"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="compact"
                            variant="primary"
                            onClick={handleClose}
                        >
                            Apply
                        </Button>
                    </div>
                    <Sketch
                        color={rgbaToHex(currentColor)}
                        onChange={handleChange}
                        className="bg-bg-1 p-2"
                    />
                </div>
            )}
        </div>
    );
}
