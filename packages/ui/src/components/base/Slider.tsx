import React, { useEffect, useRef, useState } from "react";

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
    const initialValue = value?.[0] ?? defaultValue?.[0] ?? min;
    const [currentValue, setCurrentValue] = useState(initialValue);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (value) {
            setCurrentValue(value[0]);
        }
    }, [value]);

    useEffect(() => {
        if (ref.current) {
            const percentage = ((currentValue - min) / (max - min)) * 100;
            ref.current.style.background = `linear-gradient(to right, var(--color-accent) ${percentage}%, var(--color-stroke) ${percentage}%)`;
        }
    }, [currentValue, min, max]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseFloat(event.target.value);
        setCurrentValue(newValue);
        onValueChange?.([newValue]);
    };

    return (
        <div className={`relative flex w-full items-center ${className || ""}`}>
            <input
                ref={ref}
                type="range"
                min={min}
                max={max}
                step={step}
                value={currentValue}
                onChange={handleChange}
                // This doesn't work currently
                disabled={disabled}
                aria-label={ariaLabel}
                className="bg-stroke focus:ring-accent/50 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:hover:bg-accent/80 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:hover:bg-accent/80 h-3 w-full cursor-pointer appearance-none rounded-lg focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
            />
        </div>
    );
}
