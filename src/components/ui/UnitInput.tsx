import { clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export type UnitInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    className?: string;
    containerClassName?: string;
    compact?: boolean;
    unit: string;
};

/**
 * An text input component that includes a unit descriptor.
 */
export const UnitInput = React.forwardRef<HTMLInputElement, UnitInputProps>(
    ({ className, containerClassName, compact, unit, ...props }, ref) => (
        <div
            className={twMerge(
                clsx(
                    "flex flex-row-reverse items-center gap-4",
                    "text-body text-text",
                    "disabled:opacity-50",
                    containerClassName,
                ),
            )}
        >
            <span className="absolute mr-12 select-none text-body text-text">
                {unit}
            </span>
            <input
                className={twMerge(
                    clsx(
                        `box-border min-h-0 w-full items-center whitespace-nowrap rounded-6 border border-stroke bg-fg-2 focus-visible:outline-none ${compact ? "h-[1.625rem] px-8 py-[4px]" : "h-[2.5rem] px-22"} text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                        "",
                        className,
                    ),
                )}
                style={{ backgroundColor: "transparent" }}
                ref={ref}
                type="text"
                {...props}
            />
        </div>
    ),
);
