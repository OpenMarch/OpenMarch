import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import React from "react";

export interface SegmentedTextSwitchOption {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    testId?: string;
    /**
     * Wraps the option's own item, the focusable button, such as in a tooltip trigger (`asChild`),
     * so the tooltip opens on focus and describes the item to screen readers
     */
    wrap?: (item: React.ReactElement) => React.ReactNode;
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
                // Touch layout: finger-sized segments, the frame tight around them so the
                // switch grows as little as it can (tablet plan 2.2). It still wraps where it
                // has to; a switch that must stay on one line says so (`WorkspaceViewSwitch`)
                "bg-fg-1 border-stroke touch:p-2 inline-flex flex-wrap items-center gap-2 rounded-full border p-4",
                "shadow-inner",
                className,
            )}
            aria-label={ariaLabel}
            data-testid={testId}
        >
            {options.map((option) => {
                const item = (
                    <RadixToggleGroup.Item
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        data-testid={option.testId}
                        className={clsx(
                            "border-stroke/0 text-text-subtitle font text-sub border font-thin",
                            "touch:min-h-40 touch:px-10 touch:text-sub rounded-full px-6 py-2 transition-all duration-150 ease-out outline-none",
                            "focus-visible:ring-accent focus-visible:ring-offset-bg-1 focus-visible:ring-2 focus-visible:ring-offset-1",
                            // aria-checked, not data-state: an item wrapped in a tooltip trigger gets the tooltip's
                            // data-state, while the toggle group always sets aria-checked on a single choice
                            "aria-checked:text-text aria-checked:bg-fg-2 aria-checked:border-accent",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            "hover:text-accent",
                            itemClassName,
                        )}
                    >
                        {option.label}
                    </RadixToggleGroup.Item>
                );
                return option.wrap ? (
                    <React.Fragment key={option.value}>
                        {option.wrap(item)}
                    </React.Fragment>
                ) : (
                    item
                );
            })}
        </RadixToggleGroup.Root>
    );
}
