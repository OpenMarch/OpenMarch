import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import type {
    ToggleGroupMultipleProps as RadixToggleGroupMultipleProps,
    ToggleGroupSingleProps as RadixToggleGroupSingleProps,
    ToggleGroupItemProps as RadixToggleGroupItemProps,
} from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import React from "react";

interface BaseToggleGroupProps {
    /** Optional className for custom styling */
    className?: string;
    /** Optional aria-label for accessibility */
    "aria-label"?: string;
}

/**
 * Root component for the ToggleGroup.
 * Wraps Radix UI's ToggleGroup.Root with custom styling and functionality.
 */
export const ToggleGroup = React.forwardRef<
    HTMLDivElement,
    (RadixToggleGroupSingleProps | RadixToggleGroupMultipleProps) &
        BaseToggleGroupProps
>(
    (
        { children, className, "aria-label": ariaLabel, ...props },
        forwardedRef,
    ) => {
        return (
            <RadixToggleGroup.Root
                className={clsx(
                    "border-stroke bg-fg-2 rounded-6 inline-flex h-[2.5rem] w-fit border",
                    className,
                )}
                ref={forwardedRef}
                aria-label={ariaLabel}
                {...props}
            >
                {children}
            </RadixToggleGroup.Root>
        );
    },
);

ToggleGroup.displayName = "ToggleGroup";

/**
 * Individual item component for the ToggleGroup.
 * Wraps Radix UI's ToggleGroup.Item with custom styling and functionality.
 */
export const ToggleGroupItem = React.forwardRef<
    HTMLButtonElement,
    Omit<RadixToggleGroupItemProps & BaseToggleGroupProps, "size">
>(({ children, className, ...props }, forwardedRef) => {
    return (
        <RadixToggleGroup.Item
            className={clsx(
                "border-stroke text-text flex items-center justify-center border-r px-6 outline-none first:rounded-l last:rounded-r last:border-r-0 hover:bg-white/20 focus:z-10",
                "data-[state=on]:border-accent data-[state=on]:border",
                className,
            )}
            {...props}
            ref={forwardedRef}
        >
            {children}
        </RadixToggleGroup.Item>
    );
});

ToggleGroupItem.displayName = "ToggleGroupItem";
