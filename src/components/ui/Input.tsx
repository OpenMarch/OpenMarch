import React from "react";
import { clsx } from "clsx";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    className?: string;
    compact?: boolean;
};

export const Input = ({ className, compact, ...props }: InputProps) => {
    return (
        <input
            {...props}
            className={clsx(
                `inline-block w-fit min-w-0 max-w-fit items-center rounded-6 border border-stroke bg-transparent bg-fg-2 focus-visible:outline-none ${compact ? "px-10 py-2" : "h-[2.5rem] px-22"} text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                className,
            )}
        />
    );
};
