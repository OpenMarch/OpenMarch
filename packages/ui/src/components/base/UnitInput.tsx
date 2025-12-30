import { clsx } from "clsx";
import React, { useCallback, useImperativeHandle, useRef } from "react";
import { twMerge } from "tailwind-merge";

export type UnitInputProps = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type"
> & {
    className?: string;
    containerClassName?: string;
    compact?: boolean;
    unit: string;
    hidden?: boolean;
    type?: "number" | "text";
    step?: number;
    /**
     * Number of decimal places to normalize to when using arrow keys.
     * Prevents floating-point precision issues (e.g., 1.1993 + step becomes 1.1994 instead of 1.9939999999999).
     * Only applies when type="number".
     */
    decimalPrecision?: number;
};

/**
 * An input component that includes a unit descriptor.
 * Supports both text and number inputs with proper styling for number spinners.
 */
export const UnitInput = React.forwardRef<HTMLInputElement, UnitInputProps>(
    (
        {
            className,
            containerClassName,
            compact,
            unit,
            type = "number",
            step = 1,
            decimalPrecision,
            onChange,
            onKeyDown,
            ...props
        },
        ref,
    ) => {
        const inputRef = useRef<HTMLInputElement>(null);

        // Forward the ref
        useImperativeHandle(ref, () => inputRef.current!, []);

        // Normalize a value to the specified decimal precision
        const normalizeValue = useCallback(
            (value: number): number => {
                if (decimalPrecision === undefined) return value;
                const multiplier = Math.pow(10, decimalPrecision);
                return Math.floor(value * multiplier) / multiplier;
            },
            [decimalPrecision],
        );

        const handleKeyDown = useCallback(
            (e: React.KeyboardEvent<HTMLInputElement>) => {
                // Handle arrow keys for number inputs with decimal precision
                if (
                    type === "number" &&
                    decimalPrecision !== undefined &&
                    (e.key === "ArrowUp" || e.key === "ArrowDown")
                ) {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const currentValue = parseFloat(input.value);
                    if (isNaN(currentValue)) {
                        onKeyDown?.(e);
                        return;
                    }

                    // Increment or decrement by step
                    const newValue =
                        e.key === "ArrowUp"
                            ? currentValue + step
                            : currentValue - step;

                    // Normalize to avoid floating-point precision issues
                    const normalized = normalizeValue(newValue);

                    // Apply min/max constraints if provided
                    let clamped = normalized;
                    if (props.min !== undefined) {
                        clamped = Math.max(clamped, Number(props.min));
                    }
                    if (props.max !== undefined) {
                        clamped = Math.min(clamped, Number(props.max));
                    }

                    // Create a synthetic change event with the normalized value
                    const syntheticEvent = {
                        ...e,
                        target: {
                            ...input,
                            value: clamped.toString(),
                        },
                        currentTarget: {
                            ...input,
                            value: clamped.toString(),
                        },
                    } as unknown as React.ChangeEvent<HTMLInputElement>;

                    // Trigger onChange with the normalized value
                    // The parent component will update the value prop, causing a re-render
                    onChange?.(syntheticEvent);
                } else {
                    onKeyDown?.(e);
                }
            },
            [
                type,
                decimalPrecision,
                step,
                normalizeValue,
                onChange,
                onKeyDown,
                props.min,
                props.max,
            ],
        );

        return (
            <div
                className={twMerge(
                    clsx(
                        "relative",
                        "flex flex-row-reverse items-center gap-4",
                        "text-body text-text",
                        "disabled:opacity-50",
                        containerClassName,
                    ),
                )}
                hidden={props.hidden ?? false}
            >
                <span
                    className={twMerge(
                        clsx(
                            "text-body text-text-subtitle select-none",
                            type === "number" ? "mr-16" : "mr-12", // Extra space for number spinners
                            "absolute",
                        ),
                    )}
                >
                    {unit}
                </span>
                <input
                    className={twMerge(
                        clsx(
                            `rounded-6 border-stroke bg-fg-2 box-border min-h-0 w-full items-center border whitespace-nowrap focus-visible:outline-none ${compact ? "h-[1.625rem] px-8 py-[4px]" : "h-[2.5rem] px-22"} text-body text-text placeholder-text-subtitle placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                            // Hide default number input spinners for better styling
                            type === "number" &&
                                "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                            className,
                        ),
                    )}
                    style={{ backgroundColor: "transparent" }}
                    ref={inputRef}
                    type={type}
                    step={step}
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                    {...props}
                />
            </div>
        );
    },
);
