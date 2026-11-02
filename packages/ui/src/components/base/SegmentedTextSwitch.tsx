import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import React from "react";

export interface SegmentedTextSwitchOption {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    testId?: string;
}

interface SegmentedTextSwitchProps {
    options: SegmentedTextSwitchOption[];
    selected: string;
    setSelected: (value: string) => void;
    className?: string;
    itemClassName?: string;
    /** The switch's name for screen readers, already translated (the package has no translations). */
    ariaLabel: string;
    testId?: string;
}

export function SegmentedTextSwitch({
    options,
    selected,
    setSelected,
    className,
    itemClassName,
    ariaLabel,
    testId,
}: SegmentedTextSwitchProps) {
    return (
        <RadixToggleGroup.Root
            type="single"
            value={selected}
            onValueChange={(value) => {
                // Radix sends empty string when toggling off the active option.
                if (value) setSelected(value);
            }}
            className={clsx(
                "bg-fg-1 border-stroke inline-flex flex-wrap items-center gap-2 rounded-[24px] border p-4",
                "shadow-inner",
                className,
            )}
            aria-label={ariaLabel}
            data-testid={testId}
        >
            {options.map((option) => (
                <RadixToggleGroup.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    data-testid={option.testId}
                    className={clsx(
                        "border-stroke/0 text-text-subtitle font border text-xs font-thin",
                        "rounded-full px-6 py-2 transition-all duration-150 ease-out outline-none",
                        "focus-visible:ring-accent focus-visible:ring-offset-bg-1 focus-visible:ring-2 focus-visible:ring-offset-1",
                        "data-[state=on]:text-text data-[state=on]:bg-fg-2 data-[state=on]:border-accent",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        "hover:text-accent",
                        itemClassName,
                    )}
                >
                    {option.label}
                </RadixToggleGroup.Item>
            ))}
        </RadixToggleGroup.Root>
    );
}
