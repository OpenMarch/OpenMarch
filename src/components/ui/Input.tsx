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
                `flex h-fit w-fit items-center rounded-6 border border-stroke bg-transparent bg-fg-2 ${compact ? "px-10 py-2" : "px-22 py-[11px]"} text-body text-text placeholder-text/50 outline-1 outline-accent placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50`,
                className,
            )}
        />
    );
};
