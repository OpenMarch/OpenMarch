import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "./Tooltip";

const variants = cva(
    [
        "text-body w-fit flex gap-4 justify-center items-center rounded-full border border-stroke min-h-0 focus-visible:outline-none",
        "enabled:hover:-translate-y-[2px] enabled:focus-visible:-translate-y-[2px] enabled:active:translate-y-4 duration-150 ease-out",
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
                className: ["h-[1.625rem] px-8 py-[4px]"],
            },
            {
                size: "default",
                content: "icon",
                className: ["p-8"],
            },
            {
                size: "compact",
                content: "icon",
                className: ["p-[4px] size-[1.625rem]"],
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

export const getButtonClassName = ({
    variant,
    size,
    content,
    className,
}: ButtonVariantProps & { className?: string }) =>
    twMerge(clsx(variants({ variant, size, content }), className));

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof variants> {
    variant?: "primary" | "secondary" | "red";
    size?: "default" | "compact";
    content?: "text" | "icon";
    tooltipText?: string;
    tooltipSide?: "top" | "bottom" | "left" | "right";
    tooltipDelay?: number;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            children,
            variant = "primary",
            size = "default",
            content = "text",
            className,
            tooltipText,
            tooltipSide = "bottom",
            tooltipDelay = 500,
            ...props
        },
        ref,
    ) => (
        <>
            {tooltipText !== undefined ? (
                <RadixTooltip.Provider>
                    <RadixTooltip.Root delayDuration={tooltipDelay}>
                        <RadixTooltip.Trigger
                            ref={ref}
                            className={getButtonClassName({
                                variant,
                                size,
                                content,
                                className,
                            })}
                            {...props}
                        >
                            {children}
                        </RadixTooltip.Trigger>
                        <TooltipContents side={tooltipSide}>
                            {tooltipText}
                        </TooltipContents>
                    </RadixTooltip.Root>
                </RadixTooltip.Provider>
            ) : (
                <button
                    className={getButtonClassName({
                        variant,
                        size,
                        content,
                        className,
                    })}
                    {...props}
                >
                    {children}
                </button>
            )}
        </>
    ),
);
