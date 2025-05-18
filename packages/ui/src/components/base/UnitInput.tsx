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
            <span className="text-body text-text absolute mr-12 select-none">
                {unit}
            </span>
            <input
                className={twMerge(
                    clsx(
                        `rounded-6 border-stroke bg-fg-2 box-border min-h-0 w-full items-center border whitespace-nowrap focus-visible:outline-none ${compact ? "h-[1.625rem] px-8 py-[4px]" : "h-[2.5rem] px-22"} text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
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
