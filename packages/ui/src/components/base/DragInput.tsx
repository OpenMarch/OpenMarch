/* eslint-disable no-unused-vars */
import { clsx } from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ArrowsDownUpIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";

export type DragInputProps = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange"
> & {
    /**
     * Additional class name(s) for the input element.
     */
    className?: string;
    /**
     * Additional class name(s) for the container div.
     */
    containerClassName?: string;
    /**
     * If true, renders a more compact input style.
     */
    compact?: boolean;
    /**
     * Optional unit label to display (e.g., 'px', '%').
     */
    unit?: string;
    /**
     * Optional number of decimal places to round the value to.
     */
    roundTo?: number;
    /**
     * Optional value to round to the nearest multiple of (e.g., 10, 15).
     */
    roundToNearest?: number;
    /**
     * Optional value to round to the nearest multiple of (e.g., 10, 15) when Shift is pressed during drag.
     */
    roundToNearestWithShift?: number;
    /**
     * The current value of the input (number or string).
     */
    value: number | string | undefined;
    /**
     * Called when the value changes via typing or blur (not drag).
     * Receives the new value and the triggering event (if available).
     */
    onChange?: (
        value: number,
        event?:
            | React.ChangeEvent<HTMLInputElement>
            | React.FocusEvent<HTMLInputElement>,
    ) => void;
    /**
     * Called continuously as the value changes during dragging.
     * Receives the new value and the triggering MouseEvent.
     */
    onDragChange?: (value: number, event: MouseEvent) => void;
    /**
     * Called once when dragging ends, with the final value and the MouseEvent.
     */
    onDragEnd?: (value: number, event: MouseEvent) => void;
    /**
     * Sensitivity multiplier for drag-to-change (higher = faster changes). Default is 0.5.
     */
    dragSensitivity?: number;
    /**
     * Sensitivity multiplier for drag-to-change when Shift is pressed.
     */
    dragSensitivityWithShift?: number;
    /**
     * Axis to drag for value change: 'x' (horizontal) or 'y' (vertical).
     */
    dragAxis?: "x" | "y";
    /**
     * Optional custom icon component to use instead of the default ArrowsDownUpIcon.
     * Should be a Phosphor icon component or a component with similar props.
     */
    icon?: React.ComponentType<IconProps>;
};

/**
 * An input component that allows changing values by dragging.
 * - Users can manually input a number, with changes reflected on blur
 * - Users can click on the icon and drag up/down to change the value
 * - Provides callbacks for continuous changes during dragging and final value on mouse up
 */
export const DragInput = React.forwardRef<HTMLInputElement, DragInputProps>(
    (
        {
            className,
            containerClassName,
            compact,
            unit,
            value,
            onChange,
            onDragChange,
            onDragEnd,
            step = 1,
            min,
            max,
            dragSensitivity = 0.5,
            dragSensitivityWithShift,
            dragAxis = "y",
            icon: Icon,
            roundTo,
            roundToNearest,
            roundToNearestWithShift,
            ...props
        },
        ref,
    ) => {
        const [isDragging, setIsDragging] = useState(false);
        const startValue = useRef(0);
        const [localValue, setLocalValue] = useState(value?.toString());
        const inputRef = useRef<HTMLInputElement>(null);
        const combinedRef = useCombinedRefs(ref, inputRef);
        // Track the last mouse position and shift state during drag
        const lastDragState = useRef<{
            x: number;
            y: number;
            shift: boolean;
            value: number;
        }>({
            x: 0,
            y: 0,
            shift: false,
            value: 0,
        });

        // Helper to round a value based on shift key and props
        const applyRounding = useCallback(
            (val: number, shift?: boolean) => {
                if (
                    shift &&
                    typeof roundToNearestWithShift === "number" &&
                    roundToNearestWithShift > 0
                ) {
                    return (
                        Math.round(val / roundToNearestWithShift) *
                        roundToNearestWithShift
                    );
                } else if (
                    typeof roundToNearest === "number" &&
                    roundToNearest > 0
                ) {
                    return Math.round(val / roundToNearest) * roundToNearest;
                } else if (typeof roundTo === "number") {
                    return Number(val.toFixed(roundTo));
                } else {
                    return val;
                }
            },
            [roundTo, roundToNearest, roundToNearestWithShift],
        );

        // Update local value when prop value changes, but not while dragging
        useEffect(() => {
            if (!isDragging) {
                const displayValue =
                    value !== undefined && value !== null
                        ? value.toString() // No rounding here
                        : "";
                setLocalValue(displayValue);
            }
        }, [value, isDragging]);

        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const inputValue = e.target.value;
            if (inputValue === "" || /^-?\d*\.?\d*$/.test(inputValue)) {
                setLocalValue(inputValue);
                const newValue = parseFloat(inputValue);
                if (!isNaN(newValue)) {
                    // No rounding here
                    onChange?.(newValue, e);
                }
            }
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            if (localValue === "") {
                onChange?.(0, e);
                setLocalValue("0");
            } else {
                const newValue = parseFloat(localValue ?? "");
                if (!isNaN(newValue)) {
                    // No rounding here
                    onChange?.(newValue, e);
                }
            }
        };

        const handleMouseDown = useCallback(
            (e: React.MouseEvent) => {
                e.preventDefault();
                setIsDragging(true);
                const startVal = parseFloat(value?.toString() ?? "0");
                startValue.current = startVal;
                // Initialize lastDragState
                lastDragState.current = {
                    x: e.clientX,
                    y: e.clientY,
                    shift: e.shiftKey,
                    value: startVal,
                };
            },
            [value],
        );

        const handleMouseMove = useCallback(
            (e: MouseEvent) => {
                if (!isDragging) return;

                const prev = lastDragState.current;
                const currShift = e.shiftKey;
                let stepNum =
                    typeof step === "number"
                        ? step
                        : parseFloat(step.toString());
                let sensitivity =
                    currShift && typeof dragSensitivityWithShift === "number"
                        ? dragSensitivityWithShift
                        : dragSensitivity;

                // If shift state changed, reset baseline
                if (currShift !== prev.shift) {
                    lastDragState.current = {
                        x: e.clientX,
                        y: e.clientY,
                        shift: currShift,
                        value: parseFloat(localValue ?? "0"),
                    };
                    return; // Don't update value on the exact shift toggle event
                }

                let delta = 0;
                if (dragAxis === "y") {
                    delta = prev.y - e.clientY;
                } else {
                    delta = e.clientX - prev.x;
                }
                let valueChange = (delta * sensitivity) / stepNum;
                let newValue = prev.value + valueChange;

                // Apply min/max constraints
                const minNum =
                    min !== undefined
                        ? typeof min === "number"
                            ? min
                            : parseFloat(min.toString())
                        : undefined;
                const maxNum =
                    max !== undefined
                        ? typeof max === "number"
                            ? max
                            : parseFloat(max.toString())
                        : undefined;
                if (minNum !== undefined) newValue = Math.max(minNum, newValue);
                if (maxNum !== undefined) newValue = Math.min(maxNum, newValue);
                newValue = applyRounding(newValue, currShift);
                onDragChange?.(newValue, e);
                setLocalValue(newValue.toString());
            },
            [
                isDragging,
                dragAxis,
                dragSensitivity,
                dragSensitivityWithShift,
                step,
                min,
                max,
                onDragChange,
                applyRounding,
                localValue,
            ],
        );

        const handleMouseUp = useCallback(
            (e: MouseEvent) => {
                // This function is now only responsible for handling the end of a drag operation.
                // The removal of event listeners is handled by the useEffect hook.
                if (!isDragging) return;

                setIsDragging(false);

                // Get the final value and call onDragEnd
                let finalValue = parseFloat(localValue ?? "0");
                finalValue = applyRounding(finalValue, e.shiftKey);
                startValue.current = finalValue;
                if (!isNaN(finalValue)) {
                    onDragEnd?.(finalValue, e);
                }
            },
            [isDragging, localValue, onDragEnd, applyRounding],
        );

        // Effect to add/remove global event listeners for dragging
        useEffect(() => {
            if (isDragging) {
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
            } else {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            }

            // Cleanup function to remove listeners when the component unmounts
            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }, [isDragging, handleMouseMove, handleMouseUp]); // Need start value in here

        const DragIcon =
            Icon || (dragAxis === "x" ? ArrowsLeftRightIcon : ArrowsDownUpIcon);

        return (
            <div
                className={twMerge(
                    clsx(
                        "relative",
                        "flex items-center",
                        "text-body text-text",
                        "disabled:opacity-50",
                        containerClassName,
                    ),
                )}
            >
                {unit && (
                    <span className="text-body text-text-subtitle absolute right-12 select-none">
                        {unit}
                    </span>
                )}
                <div className="relative w-full">
                    <div
                        className={clsx(
                            "absolute top-0 left-0 flex h-full items-center justify-center px-8",
                            dragAxis === "y"
                                ? "cursor-ns-resize"
                                : "cursor-ew-resize",
                            isDragging
                                ? "text-accent"
                                : "text-text-subtitle hover:text-accent",
                        )}
                        onMouseDown={handleMouseDown}
                    >
                        <DragIcon size={16} />
                    </div>
                    <input
                        className={twMerge(
                            clsx(
                                `rounded-6 border-stroke bg-fg-2 box-border min-h-0 w-full items-center border whitespace-nowrap focus-visible:outline-none ${
                                    compact
                                        ? "h-[1.625rem] py-[4px] pr-8 pl-32"
                                        : "h-[2.5rem] pr-16 pl-32"
                                } ${unit ? "pr-22" : ""} text-body text-text placeholder-text-subtitle placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                                isDragging && "border-accent",
                                className,
                            ),
                        )}
                        style={{ backgroundColor: "transparent" }}
                        ref={combinedRef}
                        type="text"
                        inputMode="decimal"
                        value={localValue}
                        onChange={handleInputChange}
                        onBlur={handleBlur}
                        step={step}
                        min={min}
                        max={max}
                        {...props}
                    />
                </div>
            </div>
        );
    },
);

// Helper function to combine refs
function useCombinedRefs<T>(...refs: React.Ref<T>[]) {
    const targetRef = React.useRef<T>(null);

    React.useEffect(() => {
        refs.forEach((ref) => {
            if (!ref) return;

            if (typeof ref === "function") {
                ref(targetRef.current);
            } else {
                (ref as React.MutableRefObject<T | null>).current =
                    targetRef.current;
            }
        });
    }, [refs]);

    return targetRef;
}
