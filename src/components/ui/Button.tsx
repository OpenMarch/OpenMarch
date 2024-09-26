import React from "react";
import { cva, VariantProps } from "class-variance-authority";

const variants = cva(
    [
        "text-body px-24 py-10 h-[2.5rem] w-fit flex justify-center flex-center rounded-full border border-stroke outline-white",
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
        },
        defaultVariants: {
            variant: "primary",
        },
    },
);

export type ButtonVariantProps = VariantProps<typeof variants>;

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof variants> {
    variant?: "primary" | "secondary" | "red";
}
export function Button({ children, variant, ...props }: ButtonProps) {
    return (
        <button className={variants({ variant })} {...props}>
            {children}
        </button>
    );
}
