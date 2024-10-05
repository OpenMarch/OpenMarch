import React from "react";
import { cva, VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const variants = cva(
    [
        "text-body w-fit flex justify-center flex-center rounded-full border border-stroke outline-white",
        "enabled:hover:-translate-y-[2px] enabled:active:translate-y-4 duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
    ],
    {
        variants: {
            variant: {
                primary: ["bg-accent text-text-invert"],
                secondary: ["bg-fg-2 text-text"],
                red: ["bg-red text-text-invert "],
            },
            size: {
                default: [""],
                compact: [""],
            },
            content: {
                text: [""],
                icon: [""],
            },
        },
        compoundVariants: [
            {
                size: "default",
                content: "text",
                className: ["px-24 py-[11px]"],
            },
            {
                size: "compact",
                content: "text",
                className: ["px-10 py-4"],
            },
            {
                size: "default",
                content: "icon",
                className: ["p-8"],
            },
            {
                size: "compact",
                content: "icon",
                className: ["p-4"],
            },
        ],
        defaultVariants: {
            variant: "primary",
            size: "default",
            content: "text",
        },
    },
);

export type ButtonVariantProps = VariantProps<typeof variants>;

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof variants> {
    variant?: "primary" | "secondary" | "red";
    size?: "default" | "compact";
    content?: "text" | "icon";
}
export function Button({
    children,
    variant,
    size,
    content,
    className,
    ...props
}: ButtonProps) {
    return (
        <button
            className={twMerge(
                clsx(variants({ variant, size, content }), className),
            )}
            {...props}
        >
            {children}
        </button>
    );
}
