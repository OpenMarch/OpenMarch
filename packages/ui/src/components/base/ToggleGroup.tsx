import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import type {
    ToggleGroupMultipleProps as RadixToggleGroupMultipleProps,
    ToggleGroupSingleProps as RadixToggleGroupSingleProps,
    ToggleGroupItemProps as RadixToggleGroupItemProps,
} from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import React, { createContext, useContext } from "react";

type ToggleGroupSize = "sm" | "md" | "lg";

interface BaseToggleGroupProps {
    /** Optional className for custom styling */
    className?: string;
    /** Size variant of the toggle group */
    size?: ToggleGroupSize;
    /** Optional aria-label for accessibility */
    "aria-label"?: string;
}

const ToggleGroupContext = createContext<ToggleGroupSize>("md");

/**
 * Root component for the ToggleGroup.
 * Wraps Radix UI's ToggleGroup.Root with custom styling and functionality.
 */
export const ToggleGroupRoot = React.forwardRef<
    HTMLDivElement,
    (RadixToggleGroupSingleProps | RadixToggleGroupMultipleProps) &
        BaseToggleGroupProps
>(
    (
        { children, className, size = "md", "aria-label": ariaLabel, ...props },
        forwardedRef,
    ) => {
        const rootClasses = clsx(
            "inline-flex space-x-px border border-stroke rounded bg-fg-1  h-[35px] w-fit",
            {
                "h-[25px]": size === "sm",
                "h-[35px]": size === "md",
                "h-[45px]": size === "lg",
            },
            className,
        );

        return (
            <ToggleGroupContext.Provider value={size}>
                <RadixToggleGroup.Root
                    className={rootClasses}
                    ref={forwardedRef}
                    aria-label={ariaLabel}
                    {...props}
                >
                    {children}
                </RadixToggleGroup.Root>
            </ToggleGroupContext.Provider>
        );
    },
);

ToggleGroupRoot.displayName = "ToggleGroupRoot";

/**
 * Individual item component for the ToggleGroup.
 * Wraps Radix UI's ToggleGroup.Item with custom styling and functionality.
 */
export const ToggleGroupItem = React.forwardRef<
    HTMLButtonElement,
    Omit<RadixToggleGroupItemProps & BaseToggleGroupProps, "size">
>(({ children, className, ...props }, forwardedRef) => {
    const size = useContext(ToggleGroupContext);

    const itemClasses = clsx(
        "flex border-r border-stroke last:border-r-0 items-center justify-center leading-4 text-text first:rounded-l last:rounded-r hover:bg-white/20 focus:z-10 focus:shadow-[0_0_0_2px] focus:shadow-accent outline-none  ",
        "data-[state=on]:border-accent data-[state=on]:border data-[state=on]:bg-accent/40  ",
        {
            "px-[0.5rem] py-1 text-sm": size === "sm",
            "px-3 py-2": size === "md",
            "px-4 py-3 text-lg": size === "lg",
        },
        className,
    );

    return (
        <RadixToggleGroup.Item
            className={itemClasses}
            {...props}
            ref={forwardedRef}
        >
            {children}
        </RadixToggleGroup.Item>
    );
});

ToggleGroupItem.displayName = "ToggleGroupItem";
