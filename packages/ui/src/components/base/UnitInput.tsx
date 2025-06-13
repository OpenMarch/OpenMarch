import { clsx } from "clsx";
import React from "react";
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
            ...props
        },
        ref,
    ) => (
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
                ref={ref}
                type={type}
                step={step}
                {...props}
            />
        </div>
    ),
);
