import React from "react";
import { clsx } from "clsx";

export type InputProps = React.HTMLAttributes<HTMLInputElement>;

export const Input = ({
    className,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className: string }) => {
    return (
        <input
            {...props}
            className={clsx(
                "flex h-[2.5rem] items-center rounded-6 border border-stroke bg-transparent bg-fg-2 px-22 text-body text-text placeholder-text/50 outline-1 outline-accent placeholder:text-body focus:border-accent disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        />
    );
};
