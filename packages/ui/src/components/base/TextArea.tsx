import clsx from "clsx";
import React from "react";

interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={clsx(
                    "border-stroke",
                    "placeholder:text-text-subtitle",
                    "flex",
                    "min-h-[80px]",
                    "w-full",
                    "rounded-md",
                    "border",
                    "bg-fg-2",
                    "px-3",
                    "py-2",
                    "text-body",
                    "focus-visible:ring",
                    "focus-visible:ring-accent",
                    "focus-visible:outline-none",
                    "disabled:cursor-not-allowed",
                    "disabled:opacity-50",
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);

TextArea.displayName = "TextArea";

export { TextArea };
