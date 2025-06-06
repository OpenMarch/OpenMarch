import React from "react";

interface SliderProps {
    value?: number[];
    defaultValue?: number[];
    min?: number;
    max?: number;
    step?: number;
    onValueChange?: (value: number[]) => void;
    className?: string;
    disabled?: boolean;
    "aria-label"?: string;
}

export function Slider({
    value,
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    onValueChange,
    className,
    disabled,
    "aria-label": ariaLabel,
}: SliderProps) {
    const currentValue = value?.[0] ?? defaultValue?.[0] ?? min;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseFloat(event.target.value);
        onValueChange?.([newValue]);
    };

    return (
        <div className={`relative flex w-full items-center ${className || ""}`}>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={currentValue}
                onChange={handleChange}
                disabled={disabled}
                aria-label={ariaLabel}
                className="bg-stroke focus:ring-accent/50 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:hover:bg-accent/80 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:hover:bg-accent/80 h-2 w-full cursor-pointer appearance-none rounded-lg focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
            />
        </div>
    );
}
