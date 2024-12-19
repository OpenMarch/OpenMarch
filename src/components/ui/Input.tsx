import { clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    className?: string;
    compact?: boolean;
};

export const Input = ({ className, compact, ...props }: InputProps) => {
    return (
        <input
            {...props}
            style={{
                backgroundColor: "transparent",
            }}
            className={twMerge(
                clsx(
                    `box-border min-h-0 items-center whitespace-nowrap rounded-6 border border-stroke bg-fg-2 focus-visible:outline-none ${compact ? "h-[1.625rem] px-8 py-[4px]" : "h-[2.5rem] px-22"} text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                    className,
                ),
            )}
        />
    );
};
