import { clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    className?: string;
    compact?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, compact, ...props }, ref) => (
        <input
            className={twMerge(
                clsx(
                    `rounded-6 border-stroke bg-fg-2 box-border min-h-0 items-center border whitespace-nowrap focus-visible:outline-hidden ${compact ? "h-[1.625rem] px-8 py-[4px]" : "h-[2.5rem] px-22"} text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                    className,
                ),
            )}
            style={{ backgroundColor: "transparent" }}
            ref={ref}
            {...props}
        />
    ),
);
