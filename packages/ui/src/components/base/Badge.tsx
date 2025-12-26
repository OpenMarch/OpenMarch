import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const variants = cva(
    [
        "text-sub w-fit flex gap-4 leading-none px-6 py-[2px] justify-center items-center rounded-6 border border-stroke min-h-0",
    ],
    {
        variants: {
            variant: {
                primary: ["bg-accent text-text-invert"],
                secondary: ["bg-fg-2 text-text"],
                red: ["bg-red text-text-invert"],
            },
        },
        defaultVariants: {
            variant: "primary",
        },
    },
);

export type BadgeVariantProps = VariantProps<typeof variants>;

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof variants> {
    children?: React.ReactNode;
    className?: string;
    variant?: "primary" | "secondary" | "red";
}

export const Badge = ({
    children,
    variant = "primary",
    className,
    ...props
}: BadgeProps) => (
    <div className={twMerge(clsx(variants({ variant }), className))} {...props}>
        {children}
    </div>
);
